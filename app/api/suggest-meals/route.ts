import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { prompt, userId } = await request.json()

  const supabase = await createClient()

  // Fetch user settings, people profiles, and top-rated recipes in parallel
  const [{ data: settings }, { data: people }, { data: recipes }] = await Promise.all([
    supabase.from('settings').select('*').eq('user_id', userId).single(),
    supabase.from('people_profiles').select('name, age_group, dislikes, allergies, dietary_preferences').eq('user_id', userId),
    supabase.from('recipes').select('name, rating, tags').eq('user_id', userId).order('rating', { ascending: false }).limit(20),
  ])

  // Work out which meal types are active
  const activeMealTypes: string[] = []
  if (settings?.plan_breakfast !== false) activeMealTypes.push('breakfast')
  if (settings?.plan_lunch !== false) activeMealTypes.push('lunch')
  if (settings?.plan_dinner !== false) activeMealTypes.push('dinner')

  // Number of suggestions = 7 meals (one per day for the primary meal type)
  const suggestionCount = 7

  // Build context
  const peopleContext = people?.map(p => {
    const parts = [`${p.name} (${p.age_group})`]
    if (p.dislikes?.length) parts.push(`dislikes: ${p.dislikes.join(', ')}`)
    if (p.allergies?.length) parts.push(`allergies: ${p.allergies.join(', ')}`)
    if (p.dietary_preferences?.length) parts.push(`diet: ${p.dietary_preferences.join(', ')}`)
    return parts.join(' — ')
  }).join('\n') || ''

  const context = [
    settings ? `Household: ${settings.household_size} people` : '',
    settings?.dietary_preferences?.length ? `Household dietary preferences: ${settings.dietary_preferences.join(', ')}` : '',
    activeMealTypes.length ? `Planning meals for: ${activeMealTypes.join(', ')}` : '',
    settings?.vegetarian_meals_per_week ? `At least ${settings.vegetarian_meals_per_week} meals this week should be vegetarian` : '',
    settings?.snacks ? `Typical snacks: ${settings.snacks}` : '',
    peopleContext ? `Household members:\n${peopleContext}` : '',
    recipes?.length ? `Favourite recipes: ${recipes.filter(r => r.rating >= 4).map(r => r.name).join(', ')}` : '',
  ].filter(Boolean).join('\n')

  const primaryMealType = activeMealTypes.includes('dinner') ? 'dinner'
    : activeMealTypes.includes('lunch') ? 'lunch'
    : activeMealTypes[0] || 'dinner'

  const systemPrompt = `You are a helpful meal planning assistant for NOM.
Suggest exactly ${suggestionCount} ${primaryMealType} meal ideas for this week based on the household's preferences.
Return ONLY a JSON array of ${suggestionCount} meal name strings. No explanation. No extra text.
Household context:
${context}`

  const userMessage = prompt
    ? `Suggest meals for this week. Extra notes: ${prompt}`
    : `Suggest ${suggestionCount} great ${primaryMealType} meals for this week.`

  const FALLBACK = ['Pasta Carbonara', 'Chicken Stir Fry', 'Vegetable Curry', 'Salmon with Rice', 'Tomato Soup', 'Greek Salad', 'Beef Tacos']

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

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic API error:', response.status, err)
      return NextResponse.json({ meals: FALLBACK })
    }

    const data = await response.json()

    // If the API returned an error object instead of a message
    if (data.type === 'error') {
      console.error('Anthropic error:', data.error)
      return NextResponse.json({ meals: FALLBACK })
    }

    const text = data.content?.[0]?.text || ''
    if (!text) return NextResponse.json({ meals: FALLBACK })

    const match = text.match(/\[[\s\S]*\]/)
    const meals = match ? JSON.parse(match[0]) : []

    return NextResponse.json({ meals: meals.length > 0 ? meals : FALLBACK })
  } catch (error) {
    console.error('AI error:', error)
    return NextResponse.json({ meals: FALLBACK })
  }
}
