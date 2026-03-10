import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { text } = await request.json()

  if (!text?.trim()) {
    return NextResponse.json({ error: 'No recipe text provided' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 })
  }

  const systemPrompt = `You are a recipe parser for NOM, a meal planning app.
Extract recipe data from the provided text and return it as a raw JSON object.
You MUST respond with ONLY a raw JSON object — no markdown, no code fences, no backticks, no explanation.
The JSON must have these exact fields:
- "name": string (recipe title)
- "description": string (1-2 sentence description, or empty string)
- "ingredients": array of strings (each ingredient as a string, e.g. "200g pasta")
- "instructions": string (full instructions as plain text, steps separated by newlines)
- "servings": number (default 4 if not found)
- "prep_time": number (total time in minutes, default 30 if not found)
- "tags": array of strings (e.g. ["pasta", "vegetarian", "quick"])
Example: {"name":"Pasta","description":"...","ingredients":["200g pasta","2 eggs"],"instructions":"Step 1...","servings":4,"prep_time":20,"tags":["pasta"]}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Extract the recipe from this text:\n\n${text.slice(0, 8000)}` }],
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'AI failed to parse the recipe' }, { status: 500 })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text || '{}'
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    let recipe
    try {
      recipe = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        try { recipe = JSON.parse(match[0]) } catch { /* fall through */ }
      }
    }

    if (!recipe?.name) {
      return NextResponse.json({ error: 'Could not extract a recipe from that text. Make sure you copied the full recipe.' }, { status: 400 })
    }

    return NextResponse.json({ recipe })
  } catch (error) {
    console.error('import-recipe error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
