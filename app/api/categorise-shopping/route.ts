import { NextResponse } from 'next/server'

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Grains & Pasta', 'Dry Goods', 'Condiments', 'Tins & Jars', 'Spices', 'Bakery', 'Frozen', 'Drinks', 'Other']

export async function POST(request: Request) {
  const { items } = await request.json() as { items: string[] }
  if (!items?.length) return NextResponse.json({ categorised: [] })

  const itemList = items.map((name, i) => `${i}: ${name}`).join('\n')

  const systemPrompt = `You are a grocery categorisation assistant. Assign each item to exactly one of these categories:
${CATEGORIES.join(', ')}

Category definitions:
- Produce: fresh fruit, vegetables, fresh herbs (basil, parsley, dill), salad leaves
- Dairy: milk, cheese, yogurt, butter, eggs, cream, crème fraîche
- Meat: fresh or raw meat, poultry, fish, seafood, cold cuts, bacon, sausages
- Grains & Pasta: rice, pasta, noodles, couscous, quinoa, oats, polenta, lentils, dried beans, dried chickpeas
- Dry Goods: flour, sugar, cornstarch, baking powder, baking soda, breadcrumbs, cocoa powder, icing sugar, dried fruit, nuts, seeds, crackers, cereals
- Condiments: oils (olive oil, vegetable oil), vinegars, soy sauce, fish sauce, Worcestershire sauce, mayo, ketchup, mustard, hot sauce, pesto, tahini, miso paste, curry paste, gochujang, honey, maple syrup, jam, nut butter
- Tins & Jars: tinned tomatoes, tinned beans, tinned chickpeas, tinned fish (tuna, sardines), coconut milk, stock cubes/powder, passata, tomato paste, tinned corn, tinned fruit
- Spices: dried spices, dried herbs (oregano, thyme, cumin, paprika, turmeric, cinnamon, black pepper, chilli flakes, bay leaves, mixed herbs)
- Bakery: bread, rolls, wraps, tortillas, pastries, croissants, store-bought pastry
- Frozen: anything frozen (frozen vegetables, frozen fish, frozen meals, ice cream)
- Drinks: water, juice, wine, beer, soft drinks, coffee, tea, oat milk, plant milk
- Other: cleaning products, toiletries, bags, or anything that doesn't clearly fit above

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
