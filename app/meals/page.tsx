'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'
import { SparklesIcon, CalendarIcon, SunIcon, CloudSunIcon, MoonIcon, XIcon, ClockIcon, FlameIcon, PackageIcon, CookieIcon } from '@/components/icons'

function CheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ALL_MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', Icon: SunIcon },
  { key: 'lunch', label: 'Lunch', Icon: CloudSunIcon },
  { key: 'snack', label: 'Snack', Icon: CookieIcon },
  { key: 'dinner', label: 'Dinner', Icon: MoonIcon },
]
const FALLBACK_MEALS: Record<string, string[]> = {
  breakfast: ['Avocado Toast with Poached Eggs', 'Greek Yogurt Parfait', 'Banana Oat Pancakes', 'Spinach Omelette', 'Overnight Oats', 'Smoothie Bowl', 'Veggie Breakfast Burrito'],
  lunch: ['Caesar Salad with Chicken', 'Roasted Veggie Grain Bowl', 'BLT on Sourdough', 'Tomato Basil Soup', 'Tuna Nicoise Salad', 'Chicken Avocado Wrap', 'Lentil Soup'],
  snack: ['Apple with Almond Butter', 'Hummus with Veggies', 'Trail Mix', 'Greek Yogurt with Honey', 'Rice Cakes with Avocado', 'Cheese & Crackers', 'Edamame'],
  dinner: ['Pasta Carbonara', 'Chicken Stir Fry', 'Vegetable Curry', 'Salmon with Rice', 'Beef Tacos', 'Greek Salad with Falafel', 'Shakshuka'],
}

const CUISINE_OPTIONS = ['Italian', 'Asian', 'Mexican', 'Mediterranean', 'Middle Eastern', 'Indian', 'American', 'French', 'Japanese']
const PROTEIN_OPTIONS = ['Chicken', 'Beef', 'Pork', 'Fish', 'Seafood', 'Plant-based', 'Eggs', 'Lamb']
const TIME_OPTIONS = [
  { label: '< 20 min', value: 20 },
  { label: '< 30 min', value: 30 },
  { label: '< 45 min', value: 45 },
  { label: '< 60 min', value: 60 },
]

type Filters = {
  cuisines: string[]
  proteins: string[]
  maxTime: number | null
  usePantry: boolean
  showFilters: boolean
}

type Meal = { id?: string; day_index: number; meal_type: string; custom_name: string; cooking_time_minutes?: number; calories_per_serving?: number; ingredients?: string[] }
type CalendarEvent = { dayIndex: number; summary: string; isNightOff: boolean }
type PlanSettings = { plan_breakfast: boolean; plan_lunch: boolean; plan_snack: boolean; plan_dinner: boolean }
type TooltipDetails = { cooking_time_minutes: number; calories_per_serving: number; ingredients: string[]; loading?: boolean }

