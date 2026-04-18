import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType } = await request.json()
    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing image' }, { status: 400 })
    }

    const systemPrompt = `You are a recipe extraction assistant. The user will show you a photo of a recipe — from a recipe book, magazine, printed card, or handwritten note.

Extract the full recipe and return it as a single JSON object with these fields:
- name: string — the recipe title
- description: string — 1–2 sentence description of the dish (write one if not present)
- ingredients: string[] — list of ingredients, each with quantity (e.g. "200g pasta", "2 cloves garlic, minced")
- instructions: string — full cooking method as a single string, steps separated by newlines
- servings: number — number of servings (default 4 if not stated)
- prep_time: number — total time in minutes (default 30 if not stated)
- tags: string[] — 2–5 descriptive tags (e.g. ["pasta", "quick", "vegetarian"])

Rules:
- Translate everything to English if it's in another language
- If any part of the recipe is obscured or cut off in the photo, do your best with what's visible
- For ingredients, keep the format "quantity unit ingredient, preparation" (e.g. "3 tbsp olive oil", "1 onion, finely diced")
- For instructions, write them as clear numbered steps separated by newlines
- Return ONLY the JSON object — no explanation, no markdown, no extra text`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: 'Please extract the recipe from this photo.',
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'AI error' }, { status: 500 })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text || ''

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not read recipe from photo' }, { status: 422 })
    }

    const recipe = JSON.parse(jsonMatch[0])
    return NextResponse.json({ recipe })
  } catch (err) {
    console.error('scan-recipe error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
