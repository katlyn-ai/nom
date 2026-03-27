import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { prompt, userId, filters, existingMeals } = await request.json()
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

  const systemPrompt = `You are a creative, globally-minded meal planning assistant for NOM. Suggest ${suggestionCount} diverse, delicious options for EACH of these meal types: ${mealTypeList}.

GLOBAL DIVERSITY RULES (apply across ALL meal types combined):
- Treat the full list of suggestions across all meal types as ONE pool. No cuisine, flavour base, or primary seasoning (e.g. miso, gochujang, coconut curry, tomato cream) may appear more than ONCE across the entire pool.
- Cover at least 5 different world regions across all suggestions (e.g. Mediterranean, East Asian, South Asian, Latin American, Middle Eastern, European, African, etc.)
- Do not be biased by what may be in the user's pantry — suggest freely from all world cuisines

NAMING RULES:
- Names must be specific and appetising (e.g. "Lemon Ricotta Pancakes with Blueberry Compote" not "Pancakes")
- No two suggestions across any meal type may share the same main protein + sauce combination

DINNER DIVERSITY (7 suggestions must cover all of these):
1. Each from a different world cuisine
2. Proteins: include fish/seafood, poultry, red meat, AND plant-based — at least one each
3. Cooking styles: include soup/stew, something baked/roasted, something stir-fried, something light
4. Carbs: include rice, pasta or noodles, potatoes or grains, AND one no-carb option
5. At least 2 suggestions must be dishes the user is unlikely to have made before

LUNCH DIVERSITY (7 suggestions must cover all of these):
1. Each from a different world cuisine
2. Mix warm and cold options (at least 2 of each)
3. Mix light (soups, salads) and more filling (wraps, bowls, sandwiches)
4. Vary the protein across suggestions
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
