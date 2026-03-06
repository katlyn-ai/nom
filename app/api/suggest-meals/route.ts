import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { prompt, userId } = await request.json()

  const supabase = await createClient()

  // Fetch user settings and past recipes for context
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  const { data: recipes } = await supabase
    .from('recipes')
    .select('name, rating, tags')
    .eq('user_id', userId)
    .order('rating', { ascending: false })
    .limit(20)

  const context = [
    settings ? `Household size: ${settings.household_size} people` : '',
    settings?.dietary_preferences?.length ? `Dietary preferences: ${settings.dietary_preferences.join(', ')}` : '',
    recipes?.length ? `Favourite recipes: ${recipes.filter(r => r.rating >= 4).map(r => r.name).join(', ')}` : '',
  ].filter(Boolean).join('\n')

  const systemPrompt = `You are a helpful meal planning assistant for NOM, a meal planning app.
Suggest 7-10 meal ideas based on the user's preferences. Return ONLY a JSON array of meal name strings.
Context about this household:
${context}`

  const userMessage = prompt
    ? `Please suggest meals for this week. Additional notes: ${prompt}`
    : 'Please suggest meals for this week.'

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
        max_tokens: 500,
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
      }),
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || '[]'

    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/)
    const meals = match ? JSON.parse(match[0]) : []

    return NextResponse.json({ meals })
  } catch (error) {
    console.error('AI error:', error)
    return NextResponse.json({ meals: ['Pasta Carbonara', 'Chicken Stir Fry', 'Vegetable Curry', 'Salmon with Rice', 'Tomato Soup', 'Greek Salad', 'Beef Tacos'] })
  }
}
