import { build } from 'esbuild'

// api/index.ts をバンドルして api/index.js に出力
// (api/index.ts はビルド後に削除し、api/index.js のみ残す)
await build({
  entryPoints: ['src/app.ts'],
  bundle: true,
  outfile: 'api/index.js',
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // @libsql/client はネイティブモジュールを含むので外部化
  external: [
    '@libsql/client',
    '@libsql/linux-x64-gnu',
    '@libsql/darwin-x64',
    '@libsql/darwin-arm64',
    '@libsql/win32-x64-msvc',
    '@vercel/blob',
    'node:*',
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

console.log('Build complete: api/index.js')
