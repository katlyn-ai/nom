'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ALL_MEAL_TYPES = [
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

type UserSettings = {
  plan_breakfast: boolean
  plan_lunch: boolean
  plan_dinner: boolean
}

export default function MealsPage() {
  const [meals, setMeals] = useState<Meal[]>([])
  const [mealSettings, setMealSettings] = useState<UserSettings>({
    plan_breakfast: true,
    plan_lunch: true,
    plan_dinner: true,
  })
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [generatedSuggestions, setGeneratedSuggestions] = useState<string[]>([])
  const supabase = createClient()

  // Which meal types are active based on settings
  const activeMealTypes = ALL_MEAL_TYPES.filter(mt => {
    if (mt.key === 'breakfast') return mealSettings.plan_breakfast !== false
    if (mt.key === 'lunch') return mealSettings.plan_lunch !== false
    if (mt.key === 'dinner') return mealSettings.plan_dinner !== false
    return true
  })

  // Primary meal type: prefer dinner, fallback to lunch, then breakfast
  const primaryMealType = activeMealTypes.find(m => m.key === 'dinner')?.key
    || activeMealTypes.find(m => m.key === 'lunch')?.key
    || activeMealTypes[0]?.key
    || 'dinner'

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [{ data: mealData }, { data: settingsData }] = await Promise.all([
        supabase.from('meal_plans').select('*').eq('user_id', user.id).order('day_index'),
        supabase.from('settings').select('plan_breakfast, plan_lunch, plan_dinner').eq('user_id', user.id).single(),
      ])

      setMeals(mealData || [])
      if (settingsData) {
        setMealSettings({
          plan_breakfast: settingsData.plan_breakfast ?? true,
          plan_lunch: settingsData.plan_lunch ?? true,
          plan_dinner: settingsData.plan_dinner ?? true,
        })
      }
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

  // Click a chip: assign to the next empty slot for the primary meal type
  const handleSuggestionClick = async (mealName: string, index: number) => {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const existing = meals.find(m => m.day_index === dayIndex && m.meal_type === primaryMealType)
      if (!existing?.custom_name) {
        await saveMeal(dayIndex, primaryMealType, mealName)
        setGeneratedSuggestions(prev => prev.filter((_, i) => i !== index))
        return
      }
    }
    // All slots filled — replace last day
    await saveMeal(6, primaryMealType, mealName)
    setGeneratedSuggestions(prev => prev.filter((_, i) => i !== index))
  }

  // Fill week: distribute all suggestions across active meal types
  const handleFillWeek = async () => {
    let si = 0
    for (let dayIndex = 0; dayIndex < 7 && si < generatedSuggestions.length; dayIndex++) {
      for (const mt of activeMealTypes) {
        if (si >= generatedSuggestions.length) break
        const existing = meals.find(m => m.day_index === dayIndex && m.meal_type === mt.key)
        if (!existing?.custom_name) {
          await saveMeal(dayIndex, mt.key, generatedSuggestions[si])
          si++
        }
      }
    }
    setGeneratedSuggestions([])
  }

  const getMeal = (dayIndex: number, mealType: string) =>
    meals.find(m => m.day_index === dayIndex && m.meal_type === mealType)

  const gridCols = activeMealTypes.length === 1
    ? 'grid-cols-1'
    : activeMealTypes.length === 2
    ? 'grid-cols-2'
    : 'grid-cols-3'

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
                onClick={() => { setShowPrompt(false); setGeneratedSuggestions([]) }}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ color: 'var(--muted)', background: 'var(--border)' }}
              >
                Cancel
              </button>
            </div>

            {generatedSuggestions.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    Click a meal to add it to the first empty slot:
                  </p>
                  <button
                    onClick={handleFillWeek}
                    className="text-xs px-3 py-1.5 rounded-full font-medium"
                    style={{ background: 'var(--primary)', color: 'white' }}
                  >
                    Fill whole week
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {generatedSuggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(s, i)}
                      className="text-sm px-3 py-1.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity text-left"
                      style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                    >
                      {s}
                    </button>
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
              <div className={`grid ${gridCols} gap-3`}>
                {activeMealTypes.map(({ key, label, emoji }) => {
                  const existing = getMeal(dayIndex, key)
                  return (
                    <div key={key}>
                      <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
                        {emoji} {label}
                      </p>
                      <input
                        key={existing?.id || `${dayIndex}-${key}-empty`}
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
