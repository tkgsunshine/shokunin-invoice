import { Hono } from 'hono'
import type { Bindings } from '../lib/types'

const invoices = new Hono<{ Bindings: Bindings }>()

function round(n: number): number {
  return Math.round(n)
}

// 顧客の未使用の仕入れ明細一覧(請求書作成時の選択肢)
invoices.get('/available-items', async (c) => {
  const customerId = c.req.query('customer_id')
  if (!customerId) return c.json({ error: 'customer_id は必須です' }, 400)

  const { results } = await c.env.DB.prepare(
    `SELECT pi.*, p.vendor_name, p.document_type, p.purchase_date, p.id as purchase_id
     FROM purchase_items pi
     JOIN purchases p ON p.id = pi.purchase_id
     WHERE p.customer_id = ? AND pi.used_in_invoice_id IS NULL
     ORDER BY p.created_at DESC, pi.sort_order, pi.id`
  )
    .bind(customerId)
    .all()

  return c.json(results)
})

// 一覧
invoices.get('/', async (c) => {
  const customerId = c.req.query('customer_id')
  let query = `SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON c.id = i.customer_id`
  const binds: any[] = []
  if (customerId) {
    query += ' WHERE i.customer_id = ?'
    binds.push(customerId)
  }
  query += ' ORDER BY i.created_at DESC'
  const stmt = c.env.DB.prepare(query)
  const { results } = await (binds.length ? stmt.bind(...binds) : stmt).all()
  return c.json(results)
})

// 詳細(印刷用: 顧客情報・自社設定・明細を含む)
invoices.get('/:id', async (c) => {
  const id = c.req.param('id')
  const invoice = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first()
  if (!invoice) return c.json({ error: '見つかりません' }, 404)

  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?')
    .bind((invoice as any).customer_id)
    .first()

  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id'
  )
    .bind(id)
    .all()

  const settings = await c.env.DB.prepare(
    `SELECT company_name, owner_name, postal_code, address, phone, email,
            bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder
     FROM settings WHERE id = 1`
  ).first()

  return c.json({ invoice, customer, items, settings })
})

// 作成
invoices.post('/', async (c) => {
  const body = await c.req.json<any>()
  const customerId = Number(body.customer_id)
  const feePercent = Number(body.fee_percent) || 0
  const taxRate = Number(body.tax_rate) || 0
  const items: Array<{
    purchase_item_id?: number
    name: string
    quantity: number
    unit_price: number
    cost_amount?: number
  }> = Array.isArray(body.items) ? body.items : []

  if (!customerId) return c.json({ error: '顧客を選択してください' }, 400)
  if (items.length === 0) return c.json({ error: '請求項目が1つ以上必要です' }, 400)

  // 発行日・請求書番号の採番
  const issueDate = body.issue_date || new Date().toISOString().slice(0, 10)
  const dueDate = body.due_date || ''

  const settings = await c.env.DB.prepare('SELECT invoice_prefix, next_invoice_seq FROM settings WHERE id = 1').first<{
    invoice_prefix: string
    next_invoice_seq: number
  }>()
  const seq = settings?.next_invoice_seq ?? 1
  const invoiceNumber = `${settings?.invoice_prefix ?? 'INV-'}${String(seq).padStart(4, '0')}`

  let subtotalCost = 0
  let amountBeforeTax = 0
  const computedItems = items.map((it) => {
    const quantity = Number(it.quantity) || 1
    const unitPrice = Number(it.unit_price) || 0
    const costAmount = it.cost_amount !== undefined ? Number(it.cost_amount) || 0 : round(quantity * unitPrice)
    const billedAmount = round(costAmount * (1 + feePercent / 100))
    subtotalCost += costAmount
    amountBeforeTax += billedAmount
    return { ...it, quantity, unitPrice, costAmount, billedAmount }
  })

  const feeAmount = amountBeforeTax - subtotalCost
  const taxAmount = round(amountBeforeTax * (taxRate / 100))
  const totalAmount = amountBeforeTax + taxAmount

  const result = await c.env.DB.prepare(
    `INSERT INTO invoices
      (customer_id, invoice_number, issue_date, due_date, fee_percent, tax_rate, subtotal_cost, fee_amount, amount_before_tax, tax_amount, total_amount, memo, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`
  )
    .bind(
      customerId,
      invoiceNumber,
      issueDate,
      dueDate,
      feePercent,
      taxRate,
      subtotalCost,
      feeAmount,
      amountBeforeTax,
      taxAmount,
      totalAmount,
      body.memo ?? ''
    )
    .run()

  const invoiceId = result.meta.last_row_id

  const itemStmts = computedItems.map((it, idx) =>
    c.env.DB.prepare(
      `INSERT INTO invoice_items (invoice_id, purchase_item_id, name, quantity, unit_price, cost_amount, billed_amount, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(invoiceId, it.purchase_item_id ?? null, it.name, it.quantity, it.unitPrice, it.costAmount, it.billedAmount, idx)
  )
  await c.env.DB.batch(itemStmts)

  // 使用済みにマーク
  const usedIds = computedItems.filter((it) => it.purchase_item_id).map((it) => it.purchase_item_id)
  if (usedIds.length) {
    const markStmts = usedIds.map((pid) =>
      c.env.DB.prepare('UPDATE purchase_items SET used_in_invoice_id = ? WHERE id = ?').bind(invoiceId, pid)
    )
    await c.env.DB.batch(markStmts)
  }

  await c.env.DB.prepare('UPDATE settings SET next_invoice_seq = ? WHERE id = 1')
    .bind(seq + 1)
    .run()

  return c.json({ id: invoiceId, invoice_number: invoiceNumber, total_amount: totalAmount })
})

// ステータス更新(draft -> issued -> paid など)・メモ編集
invoices.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  await c.env.DB.prepare('UPDATE invoices SET status = ?, memo = ?, due_date = ? WHERE id = ?')
    .bind(body.status ?? 'draft', body.memo ?? '', body.due_date ?? '', id)
    .run()
  return c.json({ success: true })
})

// 削除(使用済み仕入れ明細を未使用に戻す)
invoices.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE purchase_items SET used_in_invoice_id = NULL WHERE used_in_invoice_id = ?')
    .bind(id)
    .run()
  await c.env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default invoices
