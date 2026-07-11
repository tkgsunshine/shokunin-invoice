-- 請求書作成時の自社情報スナップショットを保存するカラムを追加
-- これにより、設定変更後も発行済み・入金済みの請求書の自社情報は変わらない
ALTER TABLE invoices ADD COLUMN issuer_company_name TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_owner_name TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_postal_code TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_address TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_phone TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_email TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_bank_name TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_bank_branch TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_bank_branch_number TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_bank_account_type TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_bank_account_number TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN issuer_bank_account_holder TEXT DEFAULT '';
