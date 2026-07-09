# かんたん請求書 - 建築業向け請求書管理システム

一人親方（個人事業主の職人さん）向けの、超シンプルな請求書管理システムです。
仕入れの見積書・請求書・レシートを撮影するだけでAI(OCR)が自動で項目を読み取り、
手数料％を設定するだけでお客さん向けの請求書を簡単に作成できます。

## 現在完成している機能

- **合言葉ログイン**: 初回アクセス時に合言葉（パスワード）を設定。以後はログインが必要（30日間セッション保持）
- **お客さん（宛名）管理**: 顧客ごとに氏名・住所・電話番号を登録・編集・削除
- **仕入れ書類の取り込み（OCR自動読取）**:
  - スマホのカメラで撮影 or 画像・PDFファイルを選択してアップロード
  - OpenAI(GPT-5-mini Vision)が仕入先名・書類種別・日付・合計金額・明細（品目/数量/単位/単価/金額）を自動抽出
  - PDF書類（メールで届く請求書など）にも対応。画像は`image_url`形式、PDFは`file`形式でAPIに送信し分岐処理
  - OCR自動読取に失敗した場合もファイルは保存され、手動で入力して続行可能（エラー内容を画面に表示）
  - 抽出結果は手動で修正可能
  - 画像/PDF自体もCloudflare R2に保存され、後から確認できる（PDFは専用のアイコン+リンク表示）
  - お客さんへの割り当て（未割当の一覧表示あり）
- **請求書作成**:
  - お客さんを選択すると、そのお客さんに紐づく「まだ請求書に使っていない仕入れ明細」が一覧表示され、チェックで選択
  - 各明細に「単位」（例: 式、m、個など）を入力・編集可能。請求書表示・印刷画面にも単位列を表示
  - 手動での明細追加も可能
  - 手数料％（原価×(1+手数料%)を明細ごとに計算）と消費税％を入力すると自動計算
  - 発行日・支払期限・備考も設定可能
  - ステータス管理（下書き/送付済み/入金済み）
- **請求書表示・印刷**: ブラウザの印刷機能でPDF保存可能な体裁の請求書を表示（自社情報・振込先口座も印字）
- **設定画面**: 自社情報（屋号・住所・連絡先）、振込先口座、デフォルト手数料/消費税率、請求書番号のプレフィックス、合言葉の変更

## 画面構成（フロントエンド ルーティング）

| パス | 内容 |
|---|---|
| `#/setup` | 初回合言葉設定 |
| `#/login` | ログイン |
| `#/` | ホーム（仕入れ取込・お客さん一覧への導線） |
| `#/customers` | お客さん一覧 |
| `#/customers/:id` | お客さん詳細（仕入れ・請求書履歴） |
| `#/purchases/unassigned` | 未割当の仕入れ一覧 |
| `#/purchase/capture` | 仕入れ画像の取り込み |
| `#/purchase/:id` | 仕入れ詳細・明細編集 |
| `#/invoice/new` | 請求書作成 |
| `#/invoice/:id` | 請求書表示・印刷 |
| `#/invoice/:id/edit` | 請求書編集 |
| `#/settings` | 設定 |

## API エンドポイント

- `POST /api/auth/setup` `/login` `/logout` `/change-password`、`GET /api/auth/status`
- `GET/POST/PUT/DELETE /api/customers`, `/api/customers/:id`
- `GET/POST/PUT/DELETE /api/purchases`, `/api/purchases/:id`
  - `POST /api/purchases/upload` (multipart: image, customer_id) — OCR取込
  - `GET /api/purchases/:id/image` — 画像取得
  - `PUT /api/purchases/:id/items` — 明細更新
  - `GET /api/purchases/items/available?customer_id=` — 未使用明細一覧
- `GET/POST/PUT/DELETE /api/invoices`, `/api/invoices/:id`, `PUT /api/invoices/:id/status`
- `GET/PUT /api/settings`

## データアーキテクチャ

- **D1 (SQLite)**: `settings`（自社情報1行）, `customers`, `purchases`, `purchase_items`(unit列あり), `invoices`, `invoice_items`(unit列あり)
- **R2**: 仕入れ書類の画像バイナリを保存（`purchases/{timestamp}-{random}.{ext}`）
- **OpenAI API (gpt-5-mini, Vision)**: 画像・PDFから仕入れ情報をJSON抽出（画像は`image_url`、PDFは`file`コンテンツ形式で送信）

## 技術スタック

- Hono (Cloudflare Workers/Pages)
- フロントエンド: バニラJS + TailwindCSS(CDN) + FontAwesome + axios + dayjs（ビルド不要のシンプル構成）
- Cloudflare D1（データベース）、R2（画像ストレージ）

## 未実装・今後の課題

- OCR結果の精度検証（実際の手書き伝票・レシートでの読み取り精度は要確認、必要に応じてプロンプト調整）
- 請求書のPDF自動ダウンロード機能（現在はブラウザ印刷機能でのPDF化のみ対応）
- 複数の自社情報（屋号）切り替えなど拡張的な機能（あえて非搭載＝シンプルさ優先の設計方針）

## ローカル開発

```bash
npm install
npm run build
pm2 start ecosystem.config.cjs
curl http://localhost:3000
```

D1マイグレーション（ローカル）:
```bash
npx wrangler d1 execute shokunin-invoice-production --local --file=./migrations/0001_initial_schema.sql
```

.dev.vars に OPENAI_API_KEY / OPENAI_BASE_URL を設定してください（OCR機能に必要）。

## URL

- **本番環境**: https://d2842e59-38b1-4bc8-8391-8cae8484e8d6.vip.gensparksite.com

## 使い方（利用者向け）

1. 上記URLに初めてアクセスすると「合言葉」の設定画面が出るので、好きな合言葉（4文字以上）を決めて設定してください
2. 「設定」画面で屋号・住所・振込先口座などの自社情報を入力しておいてください
3. 「お客さん一覧」から工事のお客さんを登録してください
4. 仕入れの見積書・請求書・レシートを受け取ったら、ホーム画面の「仕入れを取り込む」からスマホで撮影 or 画像・PDFファイルを選択してアップロードすると、AIが自動で品目・金額を読み取ります
5. お客さんの詳細ページから「請求書作成」を押すと、そのお客さん向けの仕入れ明細が一覧表示されるのでチェックして選択し、手数料％・消費税％を入力すれば自動計算されます
6. 請求書が完成したら「印刷/PDF」ボタンでブラウザの印刷機能を使ってPDF保存・印刷ができます

## デプロイ状況

- **プラットフォーム**: Cloudflare Pages（Genspark管理アカウント / gsk-hosted-deploy）
- **ステータス**: ✅ デプロイ済み・稼働中
- **リソース**: D1 (`d2842e59-38b1-4bc8-8391-8cae8484e8d6-db`), R2 (`d2842e59-38b1-4bc8-8391-8cae8484e8d6-r2`)
- **シークレット設定済み**: OPENAI_API_KEY, OPENAI_BASE_URL
- **最終更新**: 2026-07-09（仕入れ明細・請求書明細に「単位」（式/m/個など）フィールドを追加）
