import { Hono } from 'hono'
import type { Bindings } from '../types'
import { extractPurchaseFromImage } from '../lib/openai'
import { randomHex } from '../lib/crypto'

const purchases = new Hono<{ Bindings: Bindings }>()

// 一覧（顧客未割当も含む）
purchases.get('/', async (c) => {
  const customerId = c.req.query('customer_id')
  const unassigned = c.req.query('unassigned')

  let query = `SELECT p.*, cu.name as customer_name FROM purchases p LEFT JOIN customers cu ON cu.id = p.customer_id`
  const conditions: string[] = []
  const binds: any[] = []

  if (customerId) {
    conditions.push('p.customer_id = ?')
    binds.push(customerId)
  }
  if (unassigned === '1') {
    conditions.push('p.customer_id IS NULL')
  }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
  query += ' ORDER BY p.created_at DESC'

  const { results } = await c.env.DB.prepare(query)
    .bind(...binds)
    .all()
  return c.json(results)
})

// 顧客ごとの未使用（請求書未反映）明細一覧（請求書作成画面用）
purchases.get('/items/available', async (c) => {
  const customerId = c.req.query('customer_id')
  if (!customerId) return c.json({ error: 'customer_idが必要です' }, 400)

  const { results } = await c.env.DB.prepare(
    `SELECT pi.*, p.vendor_name, p.document_type, p.purchase_date, p.id as purchase_id
     FROM purchase_items pi
     JOIN purchases p ON p.id = pi.purchase_id
     WHERE p.customer_id = ? AND pi.used_in_invoice_id IS NULL
     ORDER BY p.purchase_date DESC, pi.sort_order`
  )
    .bind(customerId)
    .all()

  return c.json(results)
})

// 詳細（明細含む）
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

// 画像アップロード + OCR取り込み
purchases.post('/upload', async (c) => {
  const form = await c.req.formData()
  const file = form.get('image') as File | null
  const customerId = form.get('customer_id') as string | null

  if (!file) {
    return c.json({ error: '画像ファイルが必要です' }, 400)
  }

  const contentType = file.type || 'image/jpeg'
  const arrayBuffer = await file.arrayBuffer()

  // R2に保存
  const ext = contentType.split('/')[1] || 'jpg'
  const imageKey = `purchases/${Date.now()}-${randomHex(6)}.${ext}`
  await c.env.R2.put(imageKey, arrayBuffer, { httpMetadata: { contentType } })

  // OCR実行
  const base64 = arrayBufferToBase64(arrayBuffer)
  let ocrResult
  try {
    ocrResult = await extractPurchaseFromImage(c.env.OPENAI_API_KEY, c.env.OPENAI_BASE_URL, base64, contentType)
  } catch (e: any) {
    // OCR失敗しても画像は保存し、空データで返す
    ocrResult = {
      vendor_name: '',
      document_type: '',
      purchase_date: '',
      total_amount: 0,
      items: [],
    }
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO purchases (customer_id, vendor_name, document_type, purchase_date, image_key, image_content_type, total_amount, ocr_raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      customerId || null,
      ocrResult.vendor_name,
      ocrResult.document_type,
      ocrResult.purchase_date,
      imageKey,
      contentType,
      ocrResult.total_amount,
      JSON.stringify(ocrResult)
    )
    .run()

  const purchaseId = result.meta.last_row_id

  for (let i = 0; i < ocrResult.items.length; i++) {
    const it = ocrResult.items[i]
    await c.env.DB.prepare(
      `INSERT INTO purchase_items (purchase_id, name, quantity, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(purchaseId, it.name, it.quantity, it.unit_price, it.amount, i)
      .run()
  }

  return c.json({
    id: purchaseId,
    vendor_name: ocrResult.vendor_name,
    document_type: ocrResult.document_type,
    purchase_date: ocrResult.purchase_date,
    total_amount: ocrResult.total_amount,
    image_key: imageKey,
    items: ocrResult.items,
  })
})

// 画像取得
purchases.get('/:id/image', async (c) => {
  const id = c.req.param('id')
  const purchase = await c.env.DB.prepare('SELECT image_key, image_content_type FROM purchases WHERE id = ?')
    .bind(id)
    .first<{ image_key: string; image_content_type: string }>()

  if (!purchase?.image_key) return c.json({ error: '画像がありません' }, 404)

  const obj = await c.env.R2.get(purchase.image_key)
  if (!obj) return c.json({ error: '画像が見つかりません' }, 404)

  return new Response(obj.body, {
    headers: { 'Content-Type': purchase.image_content_type || 'image/jpeg' },
  })
})

// 仕入れ情報の更新（顧客割当、業者名、明細の手動修正など）
purchases.put('/:id', async (c) => {
  const id = c.req.param('id')
  const { customer_id, vendor_name, document_type, purchase_date, total_amount, memo } = await c.req.json()

  await c.env.DB.prepare(
    `UPDATE purchases SET customer_id=?, vendor_name=?, document_type=?, purchase_date=?, total_amount=?, memo=? WHERE id=?`
  )
    .bind(customer_id || null, vendor_name ?? '', document_type ?? '', purchase_date ?? '', total_amount ?? 0, memo ?? '', id)
    .run()

  return c.json({ success: true })
})

// 明細の更新
purchases.put('/:id/items', async (c) => {
  const purchaseId = c.req.param('id')
  const { items } = await c.req.json<{ items: { id?: number; name: string; quantity: number; unit_price: number; amount: number }[] }>()

  await c.env.DB.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').bind(purchaseId).run()

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    await c.env.DB.prepare(
      `INSERT INTO purchase_items (purchase_id, name, quantity, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(purchaseId, it.name, it.quantity, it.unit_price, it.amount, i)
      .run()
  }

  const total = items.reduce((s, i) => s + i.amount, 0)
  await c.env.DB.prepare('UPDATE purchases SET total_amount = ? WHERE id = ?').bind(total, purchaseId).run()

  return c.json({ success: true })
})

// 削除
purchases.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const purchase = await c.env.DB.prepare('SELECT image_key FROM purchases WHERE id = ?').bind(id).first<{
    image_key: string | null
  }>()

  await c.env.DB.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM purchases WHERE id = ?').bind(id).run()

  if (purchase?.image_key) {
    await c.env.R2.delete(purchase.image_key).catch(() => {})
  }

  return c.json({ success: true })
})

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export default purchases
