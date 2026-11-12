import { createHmac } from 'node:crypto'
import { attributionHeaders, CONTEXT_WINDOW_EXCEEDED_CODE, LlmError, ProviderRequestId, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import OpenAI from 'openai'
import type { InferenceGrant } from './accounts.js'
import type { SiwcReasoningEffort } from './catalog.js'
import { resource, SiwcFault } from './oauth.js'
import { prepareResponse } from './responses-request.js'
import type { ReadRequestImage } from './responses-request.js'
import { settleResponses } from './responses-stream.js'

const endpoint = resource + '/responses'
const timeoutMs = 120_000

function responseFacts(status?: number, headers?: Headers) {
  const id = headers?.get('x-request-id')
  const requestId = id && /^req_[A-Za-z0-9_-]{1,128}$/.test(id) ? ProviderRequestId(id) : undefined
  return {
    ...(status === undefined ? {} : { status }),
    ...(requestId === undefined ? {} : { requestId }),
  }
}

function providerFailure(code: string | undefined, status?: number, headers?: Headers): LlmError {
  const retry = headers?.get('retry-after')
  const retryMs = retry && /^\d{1,7}$/.test(retry) ? Number(retry) * 1000 : undefined
  const facts = {
    ...responseFacts(status, headers),
    ...(retryMs ? { providerRetryAfterMs: retryMs } : {}),
  }
  if (code === 'subscription_sharing_usage_limit_exceeded') {
    return new LlmError('A ChatGPT usage limit was reached. Check ChatGPT usage settings.', QUOTA_EXCEEDED_CODE, facts)
  }
  if (status === 401 || code === 'invalid_token') {
    return new LlmError('ChatGPT authorization is no longer valid. Sign in again.', 'AUTH', facts)
  }
  if (code === 'subscription_sharing_unsupported_capability') {
    return new LlmError('The ChatGPT route rejected an unsupported request capability.', 'UNSUPPORTED_OPTION', facts)
  }
  if (code === 'context_length_exceeded' || code === 'context_window_exceeded') {
    return new LlmError('The request exceeded the ChatGPT model context window.', CONTEXT_WINDOW_EXCEEDED_CODE, facts)
  }
  if (status === 403 || code === 'chatpass_v2_scope_not_authorized' ||
    code === 'chatpass_v2_invalid_authorization_context' || code === 'subscription_sharing_route_not_supported') {
    return new LlmError('This ChatGPT authorization does not permit the request.', 'PERMISSION', facts)
  }
  if (status === 429 || code === 'rate_limit_exceeded') {
    return new LlmError('ChatGPT is temporarily rate limiting requests.', 'RATE_LIMIT', facts)
  }
  if ((status !== undefined && status >= 500) || code === 'subscription_sharing_usage_unavailable' ||
    code === 'subscription_sharing_user_unavailable' || code === 'server_error') {
    return new LlmError('ChatGPT is temporarily unavailable.', 'SERVER', facts)
  }
  if (code === 'incomplete') return new LlmError('ChatGPT did not complete the response.', 'INCOMPLETE_RESPONSE', facts)
  return new LlmError('ChatGPT could not complete the request.', 'PROVIDER_ERROR', facts)
}

export async function* responses(
  options: GenerateOptions, grant: InferenceGrant | undefined, fetch: typeof globalThis.fetch | undefined,
  reasoningEfforts: readonly SiwcReasoningEffort[], readImage?: ReadRequestImage,
): AsyncGenerator<StreamChunk> {
  if (options.purpose !== undefined || options.temperature !== undefined || options.maxTokens !== undefined ||
    options.stop !== undefined) {
    throw new LlmError('This request option or purpose is unsupported by ChatGPT plan usage.', 'UNSUPPORTED_OPTION')
  }
  const effort = reasoningEfforts.find(effort => effort === options.reasoningEffort)
  if (options.reasoningEffort !== undefined && effort === undefined) {
    throw new LlmError('This reasoning effort is unavailable for the selected ChatGPT model.', 'UNSUPPORTED_REASONING_EFFORT')
  }
  if (!fetch) throw new LlmError('ChatGPT inference is unavailable in this build.', 'SIWC_UNAVAILABLE')
  if (!grant) throw new LlmError('Connect a ChatGPT account with plan access before requesting inference.', 'AUTH')
  const operation = new AbortController()
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), timeoutMs)
  timer.unref()
  const signal = AbortSignal.any([operation.signal, deadline.signal, grant.signal, ...(options.signal ? [options.signal] : [])])
  let upstream: Response | undefined
  try {
    const request = await prepareResponse(options, grant.registration, effort, signal, readImage)
    signal.throwIfAborted()
    const token = await grant.access(signal)
    const headers = attributionHeaders()
    if (options.sessionId !== undefined) {
      headers['session-id'] = createHmac('sha256', grant.registration).update(options.sessionId).digest('hex')
    }
    const sdk = new OpenAI({
      apiKey: token, baseURL: resource, maxRetries: 0, organization: null, project: null, logLevel: 'off',
      defaultHeaders: headers, fetchOptions: { redirect: 'error' },
      fetch: async (input, init) => {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
        if (url !== endpoint || init?.method !== 'POST') {
          throw new LlmError('The ChatGPT transport rejected an unexpected request target.', 'INVALID_REQUEST')
        }
        const response = await fetch(input, { ...init, redirect: 'error' })
        if (response.redirected || (response.url && response.url !== endpoint)) {
          await response.body?.cancel().catch(() => {})
          throw new LlmError('The ChatGPT transport rejected a redirect.', 'INVALID_RESPONSE')
        }
        return response
      },
    })
    const { data, response } = await sdk.responses.create(request.body, { signal }).withResponse()
    upstream = response
    const contentType = response.headers.get('content-type')
    if (contentType !== null && !/^text\/event-stream(?:\s*;|$)/i.test(contentType)) {
      await response.body?.cancel().catch(() => {})
      throw new LlmError('ChatGPT did not return a Responses event stream.', 'INVALID_RESPONSE')
    }
    yield* settleResponses(data, request.offered, request.historyCalls, grant.registration, signal, grant.assertCurrent,
      code => providerFailure(code, response.status, response.headers), contentType !== null)
  } catch (error) {
    if (deadline.signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new LlmError('The ChatGPT request timed out.', 'TIMEOUT')
    }
    if (signal.aborted || (error instanceof SiwcFault && (error.code === 'stale' || error.code === 'cancelled'))) {
      throw new LlmError('The ChatGPT request was cancelled.', 'ABORTED')
    }
    if (error instanceof LlmError) {
      if (upstream && error.failure.status === undefined) {
        throw new LlmError(error.message, error.code, { ...responseFacts(upstream.status, upstream.headers), ...error.failure })
      }
      throw error
    }
    if (error instanceof SiwcFault) {
      const code = error.code === 'reauthorize' || error.code === 'permission' ? 'AUTH' : 'TRANSPORT'
      throw new LlmError('ChatGPT authorization could not be obtained for this request.', code)
    }
    if (error instanceof OpenAI.APIError && !(error instanceof OpenAI.APIConnectionError)) {
      throw providerFailure(error.code ?? undefined, error.status ?? upstream?.status, error.headers ?? upstream?.headers)
    }
    if (error instanceof SyntaxError) {
      throw new LlmError('ChatGPT returned a malformed stream event.', 'INVALID_RESPONSE',
        responseFacts(upstream?.status, upstream?.headers))
    }
    throw new LlmError('The ChatGPT transport could not complete the request.', 'TRANSPORT',
      responseFacts(upstream?.status, upstream?.headers))
  } finally {
    clearTimeout(timer)
    operation.abort()
  }
}
