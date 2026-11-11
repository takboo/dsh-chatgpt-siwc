import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'test/p0/**'] },
  ...tseslint.configs.recommended,
]
