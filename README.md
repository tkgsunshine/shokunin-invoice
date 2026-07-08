# かんたん請求書 - 建築業向け請求書管理システム

一人親方（個人事業主の職人さん）向けの、超シンプルな請求書管理システムです。
仕入れの見積書・請求書・レシートを撮影するだけでAI(OCR)が自動で項目を読み取り、
手数料％を設定するだけでお客さん向けの請求書を簡単に作成できます。

## 現在完成している機能

- **合言葉ログイン**: 初回アクセス時に合言葉（パスワード）を設定。以後はログインが必要（30日間セッション保持）
- **お客さん（宛名）管理**: 顧客ごとに氏名・住所・電話番号を登録・編集・削除
- **仕入れ書類の取り込み（OCR自動読取）**:
  - スマホのカメラで撮影 or 画像選択でアップロード
  - OpenAI(GPT-5-mini Vision)が仕入先名・書類種別・日付・合計金額・明細（品目/数量/単価/金額）を自動抽出
  - 抽出結果は手動で修正可能
  - 画像自体もCloudflare R2に保存され、後から確認できる
  - お客さんへの割り当て（未割当の一覧表示あり）
- **請求書作成**:
  - お客さんを選択すると、そのお客さんに紐づく「まだ請求書に使っていない仕入れ明細」が一覧表示され、チェックで選択
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

- **D1 (SQLite)**: `settings`（自社情報1行）, `customers`, `purchases`, `purchase_items`, `invoices`, `invoice_items`
- **R2**: 仕入れ書類の画像バイナリを保存（`purchases/{timestamp}-{random}.{ext}`）
- **OpenAI API (gpt-5-mini, Vision)**: 画像から仕入れ情報をJSON抽出

## 技術スタック

- Hono (Cloudflare Workers/Pages)
- フロントエンド: バニラJS + TailwindCSS(CDN) + FontAwesome + axios + dayjs（ビルド不要のシンプル構成）
- Cloudflare D1（データベース）、R2（画像ストレージ）

## 未実装・今後の課題

- **本番デプロイ未実施**（Genspark管理Cloudflareアカウントでのデプロイをこれから実行予定）
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

## デプロイ状況

- **プラットフォーム**: Cloudflare Pages（Genspark管理アカウント / gsk-hosted-deploy）
- **ステータス**: ❌ 未デプロイ（ローカル動作確認済み、デプロイ作業待ち）
- **最終更新**: 2026-07-08
