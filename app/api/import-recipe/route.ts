import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { url } = await request.json()

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  // Fetch the page HTML server-side (bypasses CORS)
  let html = ''
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
    })
    if (!res.ok) {
      // Some sites (AllRecipes, NYT, etc.) block automated fetches entirely.
      // Give a helpful message with alternatives.
      return NextResponse.json({
        error: `That site blocked the import (${res.status}). Try a recipe from BBC Good Food, Serious Eats, or Food Network — or add it manually.`
      }, { status: 400 })
    }
    html = await res.text()
  } catch {
    return NextResponse.json({ error: 'Could not reach that URL. Check it and try again.' }, { status: 400 })
  }

  // Try to extract JSON-LD structured recipe data first — most recipe sites include it
  let structuredData = ''
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  if (jsonLdMatches) {
    for (const block of jsonLdMatches) {
      const inner = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim()
      if (inner.toLowerCase().includes('recipe')) {
        structuredData = inner.slice(0, 4000) // cap size
        break
      }
    }
  }

  // If no structured data, fall back to stripping HTML tags and sending plain text
  let pageText = structuredData
  if (!pageText) {
    pageText = html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000) // cap to avoid token limits
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 })
  }

  const systemPrompt = `You are a recipe parser for NOM, a meal planning app.
Extract recipe data from the provided webpage content and return it as a raw JSON object.
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
        messages: [{ role: 'user', content: `Extract the recipe from this page content:\n\n${pageText}` }],
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'AI failed to parse the recipe' }, { status: 500 })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text || '{}'
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    let recipe
    try {
      recipe = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try { recipe = JSON.parse(match[0]) } catch { /* fall through */ }
      }
    }

    if (!recipe?.name) {
      return NextResponse.json({ error: 'Could not extract a recipe from that page. Try a different URL.' }, { status: 400 })
    }

    return NextResponse.json({ recipe })
  } catch (error) {
    console.error('import-recipe error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
