import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType, userId } = await request.json()
    if (!imageBase64 || !userId) {
      return NextResponse.json({ error: 'Missing imageBase64 or userId' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch existing pantry so we can skip duplicates
    const { data: existing } = await supabase
      .from('pantry_items')
      .select('name')
      .eq('user_id', userId)
      .eq('in_stock', true)
    const existingNames = (existing || []).map(e => e.name.toLowerCase())

    const systemPrompt = `You are a grocery receipt parser. The user will show you a photo of a grocery receipt.
Extract every food/grocery item purchased. For each item return:
- name: clean product name in English (e.g. "Whole Milk", "Chicken Breast", "Olive Oil")
- quantity: amount if visible on receipt (e.g. "1L", "500g", "2x") — null if not clear
- category: one of Produce, Dairy, Meat, Pantry, Spices, Frozen, Drinks, Bakery, Other

Rules:
- Skip non-food items (bags, discounts, loyalty points, store cards, VAT lines)
- Translate any Estonian/other language item names to English
- If the same product appears multiple times (bought 2 of same thing), merge into one entry with quantity "2x"
- Return ONLY valid JSON, no explanation, no markdown

Return format:
{"items": [{"name": "...", "quantity": "..." | null, "category": "..."}]}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',  // Use vision-capable model
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: 'Please extract all grocery items from this receipt.',
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'AI error' }, { status: 500 })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text || ''

    // Parse JSON from response
    let items: { name: string; quantity: string | null; category: string }[] = []
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        items = parsed.items || []
      }
    } catch {
      return NextResponse.json({ error: 'Could not parse receipt' }, { status: 500 })
    }

    // Filter out items already in pantry
    const newItems = items.filter(item =>
      !existingNames.some(e =>
        e.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(e)
      )
    )

    return NextResponse.json({ items: newItems, skipped: items.length - newItems.length })
  } catch (err) {
    console.error('scan-receipt error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
