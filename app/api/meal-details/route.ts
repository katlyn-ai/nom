import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { mealName, mealPlanId } = await request.json()
  if (!mealName) return NextResponse.json({ error: 'No meal name' }, { status: 400 })

  const supabase = await createClient()

  // Return cached data if we already have it
  if (mealPlanId) {
    const { data: cached } = await supabase
      .from('meal_plans')
      .select('cooking_time_minutes, calories_per_serving, ingredients')
      .eq('id', mealPlanId)
      .single()
    if (cached?.cooking_time_minutes && cached?.calories_per_serving && cached?.ingredients?.length) {
      return NextResponse.json({
        cooking_time_minutes: cached.cooking_time_minutes,
        calories_per_serving: cached.calories_per_serving,
        ingredients: cached.ingredients,
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
        max_tokens: 400,
        system: `You are a nutrition and cooking assistant. Given a meal name, return a JSON object with these exact fields:
- cooking_time_minutes: integer (realistic total time including prep)
- calories_per_serving: integer (reasonable estimate per serving)
- ingredients: string array of 4-8 main ingredients (short, like "2 chicken breasts", "200g pasta")

Return ONLY valid JSON. No explanation, no markdown, no extra text.`,
        messages: [{
          role: 'user',
          content: `Give me cooking details for: ${mealName}`,
        }],
      }),
    })

    if (!response.ok) return NextResponse.json(fallback(mealName))

    const data = await response.json()
    if (data.type === 'error') return NextResponse.json(fallback(mealName))

    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json(fallback(mealName))

    let details: { cooking_time_minutes: number; calories_per_serving: number; ingredients: string[] }
    try {
      details = JSON.parse(match[0])
    } catch {
      return NextResponse.json(fallback(mealName))
    }

    // Cache back to the meal_plans row
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

function fallback(name: string) {
  // Reasonable generic fallback so the UI never shows nothing
  return {
    cooking_time_minutes: 30,
    calories_per_serving: 450,
    ingredients: ['See recipe for full ingredient list'],
    _fallback: true,
  }
}
