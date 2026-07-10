/**
 * Vercel Blob を R2-like インターフェースでラップするアダプター。
 * ローカル開発時はファイルシステムにフォールバックする。
 */
import { put, del, head } from '@vercel/blob'
import * as fs from 'fs'
import * as path from 'path'

const isVercel = !!process.env.BLOB_READ_WRITE_TOKEN

// Vercel Blob store ID (from token: vercel_blob_rw_{storeId}_{secret})
function getBlobStoreId(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? ''
  const match = token.match(/vercel_blob_rw_([^_]+)_/)
  return match ? match[1] : ''
}
const LOCAL_STORAGE_DIR = path.join(process.cwd(), '.local-storage')

function ensureLocalDir() {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true })
  }
}

export const r2Adapter = {
  async put(
    key: string,
    body: Buffer | ArrayBuffer,
    opts?: { httpMetadata?: { contentType: string } }
  ): Promise<void> {
    const buffer = body instanceof ArrayBuffer ? Buffer.from(body) : body
    const contentType = opts?.httpMetadata?.contentType ?? 'application/octet-stream'

    if (isVercel) {
      await put(key, buffer, {
        access: 'public',
        contentType,
        addRandomSuffix: false,
      })
    } else {
      // ローカル開発: ファイルシステムに保存
      ensureLocalDir()
      const safePath = path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, '_'))
      fs.writeFileSync(safePath, buffer)
      // メタデータも保存
      fs.writeFileSync(safePath + '.meta', JSON.stringify({ contentType }))
    }
  },

  async get(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    if (isVercel) {
      try {
        // Vercel Blob の URL を構築して fetch
        const storeId = getBlobStoreId()
        const blobUrl = `https://${storeId}.public.blob.vercel-storage.com/${key}`
        const res = await fetch(blobUrl)
        if (!res.ok) return null
        const arrayBuffer = await res.arrayBuffer()
        const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
        return { body: Buffer.from(arrayBuffer), contentType }
      } catch {
        return null
      }
    } else {
      ensureLocalDir()
      const safePath = path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, '_'))
      if (!fs.existsSync(safePath)) return null
      const body = fs.readFileSync(safePath)
      let contentType = 'application/octet-stream'
      try {
        const meta = JSON.parse(fs.readFileSync(safePath + '.meta', 'utf-8'))
        contentType = meta.contentType ?? contentType
      } catch {}
      return { body, contentType }
    }
  },

  async delete(key: string): Promise<void> {
    if (isVercel) {
      try {
        // Vercel Blob の URL を構築して削除
        const storeId = getBlobStoreId()
        const blobUrl = `https://${storeId}.public.blob.vercel-storage.com/${key}`
        await del(blobUrl)
      } catch {}
    } else {
      ensureLocalDir()
      const safePath = path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, '_'))
      if (fs.existsSync(safePath)) fs.unlinkSync(safePath)
      if (fs.existsSync(safePath + '.meta')) fs.unlinkSync(safePath + '.meta')
    }
  },
}
