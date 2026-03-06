'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { key: 'lunch', label: 'Lunch', emoji: '☀️' },
  { key: 'dinner', label: 'Dinner', emoji: '🌙' },
]

type Meal = {
  id?: string
  day_index: number
  meal_type: string
  custom_name: string
  recipe_id?: string
}

export default function MealsPage() {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [generatedSuggestions, setGeneratedSuggestions] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('day_index')
      setMeals(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/suggest-meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, userId }),
      })
      const data = await res.json()
      if (data.meals) {
        setGeneratedSuggestions(data.meals)
      }
    } catch (e) {
      console.error(e)
    }
    setGenerating(false)
  }

  const saveMeal = async (dayIndex: number, mealType: string, name: string) => {
    if (!userId) return
    const existing = meals.find(m => m.day_index === dayIndex && m.meal_type === mealType)
    if (existing?.id) {
      await supabase.from('meal_plans').update({ custom_name: name }).eq('id', existing.id)
      setMeals(prev => prev.map(m => m.id === existing.id ? { ...m, custom_name: name } : m))
    } else {
      const { data } = await supabase.from('meal_plans').insert({
        user_id: userId,
        day_index: dayIndex,
        meal_type: mealType,
        custom_name: name,
      }).select().single()
      if (data) setMeals(prev => [...prev, data])
    }
  }

  const getMeal = (dayIndex: number, mealType: string) =>
    meals.find(m => m.day_index === dayIndex && m.meal_type === mealType)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <Nav />
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-60 px-6 py-8 pb-24 md:pb-8 max-w-4xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
              Meal Plan
            </h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>
              Plan your meals for the week
            </p>
          </div>
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="px-4 py-2.5 rounded-xl text-white text-sm font-medium"
            style={{ background: 'var(--primary)' }}
          >
            ✨ AI Suggest
          </button>
        </div>

        {/* AI suggestion panel */}
        {showPrompt && (
          <div
            className="rounded-2xl p-5 mb-6"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h3 className="font-medium mb-3" style={{ color: 'var(--foreground)' }}>
              Tell NOM what you have in mind
            </h3>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. We want something light this week, no red meat, and one pasta dish…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none mb-3"
              style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-60"
                style={{ background: 'var(--primary)' }}
              >
                {generating ? 'Generating…' : 'Generate meals'}
              </button>
              <button
                onClick={() => setShowPrompt(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ color: 'var(--muted)', background: 'var(--border)' }}
              >
                Cancel
              </button>
            </div>

            {generatedSuggestions.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                  Suggestions — click to add to your plan:
                </p>
                <div className="flex flex-wrap gap-2">
                  {generatedSuggestions.map((s, i) => (
                    <span
                      key={i}
                      className="text-sm px-3 py-1.5 rounded-full cursor-pointer hover:opacity-80"
                      style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Weekly grid */}
        <div className="space-y-4">
          {DAYS.map((day, dayIndex) => (
            <div
              key={day}
              className="rounded-2xl p-4"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <p className="font-medium mb-3" style={{ color: 'var(--foreground)' }}>{day}</p>
              <div className="grid grid-cols-3 gap-3">
                {MEAL_TYPES.map(({ key, label, emoji }) => {
                  const existing = getMeal(dayIndex, key)
                  return (
                    <div key={key}>
                      <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
                        {emoji} {label}
                      </p>
                      <input
                        type="text"
                        defaultValue={existing?.custom_name || ''}
                        placeholder="Add meal…"
                        onBlur={e => {
                          if (e.target.value) saveMeal(dayIndex, key, e.target.value)
                        }}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                        style={{
                          borderColor: 'var(--border)',
                          background: 'var(--background)',
                          color: 'var(--foreground)',
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
