// OpenAI Vision (gpt-5) を使って仕入れ書類(見積書/請求書/レシート)の画像から
// 業者名・日付・合計金額・明細項目を抽出する

export type OcrItem = {
  name: string
  quantity: number
  unit_price: number
  amount: number
}

export type OcrResult = {
  vendor_name: string
  document_type: string // '見積書' | '請求書' | 'レシート' | 'その他'
  purchase_date: string // YYYY-MM-DD、不明なら空文字
  total_amount: number
  items: OcrItem[]
}

const SYSTEM_PROMPT = `あなたは建築業の職人が使う請求書管理システムのOCRアシスタントです。
アップロードされた画像は、仕入れ先からの「見積書」「請求書」「レシート」のいずれかです。
画像を読み取り、以下のJSON形式で必要な情報のみを正確に抽出してください。

出力形式(必ずこのJSON構造のみを出力し、他の文章は一切含めないこと):
{
  "vendor_name": "仕入れ先の会社名・店名(不明なら空文字)",
  "document_type": "見積書 or 請求書 or レシート or その他",
  "purchase_date": "YYYY-MM-DD形式の日付(不明なら空文字)",
  "total_amount": 合計金額(税込・数値のみ、不明なら0),
  "items": [
    { "name": "品目名", "quantity": 数量(不明なら1), "unit_price": 単価(数値), "amount": 金額(数値) }
  ]
}

注意点:
- 金額はすべて数値(カンマや円マークを除いた数値)で出力してください。
- 明細が読み取れない場合でも、合計金額だけは可能な限り読み取ってください。
- 明細の品目名は簡潔にわかりやすく記載してください(例: "コンクリートブロック", "電動ドリル レンタル料" など)。
- 手書きの文字や不鮮明な部分は推測せず、読み取れる範囲で正確に記載してください。
- JSON以外のテキスト(説明文やコードブロックのバッククォート)は絶対に出力しないでください。`

export async function analyzeReceiptImage(
  apiKey: string,
  baseUrl: string,
  imageDataUrl: string
): Promise<OcrResult> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'この画像から情報を抽出してJSON形式で出力してください。' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenAI API error: ${res.status} ${errText}`)
  }

  const data: any = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI応答に内容がありません')

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    // コードブロックが混ざっている場合の保険
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('OCR結果の解析に失敗しました')
    parsed = JSON.parse(match[0])
  }

  const items: OcrItem[] = Array.isArray(parsed.items)
    ? parsed.items.map((it: any) => ({
        name: String(it.name ?? '').trim() || '項目',
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        amount: Number(it.amount) || Number(it.unit_price || 0) * Number(it.quantity || 1),
      }))
    : []

  return {
    vendor_name: String(parsed.vendor_name ?? '').trim(),
    document_type: String(parsed.document_type ?? '').trim() || 'その他',
    purchase_date: String(parsed.purchase_date ?? '').trim(),
    total_amount: Number(parsed.total_amount) || items.reduce((s, it) => s + it.amount, 0),
    items,
  }
}
