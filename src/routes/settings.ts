import { Hono } from 'hono'
import type { Bindings } from '../types'

const settingsRoute = new Hono<{ Bindings: Bindings }>()

settingsRoute.get('/', async (c) => {
  const s = await c.env.DB.prepare(
    `SELECT company_name, owner_name, postal_code, address, phone, email,
            bank_name, bank_branch, bank_branch_number, bank_account_type, bank_account_number, bank_account_holder,
            default_fee_percent, default_tax_rate, invoice_prefix
     FROM settings WHERE id = 1`
  ).first()
  return c.json(s)
})

settingsRoute.put('/', async (c) => {
  const body = await c.req.json()
  const fields = [
    'company_name',
    'owner_name',
    'postal_code',
    'address',
    'phone',
    'email',
    'bank_name',
    'bank_branch',
    'bank_branch_number',
    'bank_account_type',
    'bank_account_number',
    'bank_account_holder',
    'default_fee_percent',
    'default_tax_rate',
    'invoice_prefix',
  ]
  const setClauses = fields.map((f) => `${f} = ?`).join(', ')
  const values = fields.map((f) => body[f] ?? (f.includes('percent') || f.includes('rate') ? 0 : ''))

  await c.env.DB.prepare(`UPDATE settings SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
    .bind(...values)
    .run()

  return c.json({ success: true })
})

export default settingsRoute
