import assert from 'node:assert/strict'
import { test } from 'node:test'
import WebRuntime from '@deepseek-ai/dsh-web'
import { sse } from '../p0/sse.mjs'
import { fixture, harness, resource } from '../p2/fixtures.mjs'

const citation = (url, title) => ({ type: 'url_citation', url, title })
const source = citation('https://www.rfc-editor.org/rfc/rfc9110.html', 'RFC 9110')
const other = citation('https://datatracker.ietf.org/doc/rfc9110/', 'IETF')
const done = (output_index, item) => ({ type: 'response.output_item.done', output_index, item })
const search = { type: 'web_search_call', id: 'ws_fixture', status: 'completed' }
const message = {
  type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: 'HTTP 404 Not Found.', annotations: [source, citation('javascript:void(0)', 'Invalid')] }],
}
const complete = output => ({ type: 'response.completed', response: { output, status: 'completed' } })
const annotation = (annotation, item_id = message.id) => ({
  type: 'response.output_text.annotation.added', output_index: 1, content_index: 0, item_id, annotation,
})

test('native web selection calls one provider and SIWC resolves completed stream items into search results', async t => {
  const { state, dependencies } = fixture()
  state.models.push({ slug: 'search-model', display_name: 'Search model', visibility: 'list',
    supports_search_tool: true, supported_reasoning_levels: [{ effort: 'low' }] })
  state.models[0].supports_search_tool = 'true'
  state.models[1].supports_search_tool = true // hidden
  let enabled = false
  let otherSearches = 0
  const upstream = dependencies.fetch
  const captured = []
  let response = () => sse(annotation(other), done(1, message), annotation(other, 'unrelated'), done(0, search), complete([]))
  dependencies.fetch = async (input, init) => {
    if (String(input) !== resource + '/responses') return upstream(input, init)
    const request = new Request(input, init)
    captured.push({ body: await request.json(), sessionId: request.headers.get('session-id') })
    return response()
  }
  const { ctx, accounts, plugin } = await harness(t, dependencies, undefined, { searchEnabled: () => enabled })
  const web = ctx.plugin(WebRuntime, { searchProvider: 'deepseek-fixture' })
  await web
  const remove = ctx.web.registerSearchProvider({ id: 'deepseek-fixture', available: () => true,
    async search() { otherSearches++; return { sources: [], truncated: false } } })
  t.after(async () => { remove(); await web.dispose() })
  const query = { query: 'What does RFC 9110 say about HTTP 404?', maxResults: 1 }
  await ctx.web.search(query)
  assert.equal(otherSearches, 1)
  assert.equal(captured.length, 0)

  await web.update({ searchProvider: 'chatgpt-siwc' })
  await assert.rejects(ctx.web.search(query), { code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' })
  enabled = true
  assert.equal(await ctx.web.searchReady('deepseek-account'), false)
  await accounts.login()
  assert.equal(await ctx.web.searchReady('deepseek-account'), true)
  assert.deepEqual(await ctx.web.search(query), { content: 'HTTP 404 Not Found.', sources: [
    { url: source.url, title: source.title },
  ], truncated: true })
  assert.equal(captured.length, 1)
  assert.equal(otherSearches, 1)
  assert.deepEqual(captured[0].body, {
    model: 'search-model', instructions: captured[0].body.instructions,
    input: [{ role: 'user', content: query.query }], tools: [{ type: 'web_search' }], tool_choice: 'auto',
    store: false, stream: true, reasoning: { effort: 'low' },
  })
  assert.equal(captured[0].sessionId, null)

  response = () => sse(annotation(source), done(0, search), done(1, message), complete([search, message]))
  assert.deepEqual((await ctx.web.search({ query: query.query })).sources, [{ url: source.url, title: source.title }])
  response = () => sse(done(0, search), done(1, message))
  await assert.rejects(ctx.web.search(query), { code: 'TRANSPORT' })
  response = () => sse(done(0, search), done(1, message), { type: 'response.failed', response: { error: { code: 'server_error' } } })
  await assert.rejects(ctx.web.search(query), { code: 'SERVER' })
  response = () => sse(complete([message]))
  await assert.rejects(ctx.web.search(query), { code: 'INVALID_RESPONSE' })
  assert.equal(captured.length, 5)
  assert.equal(otherSearches, 1)

  state.models.pop()
  await accounts.models(true)
  await assert.rejects(ctx.web.search(query), { code: 'UNSUPPORTED_OPTION' })
  assert.equal(captured.length, 5)
  await plugin.dispose()
  await assert.rejects(ctx.web.search(query), { code: 'WEB_PROVIDER_CONFIGURED_MISSING' })
})
