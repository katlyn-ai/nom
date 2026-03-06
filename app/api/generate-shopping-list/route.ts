import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { userId } = await request.json()

  const supabase = await createClient()

  // Fetch this week's meal plan
  const { data: meals } = await supabase
    .from('meal_plans')
    .select('custom_name, recipes(name, ingredients)')
    .eq('user_id', userId)

  const mealNames = meals?.map(m => m.custom_name || (m.recipes as unknown as { name: string } | null)?.name).filter(Boolean) || []

  if (mealNames.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const systemPrompt = `You are a helpful assistant for NOM, a meal planning app.
Given a list of meals for the week, generate a shopping list.
Return ONLY a JSON array of objects with "name" (string) and "category" (one of: Produce, Dairy, Meat, Pantry, Frozen, Drinks, Other).
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
