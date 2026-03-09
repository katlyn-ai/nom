import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { ingredient, mealName } = await request.json()
  if (!ingredient || !mealName) return NextResponse.json({ substitute: null }, { status: 400 })

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
        max_tokens: 100,
        system: `You are a cooking assistant. Given an ingredient and a meal, suggest ONE simple substitute ingredient that works well in that dish. Reply with ONLY the substitute ingredient string in the same short format as the original (e.g. "2 tbsp butter"). No explanation, no alternatives, just the single best substitute.`,
        messages: [{
          role: 'user',
          content: `Meal: ${mealName}\nIngredient to swap: ${ingredient}\nSubstitute:`,
        }],
      }),
    })

    if (!response.ok) return NextResponse.json({ substitute: null })
    const data = await response.json()
    if (data.type === 'error') return NextResponse.json({ substitute: null })

    const text = (data.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '')
    return NextResponse.json({ substitute: text || null })
  } catch {
    return NextResponse.json({ substitute: null })
  }
}
