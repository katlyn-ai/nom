import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Drinks', 'Other']

export async function POST(request: Request) {
  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = await createClient()

  const { data: items, error } = await supabase
    .from('pantry_items')
    .select('id, name, category')
    .eq('user_id', userId)

  if (error || !items?.length) {
    return NextResponse.json({ updated: 0 })
  }

  const itemList = items.map(i => `${i.id}: ${i.name}`).join('\n')

  const systemPrompt = `You are a grocery categorisation assistant. Assign each item to exactly one of these categories:
${CATEGORIES.join(', ')}

Category definitions:
- Produce: fresh fruit, vegetables, herbs, salad
- Dairy: milk, cheese, yogurt, butter, eggs, cream
- Meat: meat, poultry, fish, seafood, cold cuts
- Pantry: dry goods, tins, jars, condiments, spices, oil, flour, pasta, rice, bread, snacks, baking
- Frozen: anything frozen
- Drinks: water, juice, wine, beer, soft drinks, coffee, tea
- Other: anything that doesn't clearly fit the above

IMPORTANT: Items may be written in any language (Estonian, Russian, Finnish, English, etc.). Use your knowledge to identify the item regardless of language.

Return ONLY a JSON array. Each element: { "id": "<id>", "category": "<category>" }
No explanation. No markdown. No extra text.`

  const userMessage = `Categorise these pantry items:\n${itemList}`

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
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      console.error('Anthropic error:', response.status)
      return NextResponse.json({ error: 'AI unavailable' }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (!match) return NextResponse.json({ error: 'Bad AI response' }, { status: 500 })

    let categorised: { id: string; category: string }[] = []
    try {
      categorised = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: 'Parse error' }, { status: 500 })
    }

    // Filter to valid categories only
    const valid = categorised.filter(c => CATEGORIES.includes(c.category))

    // Update in Supabase — batch with individual updates
    await Promise.all(
      valid.map(({ id, category }) =>
        supabase.from('pantry_items').update({ category }).eq('id', id).eq('user_id', userId)
      )
    )

    return NextResponse.json({ updated: valid.length, categorised: valid })
  } catch (err) {
    console.error('Categorise error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
