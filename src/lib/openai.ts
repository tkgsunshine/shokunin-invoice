// OpenAI Vision APIを使った仕入れ書類(見積書・請求書・レシート)のOCR抽出

export type OcrItem = {
  name: string
  quantity: number
  unit: string
  unit_price: number
  amount: number
}

export type OcrResult = {
  vendor_name: string
  document_type: string
  purchase_date: string
  total_amount: number
  items: OcrItem[]
}

const SYSTEM_PROMPT = `あなたは建築業の職人が受け取る仕入れ書類(見積書・請求書・レシート・納品書)を読み取るOCRアシスタントです。
画像から以下の情報を抽出し、必ず有効なJSONのみで回答してください。説明文は不要です。

出力フォーマット:
{
  "vendor_name": "仕入先/店舗名(文字列、不明なら空文字)",
  "document_type": "見積書 or 請求書 or レシート or 納品書 のいずれか(不明なら空文字)",
  "purchase_date": "YYYY-MM-DD形式の日付(不明なら空文字)",
  "total_amount": 合計金額の数値(カンマ・円記号を除いた数値のみ、不明なら0),
  "items": [
    { "name": "品目名", "quantity": 数量(数値、不明なら1), "unit": "単位(文字列。例: 式, m, m2, kg, 本, 枚, 個, 台, セット等。不明なら空文字)", "unit_price": 単価(数値、不明なら0), "amount": 金額(数値) }
  ]
}

注意点:
- unitは書類に記載されている単位表記をそのまま使う(「1式」なら"式"、「10m」なら"m"など)。記載がなければ空文字にする
- 数量・単価・金額は数値のみ(カンマ、円マーク、税込表記等は除去)
- 明細が読み取れない場合はitemsを空配列にする代わりに、合計金額のみを1つの項目として推定してよい
- 手書きや不鮮明な部分は無理に推測せず、読み取れる範囲で構わない
- 必ずJSONオブジェクトのみを出力すること`

export async function extractPurchaseFromImage(
  apiKey: string,
  baseUrl: string,
  imageBase64: string,
  contentType: string,
  fileName?: string
): Promise<OcrResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const isPdf = contentType === 'application/pdf'
  const dataUrl = `data:${contentType};base64,${imageBase64}`

  // PDFの場合は "file" コンテンツ形式、画像の場合は従来の "image_url" 形式で送信
  const fileContent = isPdf
    ? { type: 'file', file: { filename: fileName || 'document.pdf', file_data: dataUrl } }
    : { type: 'image_url', image_url: { url: dataUrl } }

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `この${isPdf ? 'PDF' : '画像'}から仕入れ情報を抽出してJSONで返してください。` },
          fileContent,
        ],
      },
    ],
    response_format: { type: 'json_object' },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI API error: ${res.status} ${errText}`)
  }

  const json = await res.json<any>()
  const content = json?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAIからの応答が空です')
  }

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error('OpenAIの応答をJSONとして解析できませんでした')
  }

  const items: OcrItem[] = Array.isArray(parsed.items)
    ? parsed.items.map((it: any) => ({
        name: String(it.name ?? '').slice(0, 200),
        quantity: toNumber(it.quantity, 1),
        unit: String(it.unit ?? '').slice(0, 20),
        unit_price: toNumber(it.unit_price, 0),
        amount: toNumber(it.amount, toNumber(it.quantity, 1) * toNumber(it.unit_price, 0)),
      }))
    : []

  return {
    vendor_name: String(parsed.vendor_name ?? '').slice(0, 200),
    document_type: String(parsed.document_type ?? '').slice(0, 50),
    purchase_date: normalizeDate(String(parsed.purchase_date ?? '')),
    total_amount: toNumber(parsed.total_amount, items.reduce((s, i) => s + i.amount, 0)),
    items,
  }
}

function toNumber(v: any, fallback: number): number {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string') {
    const cleaned = v.replace(/[,¥円\s]/g, '')
    const n = parseFloat(cleaned)
    if (!isNaN(n)) return n
  }
  return fallback
}

function normalizeDate(s: string): string {
  const m = s.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return ''
}