export default function MealsPage() {
  const [meals, setMeals] = useState<Meal[]>([])
  const [planSettings, setPlanSettings] = useState<PlanSettings>({ plan_breakfast: true, plan_lunch: true, plan_snack: false, plan_dinner: true })
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({})
  const [generateError, setGenerateError] = useState('')
  const [filters, setFilters] = useState<Filters>({ cuisines: [], proteins: [], maxTime: null, usePantry: false, showFilters: false })
  // localEdits tracks unsaved typing: key = `${dayIndex}-${mealType}`
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({})
  // Pantry + hover tooltip
  const [pantryItems, setPantryItems] = useState<string[]>([])
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [tooltipDetails, setTooltipDetails] = useState<Record<string, TooltipDetails>>({})
  // Copy-to-slots
  const [copyModal, setCopyModal] = useState<{ dayIndex: number; mealType: string; name: string } | null>(null)
  const [copyTargets, setCopyTargets] = useState<string[]>([])
  const supabase = createClient()

  const slotKey = (dayIndex: number, mealType: string) => `${dayIndex}-${mealType}`

  const getDisplayValue = (dayIndex: number, mealType: string) => {
    const k = slotKey(dayIndex, mealType)
    return k in localEdits ? localEdits[k] : (getMealValue(dayIndex, mealType) ?? '')
  }

  const getMealValue = (dayIndex: number, mealType: string) =>
    meals.find(m => m.day_index === dayIndex && m.meal_type === mealType)?.custom_name ?? ''

  const isDirty = (dayIndex: number, mealType: string) => {
    const k = slotKey(dayIndex, mealType)
    return k in localEdits && localEdits[k] !== getMealValue(dayIndex, mealType)
  }

  const activeMealTypes = ALL_MEAL_TYPES.filter(mt =>
    mt.key === 'breakfast' ? planSettings.plan_breakfast :
    mt.key === 'lunch' ? planSettings.plan_lunch :
    mt.key === 'snack' ? planSettings.plan_snack :
    planSettings.plan_dinner
  )

  const primaryMealType = activeMealTypes.find(m => m.key === 'dinner')?.key
    || activeMealTypes.find(m => m.key === 'lunch')?.key
    || activeMealTypes[0]?.key || 'dinner'

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: mealData }, { data: settingsData }, { data: pantryData }] = await Promise.all([
        supabase.from('meal_plans').select('*').eq('user_id', user.id).order('day_index'),
        supabase.from('settings').select('plan_breakfast, plan_lunch, plan_snack, plan_dinner').eq('user_id', user.id).single(),
        supabase.from('pantry_items').select('name').eq('user_id', user.id).eq('in_stock', true),
      ])

      setMeals(mealData || [])
      setPantryItems((pantryData || []).map(p => p.name.toLowerCase()))
      if (settingsData) {
        setPlanSettings({
          plan_breakfast: settingsData.plan_breakfast ?? true,
          plan_lunch: settingsData.plan_lunch ?? true,
          plan_snack: settingsData.plan_snack ?? false,
          plan_dinner: settingsData.plan_dinner ?? true,
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  const saveMeal = async (dayIndex: number, mealType: string, name: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id

    // Always fetch fresh from DB to avoid stale-closure duplicate inserts
    const { data: existing } = await supabase
      .from('meal_plans')
      .select('id')
      .eq('user_id', uid)
      .eq('day_index', dayIndex)
      .eq('meal_type', mealType)
      .maybeSingle()

    if (existing?.id) {
      await supabase.from('meal_plans').update({ custom_name: name }).eq('id', existing.id)
      setMeals(prev => prev.map(m => m.id === existing.id ? { ...m, custom_name: name } : m))
    } else {
      const { data } = await supabase.from('meal_plans').insert({
        user_id: uid, day_index: dayIndex, meal_type: mealType, custom_name: name,
      }).select().single()
      if (data) setMeals(prev => [...prev, data])
    }

    // Clear local edit for this slot
    setLocalEdits(prev => { const n = { ...prev }; delete n[slotKey(dayIndex, mealType)]; return n })
  }

  const deleteMeal = async (dayIndex: number, mealType: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const existing = meals.find(m => m.day_index === dayIndex && m.meal_type === mealType)
    if (!existing?.id) return
    await supabase.from('meal_plans').delete().eq('id', existing.id)
    setMeals(prev => prev.filter(m => m.id !== existing.id))
    setLocalEdits(prev => { const n = { ...prev }; delete n[slotKey(dayIndex, mealType)]; return n })
  }

  const handleSaveSlot = (dayIndex: number, mealType: string) => {
    const val = getDisplayValue(dayIndex, mealType).trim()
    if (val) saveMeal(dayIndex, mealType, val)
    else deleteMeal(dayIndex, mealType)
  }

  const toggleMealType = async (key: string) => {
    const field = `plan_${key}` as keyof PlanSettings
    const newVal = !planSettings[field]
    const newSettings = { ...planSettings, [field]: newVal }
    setPlanSettings(newSettings)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Use upsert in case settings row doesn't exist
    await supabase.from('settings').update({ [field]: newVal }).eq('user_id', user.id)
  }

  const buildFallback = () => {
    const fb: Record<string, string[]> = {}
    activeMealTypes.forEach(mt => { fb[mt.key] = FALLBACK_MEALS[mt.key] || FALLBACK_MEALS.dinner })
    return fb
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setSuggestions({})
    setGenerateError('')
    setShowPanel(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setSuggestions(buildFallback())
        setGenerating(false)
        return
      }

      const res = await fetch('/api/suggest-meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          userId: user.id,
          filters: {
            cuisines: filters.cuisines,
            proteins: filters.proteins,
            maxTime: filters.maxTime,
            usePantry: filters.usePantry,
          },
        }),
      })

      if (!res.ok) {
        setSuggestions(buildFallback())
        setGenerating(false)
        return
      }

      const data = await res.json()
      const suggested = data.meals && typeof data.meals === 'object' && !Array.isArray(data.meals)
        ? data.meals as Record<string, string[]>
        : buildFallback()

      setSuggestions(suggested)
    } catch (err) {
      console.error('Generate error:', err)
      setSuggestions(buildFallback())
      setGenerateError('Could not reach AI — showing defaults instead.')
    } finally {
      setGenerating(false)
    }
  }

  const handleChipClick = async (meal: string, mealType: string, index: number) => {
    for (let d = 0; d < 7; d++) {
      const existing = meals.find(m => m.day_index === d && m.meal_type === mealType)
      if (!existing?.custom_name) {
        await saveMeal(d, mealType, meal)
        setSuggestions(prev => ({ ...prev, [mealType]: (prev[mealType] || []).filter((_, i) => i !== index) }))
        return
      }
    }
    await saveMeal(6, mealType, meal)
    setSuggestions(prev => ({ ...prev, [mealType]: (prev[mealType] || []).filter((_, i) => i !== index) }))
  }

  const handleFillWeek = async () => {
    for (const mt of activeMealTypes) {
      const typeSuggestions = suggestions[mt.key] || []
      let si = 0
      for (let d = 0; d < 7 && si < typeSuggestions.length; d++) {
        const existing = meals.find(m => m.day_index === d && m.meal_type === mt.key)
        if (!existing?.custom_name) {
          await saveMeal(d, mt.key, typeSuggestions[si++])
        }
      }
    }
    setSuggestions({})
    setShowPanel(false)
  }

  const handleCopyMeal = async () => {
    if (!copyModal || copyTargets.length === 0) return
    for (const k of copyTargets) {
      const idx = k.indexOf('-')
      const di = parseInt(k.slice(0, idx))
      const mt = k.slice(idx + 1)
      await saveMeal(di, mt, copyModal.name)
    }
    setCopyModal(null)
    setCopyTargets([])
  }

  const handleHover = async (dayIndex: number, mealType: string) => {
    const meal = meals.find(m => m.day_index === dayIndex && m.meal_type === mealType)
    if (!meal?.custom_name) return
    const k = slotKey(dayIndex, mealType)
    setHoverKey(k)

    if (tooltipDetails[k]) return // already fetched

    // Use cached DB data if present
    if (meal.cooking_time_minutes && meal.calories_per_serving && meal.ingredients?.length) {
      setTooltipDetails(prev => ({ ...prev, [k]: { cooking_time_minutes: meal.cooking_time_minutes!, calories_per_serving: meal.calories_per_serving!, ingredients: meal.ingredients! } }))
      return
    }

    setTooltipDetails(prev => ({ ...prev, [k]: { cooking_time_minutes: 0, calories_per_serving: 0, ingredients: [], loading: true } }))
    try {
      const res = await fetch('/api/meal-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealName: meal.custom_name, mealPlanId: meal.id }),
      })
      const data = await res.json()
      setTooltipDetails(prev => ({ ...prev, [k]: { ...data, loading: false } }))
      setMeals(prev => prev.map(m => m.day_index === dayIndex && m.meal_type === mealType ? { ...m, ...data } : m))
    } catch {
      setTooltipDetails(prev => ({ ...prev, [k]: { cooking_time_minutes: 30, calories_per_serving: 450, ingredients: [], loading: false } }))
    }
  }

  const syncCalendar = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/calendar-events', { method: 'POST' })
      const data = await res.json()
      if (data.events) {
        setCalendarEvents(data.events)
        setCalendarConnected(true)
      } else if (data.needsAuth) {
        window.location.href = '/api/auth/google-calendar'
      }
    } catch { /* ignore */ }
    setSyncing(false)
  }

  const gridCols = activeMealTypes.length === 1 ? 'grid-cols-1'
    : activeMealTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <Nav />
        <div className="md:ml-64 flex items-center justify-center h-64">
          <div className="animate-pulse" style={{ color: 'var(--primary)' }}><UtensilsIcon size={32} /></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-64 px-6 py-8 pb-24 md:pb-8 max-w-4xl">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Meal Plan</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Click a slot to edit · generate with AI</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={syncCalendar}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: calendarConnected ? 'var(--secondary-light)' : 'var(--card)',
                color: calendarConnected ? 'var(--secondary)' : 'var(--muted)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <CalendarIcon size={15} />
              {syncing ? 'Syncing…' : calendarConnected ? 'Synced' : 'Sync calendar'}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-70"
              style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-md)' }}
            >
              <SparklesIcon size={15} />
              {generating ? 'Generating…' : 'Generate meals'}
            </button>
          </div>
        </div>

        {/* Meal type toggles */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <span className="text-xs font-medium self-center mr-1" style={{ color: 'var(--muted)' }}>Planning:</span>
          {ALL_MEAL_TYPES.map(({ key, label, Icon }) => {
            const field = `plan_${key}` as keyof PlanSettings
            const active = planSettings[field]
            return (
              <button
                key={key}
                onClick={() => toggleMealType(key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background: active ? 'var(--primary)' : 'var(--border)',
                  color: active ? 'white' : 'var(--muted)',
                }}
              >
                <Icon size={12} />
                {label}
              </button>
            )
          })}
        </div>

        {/* AI suggestions panel */}
        {showPanel && (
          <div
            className="rounded-2xl p-5 mb-6"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
                <SparklesIcon size={14} /> AI Meal Suggestions
              </p>
              <button onClick={() => setShowPanel(false)} style={{ color: 'var(--muted)' }}>
                <XIcon size={16} />
              </button>
            </div>

            {/* Filter section */}
            <div className="mb-4">
              <button
                onClick={() => setFilters(f => ({ ...f, showFilters: !f.showFilters }))}
                className="flex items-center gap-1.5 text-xs font-medium mb-3 transition-opacity hover:opacity-70"
                style={{ color: (filters.cuisines.length || filters.proteins.length || filters.maxTime || filters.usePantry) ? 'var(--primary)' : 'var(--muted)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
                </svg>
                Filters
                {(filters.cuisines.length + filters.proteins.length + (filters.maxTime ? 1 : 0) + (filters.usePantry ? 1 : 0)) > 0 && (
                  <span
                    className="flex items-center justify-center w-4 h-4 rounded-full text-white"
                    style={{ background: 'var(--primary)', fontSize: '9px', fontWeight: 700 }}
                  >
                    {filters.cuisines.length + filters.proteins.length + (filters.maxTime ? 1 : 0) + (filters.usePantry ? 1 : 0)}
                  </span>
                )}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: filters.showFilters ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {filters.showFilters && (
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                >
                  {/* Cuisine filter */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>Cuisine</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CUISINE_OPTIONS.map(c => {
                        const active = filters.cuisines.includes(c)
                        return (
                          <button
                            key={c}
                            onClick={() => setFilters(f => ({
                              ...f,
                              cuisines: active ? f.cuisines.filter(x => x !== c) : [...f.cuisines, c]
                            }))}
                            className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                            style={{
                              background: active ? 'var(--primary)' : 'var(--card)',
                              color: active ? 'white' : 'var(--muted)',
                              border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                            }}
                          >
                            {c}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Protein filter */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>Protein</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PROTEIN_OPTIONS.map(p => {
                        const active = filters.proteins.includes(p)
                        return (
                          <button
                            key={p}
                            onClick={() => setFilters(f => ({
                              ...f,
                              proteins: active ? f.proteins.filter(x => x !== p) : [...f.proteins, p]
                            }))}
                            className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                            style={{
                              background: active ? 'var(--primary)' : 'var(--card)',
                              color: active ? 'white' : 'var(--muted)',
                              border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                            }}
                          >
                            {p}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Cooking time filter */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>Max cooking time</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TIME_OPTIONS.map(t => {
                        const active = filters.maxTime === t.value
                        return (
                          <button
                            key={t.value}
                            onClick={() => setFilters(f => ({ ...f, maxTime: active ? null : t.value }))}
                            className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                            style={{
                              background: active ? 'var(--primary)' : 'var(--card)',
                              color: active ? 'white' : 'var(--muted)',
                              border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                            }}
                          >
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Pantry toggle */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>Pantry</p>
                    <button
                      onClick={() => setFilters(f => ({ ...f, usePantry: !f.usePantry }))}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: filters.usePantry ? 'var(--primary)' : 'var(--card)',
                        color: filters.usePantry ? 'white' : 'var(--muted)',
                        border: `1px solid ${filters.usePantry ? 'var(--primary)' : 'var(--border)'}`,
                      }}
                    >
                      <PackageIcon size={11} />
                      Use up my pantry as much as possible
                    </button>
                  </div>

                  {/* Clear filters */}
                  {(filters.cuisines.length > 0 || filters.proteins.length > 0 || filters.maxTime || filters.usePantry) && (
                    <button
                      onClick={() => setFilters(f => ({ ...f, cuisines: [], proteins: [], maxTime: null, usePantry: false }))}
                      className="text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ color: 'var(--muted)' }}
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Prompt + regenerate */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Any requests? e.g. light meals, no red meat, one pasta dish…"
                className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              />
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <SparklesIcon size={13} />
                {generating ? '…' : 'Regenerate'}
              </button>
            </div>

            {generating && (
              <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--muted)' }}>
                <span className="animate-spin inline-block"><SparklesIcon size={14} /></span>
                Asking NOM AI for ideas…
              </div>
            )}

            {generateError && (
              <p className="text-xs mb-3 px-3 py-2 rounded-xl" style={{ background: 'var(--border)', color: 'var(--muted)' }}>
                {generateError}
              </p>
            )}

            {!generating && Object.values(suggestions).some(arr => arr.length > 0) && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    Click to add to next free slot:
                  </p>
                  <button
                    onClick={handleFillWeek}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium text-white"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    Fill whole week
                  </button>
                </div>
                <div className="space-y-4">
                  {activeMealTypes.map(({ key, label, Icon }) => {
                    const typeSuggestions = suggestions[key] || []
                    if (!typeSuggestions.length) return null
                    return (
                      <div key={key}>
                        <p
                          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                          style={{ color: 'var(--muted)' }}
                        >
                          <Icon size={11} /> {label}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {typeSuggestions.map((s, i) => (
                            <button
                              key={i}
                              onClick={() => handleChipClick(s, key, i)}
                              className="text-sm px-3 py-1.5 rounded-full font-medium transition-all hover:opacity-80 active:scale-95"
                              style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                            >
                              + {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Week grid */}
        <div className="space-y-3">
          {DAYS.map((day, dayIndex) => {
            const dayEvents = calendarEvents.filter(e => e.dayIndex === dayIndex)
            const hasNightOff = dayEvents.some(e => e.isNightOff)
            return (
              <div
                key={day}
                className="rounded-2xl p-4"
                style={{
                  background: hasNightOff ? 'var(--secondary-light)' : 'var(--card)',
                  boxShadow: 'var(--shadow-sm)',
                  border: `1px solid ${hasNightOff ? 'var(--secondary)' : 'var(--border)'}`,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{day}</p>
                  {dayEvents.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {dayEvents.map((evt, ei) => (
                        <span
                          key={ei}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: 'var(--secondary-light)', color: 'var(--secondary)' }}
                        >
                          <CalendarIcon size={10} /> {evt.summary}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {hasNightOff ? (
                  <p className="text-sm" style={{ color: 'var(--secondary)' }}>Night off — no cooking needed</p>
                ) : activeMealTypes.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>No meal types selected — enable one above</p>
                ) : (
                  <div className={`grid ${gridCols} gap-3`}>
                    {activeMealTypes.map(({ key, label, Icon }) => {
                      const hasMeal = !!getMealValue(dayIndex, key)
                      const dirty = isDirty(dayIndex, key)
                      const displayVal = getDisplayValue(dayIndex, key)
                      const sk = slotKey(dayIndex, key)
                      const tip = tooltipDetails[sk]
                      const showTip = hoverKey === sk && hasMeal && !dirty && tip
                      const missingIngs = tip?.ingredients?.filter(ing =>
                        !pantryItems.some(p => ing.toLowerCase().includes(p))
                      ) ?? []
                      return (
                        <div key={key} className="relative">
                          <p className="flex items-center gap-1 text-xs mb-1.5 font-medium" style={{ color: 'var(--muted)' }}>
                            <Icon size={11} /> {label}
                          </p>
                          <div
                            className="relative flex items-center"
                            onMouseEnter={() => hasMeal && !dirty && handleHover(dayIndex, key)}
                            onMouseLeave={() => setHoverKey(null)}
                          >
                            <input
                              type="text"
                              value={displayVal}
                              onChange={e => setLocalEdits(prev => ({ ...prev, [sk]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && handleSaveSlot(dayIndex, key)}
                              placeholder="Add meal…"
                              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                              style={{
                                borderColor: dirty ? 'var(--primary)' : 'var(--border)',
                                background: 'var(--background)',
                                color: 'var(--foreground)',
                                paddingRight: (!dirty && hasMeal) ? '3.5rem' : (dirty || hasMeal) ? '2rem' : undefined,
                                transition: 'border-color 0.15s',
                              }}
                            />
                            {dirty && (
                              <button
                                onClick={() => handleSaveSlot(dayIndex, key)}
                                className="absolute right-2.5 flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
                                style={{ color: 'var(--primary)' }}
                                title="Save meal"
                              >
                                <CheckIcon size={13} />
                              </button>
                            )}
                            {!dirty && hasMeal && (
                              <>
                                <button
                                  onClick={() => { setCopyModal({ dayIndex, mealType: key, name: getMealValue(dayIndex, key) }); setCopyTargets([]) }}
                                  className="absolute right-8 flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
                                  style={{ color: 'var(--muted)' }}
                                  title="Copy to other slots"
                                >
                                  <CopyIcon size={13} />
                                </button>
                                <button
                                  onClick={() => deleteMeal(dayIndex, key)}
                                  className="absolute right-2.5 flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
                                  style={{ color: 'var(--muted)' }}
                                  title="Remove meal"
                                >
                                  <XIcon size={13} />
                                </button>
                              </>
                            )}

                            {/* Hover tooltip */}
                            {showTip && (
                              <div
                                className="absolute bottom-full left-0 mb-2 z-30 w-56 rounded-2xl p-3 text-xs"
                                style={{ background: 'var(--foreground)', color: 'var(--background)', boxShadow: 'var(--shadow-lg)', pointerEvents: 'none' }}
                              >
                                {tip.loading ? (
                                  <p className="opacity-60">Loading details…</p>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-3 mb-2.5">
                                      {tip.cooking_time_minutes > 0 && (
                                        <span className="flex items-center gap-1 opacity-90">
                                          <ClockIcon size={11} /> {tip.cooking_time_minutes} min
                                        </span>
                                      )}
                                      {tip.calories_per_serving > 0 && (
                                        <span className="flex items-center gap-1 opacity-90">
                                          <FlameIcon size={11} /> {tip.calories_per_serving} kcal
                                        </span>
                                      )}
                                    </div>
                                    {missingIngs.length > 0 ? (
                                      <div>
                                        <p className="flex items-center gap-1 mb-1 opacity-70">
                                          <PackageIcon size={11} /> Missing from pantry:
                                        </p>
                                        {missingIngs.slice(0, 4).map((ing, i) => (
                                          <p key={i} className="opacity-80 truncate">• {ing}</p>
                                        ))}
                                        {missingIngs.length > 4 && (
                                          <p className="opacity-50">+{missingIngs.length - 4} more</p>
                                        )}
                                      </div>
                                    ) : pantryItems.length > 0 ? (
                                      <p className="opacity-70 flex items-center gap-1"><PackageIcon size={11} /> All ingredients in pantry</p>
                                    ) : null}
                                  </>
                                )}
                                {/* Arrow */}
                                <div
                                  className="absolute left-4 -bottom-1.5 w-3 h-3 rotate-45"
                                  style={{ background: 'var(--foreground)' }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>

      {/* Copy to slots modal */}
      {copyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setCopyModal(null)}
        >
          <div
            className="rounded-2xl p-6 w-full max-w-sm"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--foreground)' }}>
              Also add to…
            </h3>
            <p className="text-sm mb-4 truncate" style={{ color: 'var(--muted)' }}>
              "{copyModal.name}"
            </p>

            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <td className="pb-2 pl-1 pr-3" />
                    {activeMealTypes.map(mt => (
                      <th
                        key={mt.key}
                        className="pb-2 px-2 font-medium text-center"
                        style={{ color: 'var(--muted)' }}
                      >
                        <span className="flex flex-col items-center gap-0.5">
                          <mt.Icon size={11} />
                          {mt.label.slice(0, 3)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day, di) => (
                    <tr key={di} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td
                        className="py-2 pl-1 pr-3 font-medium whitespace-nowrap"
                        style={{ color: 'var(--foreground)' }}
                      >
                        {day.slice(0, 3)}
                      </td>
                      {activeMealTypes.map(mt => {
                        const k = slotKey(di, mt.key)
                        const isSource = di === copyModal.dayIndex && mt.key === copyModal.mealType
                        const isChecked = copyTargets.includes(k)
                        return (
                          <td key={mt.key} className="py-2 px-2 text-center">
                            {isSource ? (
                              <span className="text-xs" style={{ color: 'var(--border)' }}>—</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => setCopyTargets(prev =>
                                  isChecked ? prev.filter(x => x !== k) : [...prev, k]
                                )}
                                className="w-4 h-4 rounded cursor-pointer"
                                style={{ accentColor: 'var(--primary)' }}
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setCopyModal(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCopyMeal}
                disabled={copyTargets.length === 0}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-opacity"
                style={{ background: 'var(--gradient-primary)' }}
              >
                {copyTargets.length > 0 ? `Copy to ${copyTargets.length} slot${copyTargets.length > 1 ? 's' : ''}` : 'Select slots'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

// needed for loading state icon
function UtensilsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
    </svg>
  )
}
