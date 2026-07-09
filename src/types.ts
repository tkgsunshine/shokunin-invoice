import type { Client } from '@libsql/client'

export type Bindings = {
  DB: Client
  R2: {
    put: (key: string, body: Buffer | ArrayBuffer, opts?: { httpMetadata?: { contentType: string } }) => Promise<void>
    get: (key: string) => Promise<{ body: Buffer; contentType: string } | null>
    delete: (key: string) => Promise<void>
  }
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
}
