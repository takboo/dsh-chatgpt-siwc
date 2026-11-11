import { attachAccounts } from '../../dist/index.js'

export const inject = ['llm', 'credentials', 'authorization', 'siwcFixture']

export function apply(ctx) {
  const fixture = ctx.get('siwcFixture')
  fixture.accounts = attachAccounts(ctx, fixture.dependencies)
}
