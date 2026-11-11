import type { InvocationDescriptor, TypertSchema } from '@deepseek-ai/dsh-typert-protocol'
import { packageName } from './identity.js'
import { actionSchema, resultSchema } from './schema.js'

export const settingsService = 'chatgptSiwc'
function strict<T>(name: string, schema: TypertSchema<T>) {
  return {
    mode: 'strict',
    typeSymbol: `${packageName}#${name}`,
    schema,
    create: () => schema,
    decode: (value: unknown) => schema.parse(value),
    encode: (value: unknown) => schema.parse(value),
  } as const
}

export const settingsDescriptor = {
  id: `${packageName}#${settingsService}/settings`,
  service: settingsService,
  namespace: settingsService,
  method: 'settings',
  invocation: { kind: 'direct' },
  parameters: [{ name: 'action', wire: 'action', source: 'json', codec: strict('SettingsAction', actionSchema) }],
  result: strict('SettingsResult', resultSchema),
} satisfies InvocationDescriptor
