import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { analyzeReceiptImage } from '../lib/ocr'

const purchases = new Hono<{ Bindings: Bindings }>()

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

// 一覧(customer_id指定で絞り込み可)
purchases.get('/', async (c) => {
  const customerId = c.req.query('customer_id')
  let query = 'SELECT * FROM purchases'
  const binds: any[] = []
  if (customerId) {
    query += ' WHERE customer_id = ?'
    binds.push(customerId)
  }
  query += ' ORDER BY created_at DESC'
  const stmt = c.env.DB.prepare(query)
  const { results } = await (binds.length ? stmt.bind(...binds) : stmt).all()
  return c.json(results)
})

// 詳細(明細つき)
purchases.get('/:id', async (c) => {
  const id = c.req.param('id')
  const purchase = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first()
  if (!purchase) return c.json({ error: '見つかりません' }, 404)
  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY sort_order, id'
  )
    .bind(id)
    .all()
  return c.json({ purchase, items })
})

// 画像取得
purchases.get('/:id/image', async (c) => {
  const id = c.req.param('id')
  const purchase = await c.env.DB.prepare('SELECT image_key, image_content_type FROM purchases WHERE id = ?')
    .bind(id)
    .first<{ image_key: string | null; image_content_type: string | null }>()
  if (!purchase?.image_key) return c.notFound()
  const object = await c.env.R2.get(purchase.image_key)
  if (!object) return c.notFound()
  return new Response(object.body, {
    headers: {
      'Content-Type': purchase.image_content_type || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

// アップロード + OCR自動抽出
purchases.post('/', async (c) => {
  const body = await c.req.parseBody()
  const file = body['image'] as File | undefined
  const customerId = body['customer_id'] ? Number(body['customer_id']) : null

  if (!file || typeof file === 'string') {
    return c.json({ error: '画像ファイルが必要です' }, 400)
  }

  const arrayBuffer = await file.arrayBuffer()
  const contentType = file.type || 'image/jpeg'
  const imageKey = `purchases/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  await c.env.R2.put(imageKey, arrayBuffer, {
    httpMetadata: { contentType },
  })

  let ocrResult
  let ocrError: string | null = null
  try {
    const base64 = arrayBufferToBase64(arrayBuffer)
    const dataUrl = `data:${contentType};base64,${base64}`
    ocrResult = await analyzeReceiptImage(c.env.OPENAI_API_KEY, c.env.OPENAI_BASE_URL, dataUrl)
  } catch (e: any) {
    ocrError = e?.message || '画像の読み取りに失敗しました'
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO purchases (customer_id, vendor_name, document_type, purchase_date, image_key, image_content_type, total_amount, ocr_raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      customerId,
      ocrResult?.vendor_name ?? '',
      ocrResult?.document_type ?? '',
      ocrResult?.purchase_date ?? '',
      imageKey,
      contentType,
      ocrResult?.total_amount ?? 0,
      ocrResult ? JSON.stringify(ocrResult) : null
    )
    .run()

  const purchaseId = result.meta.last_row_id

  if (ocrResult?.items?.length) {
    const stmts = ocrResult.items.map((item, idx) =>
      c.env.DB.prepare(
        'INSERT INTO purchase_items (purchase_id, name, quantity, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(purchaseId, item.name, item.quantity, item.unit_price, item.amount, idx)
    )
    await c.env.DB.batch(stmts)
  }

  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY sort_order, id'
  )
    .bind(purchaseId)
    .all()

  return c.json({
    id: purchaseId,
    ocrError,
    ocrResult,
    items,
  })
})

// 仕入れ情報の更新(顧客割当、業者名等の修正)
purchases.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  await c.env.DB.prepare(
    `UPDATE purchases SET customer_id = ?, vendor_name = ?, document_type = ?, purchase_date = ?, total_amount = ?, memo = ?
     WHERE id = ?`
  )
    .bind(
      body.customer_id ?? null,
      body.vendor_name ?? '',
      body.document_type ?? '',
      body.purchase_date ?? '',
      Number(body.total_amount) || 0,
      body.memo ?? '',
      id
    )
    .run()
  return c.json({ success: true })
})

// 仕入れ削除(画像も削除)
purchases.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const purchase = await c.env.DB.prepare('SELECT image_key FROM purchases WHERE id = ?')
    .bind(id)
    .first<{ image_key: string | null }>()
  await c.env.DB.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM purchases WHERE id = ?').bind(id).run()
  if (purchase?.image_key) {
    await c.env.R2.delete(purchase.image_key).catch(() => {})
  }
  return c.json({ success: true })
})

// 明細項目の更新
purchases.put('/items/:itemId', async (c) => {
  const itemId = c.req.param('itemId')
  const body = await c.req.json<any>()
  const quantity = Number(body.quantity) || 0
  const unitPrice = Number(body.unit_price) || 0
  const amount = body.amount !== undefined ? Number(body.amount) || 0 : quantity * unitPrice
  await c.env.DB.prepare('UPDATE purchase_items SET name = ?, quantity = ?, unit_price = ?, amount = ? WHERE id = ?')
    .bind(body.name ?? '', quantity, unitPrice, amount, itemId)
    .run()
  return c.json({ success: true })
})

// 明細項目の削除
purchases.delete('/items/:itemId', async (c) => {
  const itemId = c.req.param('itemId')
  await c.env.DB.prepare('DELETE FROM purchase_items WHERE id = ?').bind(itemId).run()
  return c.json({ success: true })
})

// 明細項目の追加(手動追加)
purchases.post('/:id/items', async (c) => {
  const purchaseId = c.req.param('id')
  const body = await c.req.json<any>()
  const quantity = Number(body.quantity) || 1
  const unitPrice = Number(body.unit_price) || 0
  const amount = body.amount !== undefined ? Number(body.amount) || 0 : quantity * unitPrice
  const result = await c.env.DB.prepare(
    'INSERT INTO purchase_items (purchase_id, name, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(purchaseId, body.name ?? '項目', quantity, unitPrice, amount)
    .run()
  return c.json({ id: result.meta.last_row_id })
})

export default purchases
