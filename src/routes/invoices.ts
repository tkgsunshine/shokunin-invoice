import { Hono } from 'hono'
import type { Bindings } from '../types'

const invoices = new Hono<{ Bindings: Bindings }>()

type ItemInput = {
  purchase_item_id?: number | null
  name: string
  quantity: number
  unit?: string
  unit_price: number
  cost_amount: number
  fee_percent?: number | null
}

const TAX_RATE = 10

function round(n: number): number {
  return Math.round(n)
}

function calcInvoice(items: ItemInput[], defaultFeePercent: number) {
  const computed = items.map((it) => {
    const cost = it.cost_amount
    const feePercent = it.fee_percent === null || it.fee_percent === undefined ? defaultFeePercent : it.fee_percent
    const billed = round(cost * (1 + feePercent / 100))
    const profitAmount = billed - cost
    const itemTax = round(billed * (TAX_RATE / 100))
    return { ...it, fee_percent: feePercent, billed_amount: billed, profit_amount: profitAmount, tax_amount: itemTax }
  })
  const subtotalCost = round(computed.reduce((s, i) => s + i.cost_amount, 0))
  const amountBeforeTax = round(computed.reduce((s, i) => s + i.billed_amount, 0))
  const feeAmount = amountBeforeTax - subtotalCost
  const taxAmount = round(computed.reduce((s, i) => s + i.tax_amount, 0))
  const totalAmount = amountBeforeTax + taxAmount
  return { computed, subtotalCost, feeAmount, amountBeforeTax, taxAmount, totalAmount }
}

// 一覧
invoices.get('/', async (c) => {
  const customerId = c.req.query('customer_id')
  let query = `SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON c.id = i.customer_id`
  const binds: unknown[] = []
  if (customerId) {
    query += ' WHERE i.customer_id = ?'
    binds.push(customerId)
  }
  query += ' ORDER BY i.created_at DESC'
  const { results } = await c.env.DB.prepare(query).bind(...binds).all()
  return c.json(results)
})

// 詳細
invoices.get('/:id', async (c) => {
  const id = c.req.param('id')
  const invoice = await c.env.DB.prepare(
    `SELECT i.*, c.name as customer_name, c.postal_code as customer_postal_code, c.address as customer_address, c.phone as customer_phone
     FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = ?`
  )
    .bind(id)
    .first<Record<string, unknown>>()
  if (!invoice) return c.json({ error: '見つかりません' }, 404)

  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id'
  )
    .bind(id)
    .all<Record<string, unknown>>()

  const itemsWithCalc = items.map((it) => {
    const cost = Number(it.cost_amount) || 0
    const billed = Number(it.billed_amount) || 0
    const feePercent = it.fee_percent !== null && it.fee_percent !== undefined
      ? it.fee_percent
      : cost > 0 ? round(((billed - cost) / cost) * 10000) / 100 : 0
    return {
      ...it,
      fee_percent: feePercent,
      profit_amount: billed - cost,
      tax_amount: round(billed * (TAX_RATE / 100)),
    }
  })

  const settings = await c.env.DB.prepare('SELECT * FROM settings WHERE id = 1').first<Record<string, unknown>>()

  // 発行済み・入金済みの請求書はスナップショットを使用、それ以外はsettingsの現在値を使用
  const status = invoice.status as string
  const frozenStatuses = ['issued', 'sent', 'paid']
  const useSnapshot = frozenStatuses.includes(status) && invoice.issuer_company_name

  const effectiveSettings = useSnapshot ? {
    company_name: invoice.issuer_company_name,
    owner_name: invoice.issuer_owner_name,
    postal_code: invoice.issuer_postal_code,
    address: invoice.issuer_address,
    phone: invoice.issuer_phone,
    email: invoice.issuer_email,
    bank_name: invoice.issuer_bank_name,
    bank_branch: invoice.issuer_bank_branch,
    bank_branch_number: invoice.issuer_bank_branch_number,
    bank_account_type: invoice.issuer_bank_account_type,
    bank_account_number: invoice.issuer_bank_account_number,
    bank_account_holder: invoice.issuer_bank_account_holder,
    // settingsからのみ取得する項目
    default_fee_percent: settings?.default_fee_percent,
    default_tax_rate: settings?.default_tax_rate,
    invoice_prefix: settings?.invoice_prefix,
    next_invoice_seq: settings?.next_invoice_seq,
  } : settings

  return c.json({ invoice, items: itemsWithCalc, settings: effectiveSettings })
})

