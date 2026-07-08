import { Hono } from 'hono'
import type { Bindings } from '../lib/types'

const settings = new Hono<{ Bindings: Bindings }>()

settings.get('/', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT company_name, owner_name, postal_code, address, phone, email,
            bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder,
            default_fee_percent, default_tax_rate, invoice_prefix
     FROM settings WHERE id = 1`
  ).first()
  return c.json(row ?? {})
})

settings.put('/', async (c) => {
  const body = await c.req.json<any>()
  await c.env.DB.prepare(
    `UPDATE settings SET
      company_name = ?, owner_name = ?, postal_code = ?, address = ?, phone = ?, email = ?,
      bank_name = ?, bank_branch = ?, bank_account_type = ?, bank_account_number = ?, bank_account_holder = ?,
      default_fee_percent = ?, default_tax_rate = ?, invoice_prefix = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`
  )
    .bind(
      body.company_name ?? '',
      body.owner_name ?? '',
      body.postal_code ?? '',
      body.address ?? '',
      body.phone ?? '',
      body.email ?? '',
      body.bank_name ?? '',
      body.bank_branch ?? '',
      body.bank_account_type ?? '',
      body.bank_account_number ?? '',
      body.bank_account_holder ?? '',
      Number(body.default_fee_percent) || 0,
      Number(body.default_tax_rate) || 0,
      body.invoice_prefix ?? 'INV-'
    )
    .run()
  return c.json({ success: true })
})

export default settings
