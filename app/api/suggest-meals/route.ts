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

  const context = [
    settings ? `Household: ${settings.household_size} people` : '',
    settings?.dietary_preferences?.length ? `Household dietary preferences: ${settings.dietary_preferences.join(', ')}` : '',
    settings?.vegetarian_meals_per_week ? `At least ${settings.vegetarian_meals_per_week} meals this week should be vegetarian` : '',
    settings?.snacks ? `Typical snacks: ${settings.snacks}` : '',
    peopleContext ? `Household members:\n${peopleContext}` : '',
    recipes?.length ? `Favourite recipes: ${recipes.filter(r => r.rating >= 4).map(r => r.name).join(', ')}` : '',
    pantryNames.length
      ? `Pantry items (may be in Estonian, Russian, Finnish or English — prioritise meals that use these up): ${pantryNames.join(', ')}`
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
  if (activeFilters.usePantry && pantryNames.length) {
    filterLines.push(`PANTRY PRIORITY: Try to incorporate pantry items into as many meals as possible: ${pantryNames.join(', ')}.`)
  }
  const filterConstraints = filterLines.length ? `\nUSER CONSTRAINTS — HARD REQUIREMENTS, override all other rules:\n${filterLines.join('\n')}` : ''

  const mealTypeList = activeMealTypes.join(', ')

  const systemPrompt = `You are a creative meal planning assistant for NOM. Suggest ${suggestionCount} diverse, delicious options for EACH of these meal types: ${mealTypeList}.

RULES FOR ALL MEAL TYPES:
- Names must be specific and appetising (e.g. "Lemon Ricotta Pancakes with Blueberry Compote" not "Pancakes")
- No repetition within or across meal types
- Match the meal type appropriately — breakfast ideas should be breakfast-appropriate, snacks should be light, etc.

DINNER DIVERSITY RULES (apply only to dinner):
1. No two meals from the same cuisine
2. Vary the protein: fish/seafood, poultry, red meat, plant-based
3. Vary the cooking style: soup/stew, salad/light, baked/roasted, stir-fry/skillet
4. Vary the carb: rice, pasta, potatoes, grains, no-carb
5. At least one lesser-known or adventurous dish

LUNCH DIVERSITY RULES (apply only to lunch):
1. Vary between warm and cold options
2. Mix light (salads, soups) and more substantial (wraps, grain bowls) options
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
