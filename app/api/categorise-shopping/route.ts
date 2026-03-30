import { NextResponse } from 'next/server'

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Spices', 'Frozen', 'Drinks', 'Bakery', 'Other']

export async function POST(request: Request) {
  const { items } = await request.json() as { items: string[] }
  if (!items?.length) return NextResponse.json({ categorised: [] })

  const itemList = items.map((name, i) => `${i}: ${name}`).join('\n')

  const systemPrompt = `You are a grocery categorisation assistant. Assign each item to exactly one of these categories:
${CATEGORIES.join(', ')}

Category definitions:
- Produce: fresh fruit, vegetables, herbs, salad
- Dairy: milk, cheese, yogurt, butter, eggs, cream
- Meat: meat, poultry, fish, seafood, cold cuts
- Pantry: dry goods, tins, jars, condiments, spices, oil, flour, pasta, rice, snacks, baking
- Frozen: anything frozen
- Drinks: water, juice, wine, beer, soft drinks, coffee, tea
- Bakery: bread, rolls, wraps, pastries
- Other: anything that doesn't clearly fit the above

Items may be written in any language. Use your knowledge to identify each item.

Return ONLY a JSON array — one object per item in the same order.
Each element: { "index": <number>, "category": "<category>" }
No explanation. No markdown. No extra text.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Categorise these ingredients:\n${itemList}` }],
      }),
    })

    if (!response.ok) {
      console.error('Anthropic error:', response.status)
      // Fall back to 'Other' for all items
      return NextResponse.json({ categorised: items.map(() => 'Other') })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
    const match = cleaned.match(/\[[\s\S]*\]/)

    if (!match) {
      return NextResponse.json({ categorised: items.map(() => 'Other') })
    }

    const parsed: { index: number; category: string }[] = JSON.parse(match[0])
    // Map back by index, defaulting to 'Other' for any missing entries
    const categorised = items.map((_, i) => {
      const entry = parsed.find(e => e.index === i)
      return CATEGORIES.includes(entry?.category ?? '') ? entry!.category : 'Other'
    })

    return NextResponse.json({ categorised })
  } catch (err) {
    console.error('Categorise shopping error:', err)
    return NextResponse.json({ categorised: items.map(() => 'Other') })
  }
}
