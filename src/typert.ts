import { packageName } from './identity.js'
import { settingsDescriptor } from './remote.js'

export const TYPERT = {
  package: packageName,
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: [settingsDescriptor],
} as const
