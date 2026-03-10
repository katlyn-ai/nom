import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { prompt, userId, filters } = await request.json()
  const activeFilters: { cuisines?: string[]; proteins?: string[]; maxTime?: number | null; usePantry?: boolean } = filters || {}

  const supabase = await createClient()

  // Fetch user settings, people profiles, top-rated recipes, and pantry in parallel
  const [{ data: settings }, { data: people }, { data: recipes }, { data: pantry }] = await Promise.all([
    supabase.from('settings').select('*').eq('user_id', userId).single(),
    supabase.from('people_profiles').select('name, age_group, dislikes, allergies, dietary_preferences').eq('user_id', userId),
    supabase.from('recipes').select('name, rating, tags').eq('user_id', userId).order('rating', { ascending: false }).limit(20),
    supabase.from('pantry_items').select('name').eq('user_id', userId).eq('in_stock', true),
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

  // Pantry items — users may write in any language (Estonian, Russian, English, etc.)
  const pantryNames = (pantry || []).map(p => p.name).filter(Boolean)

  const context = [
    settings ? `Household: ${settings.household_size} people` : '',
    settings?.dietary_preferences?.length ? `Household dietary preferences: ${settings.dietary_preferences.join(', ')}` : '',
    activeMealTypes.length ? `Planning meals for: ${activeMealTypes.join(', ')}` : '',
    settings?.vegetarian_meals_per_week ? `At least ${settings.vegetarian_meals_per_week} meals this week should be vegetarian` : '',
    settings?.snacks ? `Typical snacks: ${settings.snacks}` : '',
    peopleContext ? `Household members:\n${peopleContext}` : '',
    recipes?.length ? `Favourite recipes: ${recipes.filter(r => r.rating >= 4).map(r => r.name).join(', ')}` : '',
    pantryNames.length
      ? `Items currently in the pantry (prioritise meals that USE these up — items may be written in any language such as Estonian, Russian, Finnish or English): ${pantryNames.join(', ')}`
      : '',
  ].filter(Boolean).join('\n')

  const primaryMealType = activeMealTypes.includes('dinner') ? 'dinner'
    : activeMealTypes.includes('lunch') ? 'lunch'
    : activeMealTypes[0] || 'dinner'

  // Build filter constraints
  const filterLines: string[] = []
  if (activeFilters.cuisines?.length) {
    filterLines.push(`CUISINE CONSTRAINT: Only suggest meals from these cuisines: ${activeFilters.cuisines.join(', ')}. Do not include meals from any other cuisine.`)
  }
  if (activeFilters.proteins?.length) {
    filterLines.push(`PROTEIN CONSTRAINT: Only use these proteins across the week's meals: ${activeFilters.proteins.join(', ')}. Do not include meals that use other protein types.`)
  }
  if (activeFilters.maxTime) {
    filterLines.push(`COOKING TIME CONSTRAINT: Every meal MUST be achievable in under ${activeFilters.maxTime} minutes. Do not suggest any meal that takes longer.`)
  }
  if (activeFilters.usePantry && pantryNames.length) {
    filterLines.push(`PANTRY PRIORITY: The user wants to use up their pantry items as much as possible this week. Try to incorporate pantry items into as many meals as you can: ${pantryNames.join(', ')}.`)
  }
  const filterConstraints = filterLines.length ? `\nUSER CONSTRAINTS — these are HARD REQUIREMENTS, override all other rules:\n${filterLines.join('\n')}` : ''

  const systemPrompt = `You are a creative meal planning assistant for NOM. Your job is to suggest exciting, diverse, and delicious ${primaryMealType} meals for the week.

DIVERSITY RULES — you MUST follow all of these:
1. No two meals from the same cuisine (e.g. only one Italian, one Asian, one Mexican, etc.)
2. Vary the protein: include fish/seafood, poultry, red meat, and at least one plant-based option across the week
3. Vary the cooking style: include at least one soup/stew, one salad or light dish, one baked or roasted dish, and one quick stir-fry or skillet meal
4. Vary the carb: mix rice, pasta, potatoes, bread, grains, and no-carb options
5. Include at least one lesser-known or adventurous dish that the household is unlikely to have made recently
6. Do NOT suggest generic meal names — be specific and appealing (e.g. "Lemon Herb Roasted Chicken" not "Chicken", "Spiced Lamb Flatbreads with Yoghurt" not "Lamb dish")
${filterConstraints}

Household context:
${context}

Return ONLY a JSON array of exactly ${suggestionCount} meal name strings. No explanation. No extra text. No markdown.`

  const userMessage = prompt
    ? `Suggest ${suggestionCount} diverse and interesting ${primaryMealType} meals for this week. Extra notes from the user: ${prompt}`
    : `Suggest ${suggestionCount} diverse, interesting, and delicious ${primaryMealType} meals for this week. Make them varied and exciting — different cuisines, proteins, and cooking styles.`

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
        max_tokens: 800,
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
      }),
    })

    if (!response.ok) {
      console.error('Anthropic API error:', response.status)
      return NextResponse.json({ meals: FALLBACK })
    }

    const data = await response.json()

    if (data.type === 'error') {
      console.error('Anthropic error:', data.error)
      return NextResponse.json({ meals: FALLBACK })
    }

    const text = data.content?.[0]?.text || ''
    if (!text) return NextResponse.json({ meals: FALLBACK })

    const match = text.match(/\[[\s\S]*\]/)
    let meals: string[] = []
    try {
      meals = match ? JSON.parse(match[0]) : []
    } catch {
      return NextResponse.json({ meals: FALLBACK })
    }

    return NextResponse.json({ meals: meals.length > 0 ? meals : FALLBACK })
  } catch (error) {
    console.error('AI error:', error)
    return NextResponse.json({ meals: FALLBACK })
  }
}