// 作成
invoices.post('/', async (c) => {
  const body = await c.req.json<{
    customer_id: number
    issue_date: string
    due_date: string
    fee_percent: number
    memo?: string
    status?: string
    items: ItemInput[]
  }>()

  if (!body.customer_id || !body.items?.length) {
    return c.json({ error: '顧客と明細は必須です' }, 400)
  }

  const settings = await c.env.DB.prepare(
    'SELECT invoice_prefix, next_invoice_seq FROM settings WHERE id = 1'
  ).first<{ invoice_prefix: string; next_invoice_seq: number }>()

  const seq = settings?.next_invoice_seq ?? 1
  const invoiceNumber = `${settings?.invoice_prefix ?? 'INV-'}${String(seq).padStart(4, '0')}`

  const { computed, subtotalCost, feeAmount, amountBeforeTax, taxAmount, totalAmount } = calcInvoice(
    body.items,
    body.fee_percent
  )

  // 自社情報スナップショットを取得
  const issuerSettings = await c.env.DB.prepare('SELECT * FROM settings WHERE id = 1').first<Record<string, unknown>>().catch(() => null)

  const result = await c.env.DB.prepare(
    `INSERT INTO invoices (customer_id, invoice_number, issue_date, due_date, fee_percent, tax_rate,
       subtotal_cost, fee_amount, amount_before_tax, tax_amount, total_amount, memo, status,
       issuer_company_name, issuer_owner_name, issuer_postal_code, issuer_address, issuer_phone, issuer_email,
       issuer_bank_name, issuer_bank_branch, issuer_bank_branch_number, issuer_bank_account_type,
       issuer_bank_account_number, issuer_bank_account_holder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.customer_id,
      invoiceNumber,
      body.issue_date ?? '',
      body.due_date ?? '',
      body.fee_percent,
      TAX_RATE,
      subtotalCost,
      feeAmount,
      amountBeforeTax,
      taxAmount,
      totalAmount,
      body.memo ?? '',
      body.status ?? 'draft',
      issuerSettings?.company_name ?? '',
      issuerSettings?.owner_name ?? '',
      issuerSettings?.postal_code ?? '',
      issuerSettings?.address ?? '',
      issuerSettings?.phone ?? '',
      issuerSettings?.email ?? '',
      issuerSettings?.bank_name ?? '',
      issuerSettings?.bank_branch ?? '',
      issuerSettings?.bank_branch_number ?? '',
      issuerSettings?.bank_account_type ?? '',
      issuerSettings?.bank_account_number ?? '',
      issuerSettings?.bank_account_holder ?? ''
    )
    .run()

  const invoiceId = result.meta.last_row_id

  for (let i = 0; i < computed.length; i++) {
    const it = computed[i]
    await c.env.DB.prepare(
      `INSERT INTO invoice_items (invoice_id, purchase_item_id, name, quantity, unit, unit_price, cost_amount, billed_amount, fee_percent, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(invoiceId, it.purchase_item_id ?? null, it.name, it.quantity, it.unit || '', it.unit_price, it.cost_amount, it.billed_amount, it.fee_percent, i)
      .run()

    if (it.purchase_item_id) {
      await c.env.DB.prepare('UPDATE purchase_items SET used_in_invoice_id = ? WHERE id = ?')
        .bind(invoiceId, it.purchase_item_id)
        .run()
    }
  }

  await c.env.DB.prepare('UPDATE settings SET next_invoice_seq = ? WHERE id = 1')
    .bind(seq + 1)
    .run()

  return c.json({ id: invoiceId, invoice_number: invoiceNumber, total_amount: totalAmount })
})

// 更新（下書きの再編集）
invoices.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    customer_id: number
    issue_date: string
    due_date: string
    fee_percent: number
    memo?: string
    status?: string
    items: ItemInput[]
  }>()

  const { computed, subtotalCost, feeAmount, amountBeforeTax, taxAmount, totalAmount } = calcInvoice(
    body.items,
    body.fee_percent
  )

  // 既存の紐づけ解除
  const { results: oldItems } = await c.env.DB.prepare(
    'SELECT purchase_item_id FROM invoice_items WHERE invoice_id = ? AND purchase_item_id IS NOT NULL'
  )
    .bind(id)
    .all<{ purchase_item_id: number }>()

  for (const oi of oldItems) {
    await c.env.DB.prepare('UPDATE purchase_items SET used_in_invoice_id = NULL WHERE id = ?')
      .bind(oi.purchase_item_id)
      .run()
  }

  await c.env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(id).run()

  await c.env.DB.prepare(
    `UPDATE invoices SET customer_id=?, issue_date=?, due_date=?, fee_percent=?, tax_rate=?,
       subtotal_cost=?, fee_amount=?, amount_before_tax=?, tax_amount=?, total_amount=?, memo=?, status=?
     WHERE id=?`
  )
    .bind(
      body.customer_id,
      body.issue_date ?? '',
      body.due_date ?? '',
      body.fee_percent,
      TAX_RATE,
      subtotalCost,
      feeAmount,
      amountBeforeTax,
      taxAmount,
      totalAmount,
      body.memo ?? '',
      body.status ?? 'draft',
      id
    )
    .run()

  for (let i = 0; i < computed.length; i++) {
    const it = computed[i]
    await c.env.DB.prepare(
      `INSERT INTO invoice_items (invoice_id, purchase_item_id, name, quantity, unit, unit_price, cost_amount, billed_amount, fee_percent, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, it.purchase_item_id ?? null, it.name, it.quantity, it.unit || '', it.unit_price, it.cost_amount, it.billed_amount, it.fee_percent, i)
      .run()

    if (it.purchase_item_id) {
      await c.env.DB.prepare('UPDATE purchase_items SET used_in_invoice_id = ? WHERE id = ?')
        .bind(id, it.purchase_item_id)
        .run()
    }
  }

  return c.json({ success: true, total_amount: totalAmount })
})

// ステータス更新
invoices.put('/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json<{ status: string }>()
  await c.env.DB.prepare('UPDATE invoices SET status = ? WHERE id = ?').bind(status, id).run()
  return c.json({ success: true })
})

// 削除
invoices.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const { results: oldItems } = await c.env.DB.prepare(
    'SELECT purchase_item_id FROM invoice_items WHERE invoice_id = ? AND purchase_item_id IS NOT NULL'
  )
    .bind(id)
    .all<{ purchase_item_id: number }>()

  for (const oi of oldItems) {
    await c.env.DB.prepare('UPDATE purchase_items SET used_in_invoice_id = NULL WHERE id = ?')
      .bind(oi.purchase_item_id)
      .run()
  }
  await c.env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default invoices
