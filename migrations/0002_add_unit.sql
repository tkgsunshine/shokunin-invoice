-- 明細に単位（1式、1m、1個など）を追加
ALTER TABLE purchase_items ADD COLUMN unit TEXT DEFAULT '';
ALTER TABLE invoice_items ADD COLUMN unit TEXT DEFAULT '';
