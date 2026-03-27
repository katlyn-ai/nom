import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'No userId' }, { status: 400 })

  const supabase = await createClient()

  // Fetch all recipes that have no ingredients yet
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('user_id', userId)
    .or('ingredients.is.null,ingredients.eq.{}')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!recipes || recipes.length === 0) return NextResponse.json({ filled: 0 })

  let filled = 0
  const errors: string[] = []

  for (const recipe of recipes) {
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
          max_tokens: 600,
          system: `You are a cooking assistant. Given a meal name (which may be in Estonian, Finnish, Russian, or English), return a JSON object with:
- description: string (1 sentence describing the dish)
- ingredients: string array of 4-10 main ingredients with quantities (e.g. "400g minced meat", "2 cloves garlic")
- instructions: string of 4-6 numbered steps as plain text, each on its own line
- prep_time: integer (total time in minutes)

Return ONLY valid JSON. No markdown, no explanation.`,
          messages: [{
            role: 'user',
            content: `Recipe: ${recipe.name}`,
          }],
        }),
      })

      if (!response.ok) { errors.push(recipe.name); continue }

      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) { errors.push(recipe.name); continue }

      let details: {
        description?: string
        ingredients?: string[]
        instructions?: string
        prep_time?: number
      }
      try {
        details = JSON.parse(match[0])
      } catch {
        errors.push(recipe.name)
        continue
      }

      if (!details.ingredients?.length) { errors.push(recipe.name); continue }

      await supabase.from('recipes').update({
        description: details.description || '',
        ingredients: details.ingredients,
        instructions: details.instructions || '',
        prep_time: details.prep_time || 30,
      }).eq('id', recipe.id)

      filled++
    } catch {
      errors.push(recipe.name)
    }

    // Small pause between calls to avoid rate limits
    await new Promise(r => setTimeout(r, 200))
  }

  return NextResponse.json({ filled, total: recipes.length, errors })
}
