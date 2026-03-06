import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SORT_LABELS: Record<string, string> = {
  popular: 'most popular / best-selling products',
  sale: 'products currently on sale or with promotions',
  price_per_kg: 'products with the lowest price per kg or unit',
  my_brands: "the user's preferred brands listed above",
}

export async function POST(request: Request) {
  const { userId } = await request.json()

  const supabase = await createClient()

  // Fetch meal plan and settings in parallel
  const [{ data: meals }, { data: settings }] = await Promise.all([
    supabase
      .from('meal_plans')
      .select('custom_name, recipes(name, ingredients)')
      .eq('user_id', userId),
    supabase
      .from('settings')
      .select('preferred_brands, store_sort_preference, preferred_store')
      .eq('user_id', userId)
      .single(),
  ])

  const mealNames = meals?.map(m => m.custom_name || (m.recipes as unknown as { name: string } | null)?.name).filter(Boolean) || []

  if (mealNames.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const sortPref = settings?.store_sort_preference || 'popular'
  const sortInstruction = SORT_LABELS[sortPref] || SORT_LABELS.popular
  const preferredBrands = settings?.preferred_brands as string[] | null
  const brandsContext = preferredBrands?.length
    ? `\nPreferred brands/products: ${preferredBrands.join(', ')}. Where possible, suggest these specific brands.`
    : ''
  const storeContext = settings?.preferred_store
    ? `\nShopping at: ${settings.preferred_store}.`
    : ''

  const systemPrompt = `You are a helpful assistant for NOM, a meal planning app.
Given a list of meals for the week, generate a practical shopping list.
Return ONLY a JSON array of objects with "name" (string) and "category" (one of: Produce, Dairy, Meat, Pantry, Frozen, Drinks, Other).
When choosing specific products or brands, prefer ${sortInstruction}.${brandsContext}${storeContext}
Be practical — combine similar items and use realistic quantities.`

  const userMessage = `Generate a shopping list for these meals this week: ${mealNames.join(', ')}`

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
        max_tokens: 800,
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
      }),
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || '[]'
    const match = text.match(/\[[\s\S]*\]/)
    const items = match ? JSON.parse(match[0]) : []

    return NextResponse.json({ items })
  } catch (error) {
    console.error('AI error:', error)
    return NextResponse.json({ items: [] })
  }
}
