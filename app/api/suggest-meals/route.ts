import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { prompt, userId, filters, existingMeals, previousSuggestions } = await request.json()
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

  const suggestionCount = 7

  // Build context
  const peopleContext = people?.map(p => {
    const parts = [`${p.name} (${p.age_group})`]
    if (p.dislikes?.length) parts.push(`dislikes: ${p.dislikes.join(', ')}`)
    if (p.allergies?.length) parts.push(`allergies: ${p.allergies.join(', ')}`)
    if (p.dietary_preferences?.length) parts.push(`diet: ${p.dietary_preferences.join(', ')}`)
    return parts.join(' — ')
  }).join('\n') || ''

  const pantryNames = (pantry || []).map(p => p.name).filter(Boolean)

  const alreadyPlanned: string[] = Array.isArray(existingMeals) ? existingMeals.filter(Boolean) : []
  const prevSuggested: string[] = Array.isArray(previousSuggestions) ? previousSuggestions.filter(Boolean) : []

  // Favourite recipes used only as "things they enjoy eating" context — not to bias cuisine direction
  const favouriteNames = recipes?.filter(r => (r.rating ?? 0) >= 4).map(r => r.name) ?? []

  const context = [
    settings ? `Household: ${settings.household_size} people` : '',
    settings?.dietary_preferences?.length ? `Household dietary preferences: ${settings.dietary_preferences.join(', ')}` : '',
    settings?.vegetarian_meals_per_week ? `At least ${settings.vegetarian_meals_per_week} meals this week should be vegetarian` : '',
    settings?.snacks ? `Typical snacks: ${settings.snacks}` : '',
    peopleContext ? `Household members:\n${peopleContext}` : '',
    // Only mention pantry when the user has explicitly turned on the pantry filter
    activeFilters.usePantry && pantryNames.length
      ? `Pantry items available (prioritise using these): ${pantryNames.join(', ')}`
      : '',
    // Favourites: avoid repeating them too often — suggest something fresh
    favouriteNames.length
      ? `Meals this household already knows and likes (avoid repeating these exact dishes, but similar style is fine): ${favouriteNames.slice(0, 10).join(', ')}`
      : '',
    alreadyPlanned.length
      ? `ALREADY PLANNED this week — DO NOT repeat or closely resemble these: ${alreadyPlanned.join(', ')}`
      : '',
    prevSuggested.length
      ? `PREVIOUSLY SUGGESTED (user has already seen these — DO NOT suggest them again, not even a variation with different vegetables or a slightly different name): ${prevSuggested.join(', ')}`
      : '',
  ].filter(Boolean).join('\n')

  // Build filter constraints
  const filterLines: string[] = []
  if (activeFilters.cuisines?.length) {
    filterLines.push(`CUISINE CONSTRAINT: Only suggest meals from these cuisines: ${activeFilters.cuisines.join(', ')}. Do not include meals from any other cuisine.`)
  }
  if (activeFilters.proteins?.length) {
    filterLines.push(`PROTEIN CONSTRAINT: Only use these proteins: ${activeFilters.proteins.join(', ')}. Do not include meals that use other protein types.`)
  }
  if (activeFilters.maxTime) {
    filterLines.push(`COOKING TIME CONSTRAINT: Every meal MUST be achievable in under ${activeFilters.maxTime} minutes.`)
  }
  const filterConstraints = filterLines.length ? `\nUSER CONSTRAINTS — HARD REQUIREMENTS, override all other rules:\n${filterLines.join('\n')}` : ''

  const mealTypeList = activeMealTypes.join(', ')

  const systemPrompt = `You are a practical meal planning assistant for a busy family in Estonia. Suggest ${suggestionCount} realistic, delicious options for EACH of these meal types: ${mealTypeList}.

CONTEXT — who you are cooking for:
- A couple with a baby, cooking after work on weekdays
- Ingredients must be available in a normal Estonian supermarket (Barbora, Selver, Prisma, Rimi)
- Shortcuts are fine: premade sauces (pesto, curry paste, teriyaki, passata), store-bought pastry, ready marinades
- Meals should be achievable in 15–45 minutes on most nights
- Think of food a regular Estonian family actually eats: pasta dishes, chicken or pork with potatoes or rice, simple soups, salads, oven dishes, stir-fries, wraps, quick Asian-inspired meals, classic European comfort food
- Avoid anything requiring hard-to-find ingredients (e.g. plantain, octopus, specialty cuts, obscure spices)

VARIETY RULES:
- Do NOT suggest the same protein + cooking style twice (e.g. no two "chicken stir-fry" style dishes)
- Vary across: pasta, rice, potatoes, bread/wraps, soup, salad
- Mix quick weeknight meals with a couple of slightly more involved options
- It is fine to include Asian-inspired dishes, Mediterranean, or classic Estonian/European food — just keep ingredients realistic
- Names must be specific and appetising (e.g. "Creamy Bacon Pasta with Spinach" not just "Pasta")
- Do not repeat a protein + sauce combination across lunch and dinner in the same batch
- If a PREVIOUSLY SUGGESTED list is provided in the context, every meal on it is completely off-limits — no variations, no renamed versions, no "similar style"
${filterConstraints}

Household context:
${context}

Return ONLY a JSON object. Include only the keys for the requested meal types. No explanation. No extra text. No markdown.
Example structure: { "breakfast": ["name1","name2",...], "lunch": ["name1",...], "snack": ["name1",...], "dinner": ["name1",...] }`

  const userMessage = prompt
    ? `Suggest ${suggestionCount} options for each of these meal types: ${mealTypeList}. Extra notes: ${prompt}`
    : `Suggest ${suggestionCount} diverse, exciting options for each of these meal types: ${mealTypeList}.`

  const FALLBACK: Record<string, string[]> = {
    breakfast: ['Avocado Toast with Poached Eggs', 'Greek Yogurt Parfait with Granola', 'Banana Oat Pancakes', 'Spinach & Feta Omelette', 'Overnight Oats with Berries', 'Smoothie Bowl with Chia Seeds', 'Veggie Breakfast Burrito'],
    lunch: ['Caesar Salad with Grilled Chicken', 'Roasted Veggie Grain Bowl', 'Classic BLT on Sourdough', 'Tomato Basil Soup with Crusty Bread', 'Tuna Nicoise Salad', 'Chicken & Avocado Wrap', 'Lentil & Roasted Pepper Soup'],
    snack: ['Apple Slices with Almond Butter', 'Hummus with Cucumber & Carrots', 'Trail Mix with Dark Chocolate', 'Greek Yogurt with Honey', 'Rice Cakes with Avocado', 'Cheese & Whole Grain Crackers', 'Edamame with Sea Salt'],
    dinner: ['Pasta Carbonara', 'Chicken Stir Fry', 'Vegetable Curry', 'Salmon with Rice', 'Beef Tacos', 'Greek Salad with Falafel', 'Shakshuka'],
  }

  const buildFallback = () => {
    const fb: Record<string, string[]> = {}
    activeMealTypes.forEach(mt => { fb[mt] = FALLBACK[mt] || FALLBACK.dinner })
    return fb
  }

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
        max_tokens: 1500,
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
      }),
    })

    if (!response.ok) {
      console.error('Anthropic API error:', response.status)
      return NextResponse.json({ meals: buildFallback() })
    }

    const data = await response.json()

    if (data.type === 'error') {
      console.error('Anthropic error:', data.error)
      return NextResponse.json({ meals: buildFallback() })
    }

    const text = data.content?.[0]?.text || ''
    if (!text) return NextResponse.json({ meals: buildFallback() })

    // Strip code fences and parse object
    const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    let mealsByType: Record<string, string[]> = {}
    try {
      mealsByType = match ? JSON.parse(match[0]) : {}
    } catch {
      return NextResponse.json({ meals: buildFallback() })
    }

    // Fill in any missing meal types with fallback
    activeMealTypes.forEach(mt => {
      if (!Array.isArray(mealsByType[mt]) || mealsByType[mt].length === 0) {
        mealsByType[mt] = FALLBACK[mt] || FALLBACK.dinner
      }
    })

    return NextResponse.json({ meals: mealsByType })
  } catch (error) {
    console.error('AI error:', error)
    return NextResponse.json({ meals: buildFallback() })
  }
}
