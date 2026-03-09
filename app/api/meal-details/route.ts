import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { mealName, mealPlanId } = await request.json()
  if (!mealName) return NextResponse.json({ error: 'No meal name' }, { status: 400 })

  const supabase = await createClient()

  // Return cached data if we already have it (instructions not cached in DB, re-fetched each session)
  if (mealPlanId) {
    const { data: cached } = await supabase
      .from('meal_plans')
      .select('cooking_time_minutes, calories_per_serving, ingredients')
      .eq('id', mealPlanId)
      .single()
    if (cached?.cooking_time_minutes && cached?.calories_per_serving && cached?.ingredients?.length) {
      // Still need to fetch instructions — call AI with just instructions
      const instructions = await fetchInstructions(mealName)
      return NextResponse.json({
        cooking_time_minutes: cached.cooking_time_minutes,
        calories_per_serving: cached.calories_per_serving,
        ingredients: cached.ingredients,
        instructions,
      })
    }
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
        max_tokens: 800,
        system: `You are a cooking assistant. Given a meal name, return a JSON object with these exact fields:
- cooking_time_minutes: integer (realistic total time including prep)
- calories_per_serving: integer (reasonable estimate per serving)
- ingredients: string array of 4-8 main ingredients (short, like "2 chicken breasts", "200g pasta")
- instructions: string array of 4-6 short cooking steps (each step 1 sentence, plain text, no numbering)

Return ONLY valid JSON. No explanation, no markdown, no extra text.`,
        messages: [{
          role: 'user',
          content: `Give me full recipe details for: ${mealName}`,
        }],
      }),
    })

    if (!response.ok) return NextResponse.json(fallback(mealName))

    const data = await response.json()
    if (data.type === 'error') return NextResponse.json(fallback(mealName))

    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json(fallback(mealName))

    let details: { cooking_time_minutes: number; calories_per_serving: number; ingredients: string[]; instructions: string[] }
    try {
      details = JSON.parse(match[0])
    } catch {
      return NextResponse.json(fallback(mealName))
    }

    // Cache time/calories/ingredients back to the meal_plans row
    if (mealPlanId) {
      await supabase
        .from('meal_plans')
        .update({
          cooking_time_minutes: details.cooking_time_minutes,
          calories_per_serving: details.calories_per_serving,
          ingredients: details.ingredients,
        })
        .eq('id', mealPlanId)
    }

    return NextResponse.json(details)
  } catch {
    return NextResponse.json(fallback(mealName))
  }
}

async function fetchInstructions(mealName: string): Promise<string[]> {
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
        max_tokens: 400,
        system: `Return a JSON array of 4-6 short cooking steps for the given meal. Each step is one plain sentence. No numbering, no markdown. Return ONLY valid JSON array.`,
        messages: [{ role: 'user', content: `Cooking steps for: ${mealName}` }],
      }),
    })
    if (!response.ok) return []
    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch {
    return []
  }
}

function fallback(name: string) {
  return {
    cooking_time_minutes: 30,
    calories_per_serving: 450,
    ingredients: ['See full recipe for ingredient list'],
    instructions: ['Prepare your ingredients.', 'Cook according to your preferred method.', 'Season to taste and serve.'],
    _fallback: true,
  }
}
