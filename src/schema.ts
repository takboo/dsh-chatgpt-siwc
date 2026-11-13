import { z } from 'zod/mini'

export const actionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(['read', 'cancel', 'reload', 'confirm']) }),
  z.strictObject({ type: z.literal('login'), id: z.optional(z.uuid()) }),
  z.strictObject({ type: z.enum(['activate', 'logout']), id: z.uuid() }),
])

export const resultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    view: z.strictObject({
      available: z.boolean(),
      authorizing: z.boolean(),
      accounts: z.array(z.strictObject({
        id: z.uuid(),
        displayName: z.optional(z.string()),
        status: z.enum(['connected', 'identityOnly', 'signedOut', 'reauthorize']),
      })),
      active: z.nullable(z.uuid()),
      confirmPlan: z.boolean(),
      models: z.nullable(z.array(z.strictObject({ id: z.string(), name: z.string() }))),
    }),
    revocation: z.optional(z.enum(['confirmed', 'unconfirmed', 'localOnly'])),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string().check(z.regex(/^[a-zA-Z]+$/)) }),
])
