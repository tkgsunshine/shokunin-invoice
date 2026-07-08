import { Hono } from 'hono'
import type { Bindings } from '../lib/types'

const customers = new Hono<{ Bindings: Bindings }>()

// 一覧
customers.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM purchases p WHERE p.customer_id = c.id) as purchase_count,
       (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id) as invoice_count
     FROM customers c ORDER BY c.created_at DESC`
  ).all()
  return c.json(results)
})

// 詳細(仕入れ・請求書履歴つき)
customers.get('/:id', async (c) => {
  const id = c.req.param('id')
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
  if (!customer) return c.json({ error: '顧客が見つかりません' }, 404)

  const { results: purchases } = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE customer_id = ? ORDER BY created_at DESC'
  )
    .bind(id)
    .all()

  const { results: invoices } = await c.env.DB.prepare(
    'SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC'
  )
    .bind(id)
    .all()

  return c.json({ customer, purchases, invoices })
})

// 作成
customers.post('/', async (c) => {
  const body = await c.req.json<any>()
  if (!body.name) return c.json({ error: '名前は必須です' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO customers (name, postal_code, address, phone, memo) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(body.name, body.postal_code ?? '', body.address ?? '', body.phone ?? '', body.memo ?? '')
    .run()
  return c.json({ id: result.meta.last_row_id })
})

// 更新
customers.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  await c.env.DB.prepare(
    'UPDATE customers SET name = ?, postal_code = ?, address = ?, phone = ?, memo = ? WHERE id = ?'
  )
    .bind(body.name, body.postal_code ?? '', body.address ?? '', body.phone ?? '', body.memo ?? '', id)
    .run()
  return c.json({ success: true })
})

// 削除
customers.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default customers
