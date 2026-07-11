import { Hono } from 'hono'
import type { Bindings } from '../types'

const settingsRoute = new Hono<{ Bindings: Bindings }>()

settingsRoute.get('/', async (c) => {
  // まずbank_branch_numberを含むクエリを試み、カラムが存在しない場合はフォールバック
  let s: Record<string, unknown> | null = null
  try {
    s = await c.env.DB.prepare(
      `SELECT company_name, owner_name, postal_code, address, phone, email,
              bank_name, bank_branch, bank_branch_number, bank_account_type, bank_account_number, bank_account_holder,
              default_fee_percent, default_tax_rate, invoice_prefix
       FROM settings WHERE id = 1`
    ).first()
  } catch (_e) {
    // bank_branch_numberカラムが未追加の場合はそれなしで取得
    s = await c.env.DB.prepare(
      `SELECT company_name, owner_name, postal_code, address, phone, email,
              bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder,
              default_fee_percent, default_tax_rate, invoice_prefix
       FROM settings WHERE id = 1`
    ).first()
    if (s) s = { ...s, bank_branch_number: '' }
  }
  return c.json(s)
})

settingsRoute.put('/', async (c) => {
  const body = await c.req.json()
  const allFields = [
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

  const tryUpdate = async (fields: string[]) => {
    const setClauses = fields.map((f) => `${f} = ?`).join(', ')
    const values = fields.map((f) => body[f] ?? (f.includes('percent') || f.includes('rate') ? 0 : ''))
    await c.env.DB.prepare(`UPDATE settings SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
      .bind(...values)
      .run()
  }

  try {
    await tryUpdate(allFields)
  } catch (_e) {
    // bank_branch_numberカラムが未追加の場合はそれを除いて更新
    await tryUpdate(allFields.filter((f) => f !== 'bank_branch_number'))
  }

  return c.json({ success: true })
})

export default settingsRoute
