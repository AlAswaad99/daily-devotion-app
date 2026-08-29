// Next 16 removed `next lint`; eslint-config-next now ships flat configs directly,
// so no FlatCompat shim is needed.
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...typescript,
]

export default config
