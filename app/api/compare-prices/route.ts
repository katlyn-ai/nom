import { NextResponse } from 'next/server'

const STORES_META = [
  { name: 'Barbora', url: 'https://barbora.ee', color: '#E31E2A', delivery: '€2.99 delivery · free from €35' },
  { name: 'Selver', url: 'https://www.selver.ee', color: '#F7941D', delivery: 'Click & collect or home delivery' },
  { name: 'Prisma', url: 'https://www.prismamarket.ee', color: '#003F8A', delivery: 'Click & collect available' },
  { name: 'Rimi', url: 'https://www.rimi.ee', color: '#E2001A', delivery: '€2.49 delivery · free from €40' },
]

export async function POST(request: Request) {
  try {
    const { items } = await request.json()

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    const itemNames: string[] = items.map((i: { name: string }) => i.name)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: 'You are a grocery price assistant for Estonia. You MUST respond with ONLY a raw JSON object — no markdown, no code fences, no backticks, no explanation. Just the JSON.',
        messages: [{
          role: 'user',
          content: `Estimate realistic 2024-2025 prices in euros for this shopping list across 4 Estonian online grocery stores: Barbora, Selver, Prisma, Rimi.

Shopping list (${itemNames.length} items):
${itemNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Price guidelines: Barbora and Rimi are slightly cheaper on essentials. Prisma slightly pricier. Selver mid-range. Vary prices 5-15% between stores naturally.

Return ONLY this JSON structure (no markdown, no code fences):
{"stores":[{"name":"Barbora","items":[{"name":"item","price":1.89}],"subtotal":1.89},{"name":"Selver","items":[{"name":"item","price":1.99}],"subtotal":1.99},{"name":"Prisma","items":[{"name":"item","price":2.09}],"subtotal":2.09},{"name":"Rimi","items":[{"name":"item","price":1.85}],"subtotal":1.85}]}

Include ALL ${itemNames.length} items for each store. Subtotal must equal sum of item prices.`,
        }],
      }),
    })

    if (!response.ok) {
      console.error('Anthropic API error:', response.status)
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }

    const aiData = await response.json()
    const raw: string = aiData.content?.[0]?.text || ''
    // Strip any markdown code fences Claude might add despite instructions
    const text = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON found in response. Raw text:', text.slice(0, 500))
      throw new Error('No JSON in response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Merge AI prices with store metadata (URL, color, delivery info)
    // and recalculate subtotals to ensure accuracy
    const enriched = parsed.stores.map((store: {
      name: string
      items: { name: string; price: number }[]
      subtotal: number
    }) => {
      const meta = STORES_META.find(s => s.name === store.name) ?? STORES_META[0]
      const subtotal = store.items.reduce((sum: number, item: { price: number }) => sum + item.price, 0)
      return { ...meta, ...store, subtotal: +subtotal.toFixed(2) }
    })

    return NextResponse.json({ stores: enriched })
  } catch (e) {
    console.error('compare-prices error:', e)
    return NextResponse.json({ error: 'Failed to compare prices' }, { status: 500 })
  }
}
