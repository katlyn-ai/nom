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
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `You are a grocery price assistant for Estonia. Estimate realistic prices in euros for this shopping list across 4 Estonian online grocery stores.

Shopping list:
${itemNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Stores to compare: Barbora, Selver, Prisma, Rimi

Use realistic 2024-2025 Estonian supermarket prices. Make prices vary naturally between stores (typically 5-15% difference). Barbora and Rimi tend to be slightly cheaper on essentials. Prisma tends to be slightly pricier. Selver is mid-range.

Return ONLY valid JSON, no other text:
{
  "stores": [
    {
      "name": "Barbora",
      "items": [{"name": "eggs 12pk", "price": 1.89}],
      "subtotal": 1.89
    },
    {
      "name": "Selver",
      "items": [{"name": "eggs 12pk", "price": 1.99}],
      "subtotal": 1.99
    },
    {
      "name": "Prisma",
      "items": [{"name": "eggs 12pk", "price": 2.09}],
      "subtotal": 2.09
    },
    {
      "name": "Rimi",
      "items": [{"name": "eggs 12pk", "price": 1.85}],
      "subtotal": 1.85
    }
  ]
}

The subtotal must equal the sum of all item prices for that store.`,
        }],
      }),
    })

    if (!response.ok) {
      console.error('Anthropic API error:', response.status)
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }

    const aiData = await response.json()
    const text: string = aiData.content?.[0]?.text || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

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
