import { NextResponse } from 'next/server'

const SORT_LABELS: Record<string, string> = {
  popular: 'most popular / best-selling products',
  sale: 'products currently on sale or with promotions',
  price_per_kg: 'products with the lowest price per kg or unit',
  my_brands: "the user's preferred brands listed above",
}

type Settings = {
  preferred_brands?: string[] | null
  store_sort_preference?: string | null
  preferred_store?: string | null
} | null

type PantryItem = {
  name: string
  quantity?: string | null
}

export async function POST(request: Request) {
  const { mealNames, settings, pantryItems }: {
    mealNames: string[]
    settings: Settings
    pantryItems?: PantryItem[]
  } = await request.json()

  if (!mealNames || mealNames.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const sortPref = settings?.store_sort_preference || 'popular'
  const sortInstruction = SORT_LABELS[sortPref] || SORT_LABELS.popular
  const preferredBrands = settings?.preferred_brands
  const brandsContext = preferredBrands?.length
    ? `\nPreferred brands/products: ${preferredBrands.join(', ')}. Where possible, suggest these specific brands.`
    : ''
  const storeContext = settings?.preferred_store
    ? `\nShopping at: ${settings.preferred_store}.`
    : ''

  // Build pantry context — includes quantities for smart diffing
  let pantryContext = ''
  if (pantryItems && pantryItems.length > 0) {
    const pantryLines = pantryItems.map(p =>
      p.quantity ? `${p.name} (have: ${p.quantity})` : p.name
    ).join('\n')

    pantryContext = `

PANTRY INVENTORY (what the user already has at home):
${pantryLines}

PANTRY MATCHING RULES — read carefully before checking any ingredient:

STEP 1 — IDENTIFY ALL INGREDIENTS NEEDED
List every ingredient for every meal first, with the total quantity needed across the whole week.

STEP 2 — MATCH AGAINST PANTRY (use FUZZY matching)
When matching a needed ingredient against the pantry, IGNORE preparation qualifiers and focus on the CORE ingredient name:
- "sundried tomatoes in oil" covers "sundried tomatoes" ✓
- "frozen peas" covers "peas" ✓
- "canned chickpeas" covers "chickpeas" ✓
- "fresh basil" covers "basil" ✓
- "smoked salmon" covers "salmon" ✓
Also match across languages: "Munad"=eggs, "Piim"=milk, "Jahu"=flour, "Küüslauk"=garlic, "Sibul"=onion, etc.

STEP 3 — DECIDE WHAT TO BUY
- Pantry item has a quantity AND quantity is enough → SKIP (do not add to list)
- Pantry item has a quantity BUT not enough → ADD with MISSING quantity only (e.g. need 400g, have ca 200g → add 200g)
- Pantry item has NO quantity → SKIP (assume they have enough)
- Ingredient NOT in pantry at all → ADD with full quantity needed
- When in doubt whether the pantry covers it → ADD to the list. Missing an item at the store is worse than a duplicate.`
  }

  const systemPrompt = `You are a helpful assistant for NOM, a meal planning app.
Given a list of meals for the week, generate a practical shopping list of items the user still needs to buy.
Include realistic quantities for each item (e.g. "200g", "1 litre", "6 pieces", "1 bunch").
You MUST respond with ONLY a raw JSON array — no markdown, no code fences, no backticks, no explanation. Just the JSON array itself.
Each item must have:
  - "name" (string) — the ingredient name only, no quantity in the name
  - "quantity" (string) — the amount needed, e.g. "200g", "1 litre", "3 pieces"
  - "category" (one of: Produce, Dairy, Meat, Pantry, Frozen, Drinks, Other)
When choosing specific products or brands, prefer ${sortInstruction}.${brandsContext}${storeContext}${pantryContext}
Combine similar ingredients across meals (e.g. if two meals need chicken, add total combined quantity).
Example of the EXACT format required: [{"name":"Orzo","quantity":"300g","category":"Pantry"},{"name":"Chicken breast","quantity":"600g","category":"Meat"},{"name":"Broccoli","quantity":"1 head","category":"Produce"}]`

  const userMessage = `Generate a shopping list for these meals this week: ${mealNames.join(', ')}`

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set')
    return NextResponse.json({ items: [], error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1800,
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
      }),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      console.error('Claude API error:', response.status, errBody)
      return NextResponse.json({ items: [], error: `Claude API ${response.status}: ${JSON.stringify(errBody)}` })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text || '[]'

    // Strip markdown code fences if Claude wrapped the JSON
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    let items = []
    try {
      items = JSON.parse(text)
    } catch {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        try { items = JSON.parse(match[0]) } catch { /* fall through */ }
      }
    }

    return NextResponse.json({ items })
  } catch (error) {
    console.error('AI error:', error)
    return NextResponse.json({ items: [], error: String(error) })
  }
}
