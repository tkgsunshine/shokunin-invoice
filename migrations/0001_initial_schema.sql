-- 自社設定（1行のみ）
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT DEFAULT '',
  owner_name TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  bank_branch TEXT DEFAULT '',
  bank_account_type TEXT DEFAULT '',
  bank_account_number TEXT DEFAULT '',
  bank_account_holder TEXT DEFAULT '',
  default_fee_percent REAL DEFAULT 20,
  default_tax_rate REAL DEFAULT 10,
  invoice_prefix TEXT DEFAULT 'INV-',
  next_invoice_seq INTEGER DEFAULT 1,
  password_hash TEXT,
  password_salt TEXT,
  session_secret TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 顧客（宛名）
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  postal_code TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 仕入れ取込（見積もり・請求書・レシート画像）
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  vendor_name TEXT DEFAULT '',
  document_type TEXT DEFAULT '',
  purchase_date TEXT DEFAULT '',
  image_key TEXT,
  image_content_type TEXT DEFAULT 'image/jpeg',
  total_amount REAL DEFAULT 0,
  memo TEXT DEFAULT '',
  ocr_raw TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 仕入れ明細（自動抽出された項目）
CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  used_in_invoice_id INTEGER,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id)
);

-- 請求書
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  invoice_number TEXT,
  issue_date TEXT,
  due_date TEXT,
  fee_percent REAL DEFAULT 20,
  tax_rate REAL DEFAULT 10,
  subtotal_cost REAL DEFAULT 0,
  fee_amount REAL DEFAULT 0,
  amount_before_tax REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  memo TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 請求書明細
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  purchase_item_id INTEGER,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL DEFAULT 0,
  cost_amount REAL DEFAULT 0,
  billed_amount REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id)
);

CREATE INDEX IF NOT EXISTS idx_purchases_customer ON purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_invoice ON purchase_items(used_in_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

INSERT OR IGNORE INTO settings (id) VALUES (1);
