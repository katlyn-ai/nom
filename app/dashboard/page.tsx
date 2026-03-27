'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Nav from '@/components/nav'
import Link from 'next/link'
import { SparklesIcon, ShoppingCartIcon, BookOpenIcon, CalendarDaysIcon, SunIcon, CloudSunIcon, MoonIcon, UtensilsIcon, XIcon, ClockIcon, FlameIcon, PackageIcon, RefreshIcon } from '@/components/icons'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ── Fuzzy pantry matching ────────────────────────────────────────────────────
// Strips leading quantity/unit from an ingredient string:
//   "100g sundried tomatoes" → "sundried tomatoes"
//   "3 cloves garlic"        → "garlic"
//   "1 bunch fresh basil"    → "fresh basil"
function stripQuantity(s: string): string {
  return s
    .replace(/^[\d.,]+\s*(?:g|kg|ml|l|oz|lb|cups?|tbsp|tsp|cloves?|pieces?|slices?|bunche?s?|heads?|cans?|tins?|large|medium|small|handful|pinch|sprigs?)\s+/i, '')
    .trim()
}

// Strips parenthetical content: "crushed tomatoes (tin)" → "crushed tomatoes"
function stripParenthetical(s: string): string {
  return s.replace(/\s*\([^)]*\)/g, '').trim()
}

// Strips preparation qualifiers so "sundried tomatoes in oil" → "sundried tomatoes"
// Also covers container words (tin, jar, can) so "crushed tomatoes (tin)" → "tomatoes"
const PREP_QUALIFIERS = [
  'in oil', 'in brine', 'in water', 'in syrup',
  'frozen', 'fresh', 'dried', 'canned', 'tinned', 'tin', 'jarred', 'jar',
  'smoked', 'cooked', 'raw', 'whole', 'ground', 'sliced', 'diced',
  'chopped', 'minced', 'crushed', 'peeled', 'cubed', 'grated',
  'organic', 'homemade', 'store-bought', 'roasted', 'toasted',
  'light', 'dark', 'sweet', 'mild', 'hot', 'spicy', 'low-sodium',
  'reduced', 'full-fat', 'low-fat', 'skimmed', 'semi-skimmed',
]
function stripPrepQualifiers(s: string): string {
  let r = s
  for (const q of PREP_QUALIFIERS) r = r.replace(new RegExp(`\\b${q}\\b`, 'gi'), '')
  return r.replace(/\s+/g, ' ').trim()
}

// Synonym groups — all entries in a group are treated as interchangeable.
// The first entry is the canonical form everything gets mapped to.
const SYNONYM_GROUPS: string[][] = [
  ['ground beef', 'minced meat', 'minced beef', 'ground meat', 'mince'],
  ['spring onion', 'scallion', 'green onion'],
  ['aubergine', 'eggplant'],
  ['courgette', 'zucchini'],
  ['coriander', 'cilantro'],
  ['rocket', 'arugula'],
  ['beetroot', 'beet'],
  ['chickpeas', 'garbanzo beans', 'garbanzo'],
  ['stock', 'broth'],
  ['prawn', 'shrimp'],
  ['natural yogurt', 'plain yogurt', 'greek yogurt', 'yoghurt', 'yogurt'],
  ['passata', 'tomato puree', 'tomato sauce', 'strained tomatoes'],
]
function applySynonyms(s: string): string {
  let r = s
  for (const group of SYNONYM_GROUPS) {
    const canonical = group[0]
    for (const term of group) {
      // match singular and plural forms (e.g. "scallion" also catches "scallions")
      r = r.replace(new RegExp(`\\b${term}s?\\b`, 'gi'), canonical)
    }
  }
  return r
}

// Full normalisation: strip parentheticals → prep qualifiers → synonyms → leading quantity
function normalise(s: string): string {
  return applySynonyms(stripPrepQualifiers(stripParenthetical(stripQuantity(s.toLowerCase()))))
}

// Returns true if the ingredient is covered by something in the pantry
function matchesPantry(ingredient: string, pantryItems: string[]): boolean {
  const ingLower = ingredient.toLowerCase()
  const ingCore = stripQuantity(ingLower)       // e.g. "sundried tomatoes"
  const ingNorm = normalise(ingredient)         // e.g. "tomatoes" (all qualifiers stripped)
  return pantryItems.some(p => {
    const pCore = stripPrepQualifiers(p)        // e.g. "sundried tomatoes" (from "sundried tomatoes in oil")
    const pNorm = normalise(p)                  // e.g. "tomatoes" (from "crushed tomatoes (tin)")
    return (
      ingLower.includes(p)       ||             // exact: "fresh garlic" includes "garlic"
      p.includes(ingCore)        ||             // "sundried tomatoes in oil" includes "sundried tomatoes"
      ingCore.includes(pCore)    ||             // "sundried tomatoes" includes "sundried tomatoes"
      pCore.includes(ingCore)    ||             // reverse: broader pantry entry
      (ingNorm.length > 2 && pNorm.includes(ingNorm)) ||  // "canned tomatoes" → "tomatoes" matches "crushed tomatoes (tin)" → "tomatoes"
      (pNorm.length > 2 && ingNorm.includes(pNorm))       // reverse normalised check
    )
  })
}

type Meal = {
  id: string
  day_index: number
  meal_type: string
  custom_name: string
  cooking_time_minutes?: number
  calories_per_serving?: number
  ingredients?: string[]
  recipes?: { name: string } | null
}

type MealDetails = {
  cooking_time_minutes: number
  calories_per_serving: number
  ingredients: string[]
  instructions: string[]
  loading?: boolean
}

// ── Weekly checklist ─────────────────────────────────────────────────────────
const CHECKLIST_STEPS = [
  { key: 'pantry',   label: 'Check pantry',       href: '/pantry',   emoji: '🥫' },
  { key: 'meals',    label: 'Create meals',        href: '/meals',    emoji: '🍽️' },
  { key: 'shopping', label: 'Check shopping list', href: '/shopping', emoji: '🛒' },
  { key: 'bought',   label: 'Buy food',            href: '/shopping', emoji: '🛍️' },
]

function getWeekKey() {
  const d = new Date()
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7)
  return `nom-checklist-${d.getFullYear()}-w${week}`
}

function ConfettiOverlay({ onDone }: { onDone: () => void }) {
  const pieces = useMemo(() =>
    Array.from({ length: 90 }, (_, i) => ({
      id: i,
      color: ['#3D6B47','#F59E0B','#EF4444','#3B82F6','#8B5CF6','#EC4899','#10B981','#F97316','#FBBF24','#A3E635'][i % 10],
      left: `${(i * 37 + 7) % 100}%`,
      delay: `${((i * 11) % 20) / 10}s`,
      duration: `${2.8 + (i % 6) * 0.22}s`,
      size: `${6 + (i % 7)}px`,
      round: i % 3 !== 0,
      drift: (i % 2 === 0 ? 1 : -1) * (20 + (i % 40)),
    }))
  , [])

  useEffect(() => {
    const t = setTimeout(onDone, 5000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <>
      <style>{`
        @keyframes cfFall {
          0%   { opacity: 1; transform: translateY(-20px) translateX(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(105vh) translateX(var(--drift)) rotate(800deg); }
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 999 }}>
        {pieces.map(p => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.left,
              top: '-12px',
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.round ? '50%' : '3px',
              ['--drift' as string]: `${p.drift}px`,
              animation: `cfFall ${p.duration} ${p.delay} ease-in forwards`,
            }}
          />
        ))}
      </div>
    </>
  )
}

const MealTypeIcon = ({ type }: { type: string }) => {
  if (type === 'breakfast') return <SunIcon size={12} />
  if (type === 'lunch') return <CloudSunIcon size={12} />
  return <MoonIcon size={12} />
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [meals, setMeals] = useState<Meal[]>([])
  const [firstName, setFirstName] = useState('there')
  const [loading, setLoading] = useState(true)

  // Slide-out state
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null)
  const [mealDetails, setMealDetails] = useState<MealDetails | null>(null)
  const [pantryItems, setPantryItems] = useState<string[]>([])
  const [addingToCart, setAddingToCart] = useState(false)
  const [cartAdded, setCartAdded] = useState(false)
  // swappedIngredients: maps original ingredient → substitute
  const [swappedIngredients, setSwappedIngredients] = useState<Record<string, string | 'loading'>>({})
  const [savedToRecipes, setSavedToRecipes] = useState(false)
  const [savingRecipe, setSavingRecipe] = useState(false)
  // Weekly checklist
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [showConfetti, setShowConfetti] = useState(false)

  const swapIngredient = async (original: string) => {
    if (!selectedMeal || swappedIngredients[original]) return
    setSwappedIngredients(prev => ({ ...prev, [original]: 'loading' }))
    try {
      const res = await fetch('/api/swap-ingredient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient: original,
          mealName: selectedMeal.custom_name || selectedMeal.recipes?.name,
        }),
      })
      const data = await res.json()
      setSwappedIngredients(prev => ({ ...prev, [original]: data.substitute || original }))
    } catch {
      setSwappedIngredients(prev => { const n = { ...prev }; delete n[original]; return n })
    }
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const name = user.user_metadata?.full_name?.split(' ')[0] || 'there'
      setFirstName(name)

      const [{ data: mealsData }, { data: pantryData }] = await Promise.all([
        supabase.from('meal_plans').select('*, recipes(name)').eq('user_id', user.id).order('day_index').limit(21),
        supabase.from('pantry_items').select('name').eq('user_id', user.id).eq('in_stock', true),
      ])

      setMeals(mealsData || [])
      setPantryItems((pantryData || []).map(p => p.name.toLowerCase()))
      setLoading(false)
    }
    load()
  }, [])

  // Load this week's checklist state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getWeekKey())
      if (stored) setChecked(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const toggleChecked = useCallback((key: string) => {
    setChecked(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(getWeekKey(), JSON.stringify(next)) } catch { /* ignore */ }
      if (key === 'bought' && next['bought']) setShowConfetti(true)
      return next
    })
  }, [])

  const handleConfettiDone = useCallback(() => setShowConfetti(false), [])

  const openMeal = async (meal: Meal) => {
    setSelectedMeal(meal)

    // Always fetch fresh — instructions aren't cached in DB
    setMealDetails({ cooking_time_minutes: 0, calories_per_serving: 0, ingredients: [], instructions: [], loading: true })
    try {
      const res = await fetch('/api/meal-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealName: meal.custom_name || meal.recipes?.name,
          mealPlanId: meal.id,
        }),
      })
      const data = await res.json()
      setMealDetails({ instructions: [], ...data, loading: false })
      // Update local state so time/calories/ingredients are cached
      setMeals(prev => prev.map(m => m.id === meal.id ? { ...m, ...data } : m))
    } catch {
      setMealDetails({ cooking_time_minutes: 30, calories_per_serving: 450, ingredients: [], instructions: [], loading: false })
    }
  }

  const closeMeal = () => {
    setSelectedMeal(null)
    setMealDetails(null)
    setSwappedIngredients({})
    setCartAdded(false)
    setSavedToRecipes(false)
    setSavingRecipe(false)
  }

  const saveToRecipes = async () => {
    if (!selectedMeal || !mealDetails || savingRecipe || savedToRecipes || mealDetails.loading) return
    setSavingRecipe(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setSavingRecipe(false); return }
      const name = selectedMeal.custom_name || selectedMeal.recipes?.name || 'Recipe'
      const { data: existing } = await supabase
        .from('recipes')
        .select('id')
        .ilike('name', name)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!existing) {
        await supabase.from('recipes').insert({
          user_id: user.id,
          name,
          ingredients: mealDetails.ingredients,
          instructions: mealDetails.instructions.join('\n'),
          prep_time: mealDetails.cooking_time_minutes,
        })
      }
      setSavedToRecipes(true)
    } catch { /* silent */ }
    setSavingRecipe(false)
  }

  const addMissingToCart = async () => {
    if (!mealDetails || missingIngredients.length === 0 || addingToCart) return
    setAddingToCart(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAddingToCart(false); return }

      // Ask AI to categorise the items so they land in the right section
      let categories: string[] = missingIngredients.map(() => 'Other')
      try {
        const res = await fetch('/api/categorise-shopping', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items: missingIngredients }),
        })
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json.categorised)) categories = json.categorised
        }
      } catch { /* fall back to Other */ }

      await Promise.all(
        missingIngredients.map((ing, i) =>
          supabase.from('shopping_items').insert({
            user_id: user.id,
            name: ing,
            category: categories[i] ?? 'Other',
            checked: false,
            added_by: user.id,
          })
        )
      )
      setCartAdded(true)
    } catch { /* silent */ }
    setAddingToCart(false)
  }

  const mealCount = meals.length

  const missingIngredients = mealDetails?.ingredients?.filter(ing =>
    !matchesPantry(ing, pantryItems)
  ) ?? []

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <div className="md:ml-64 flex items-center justify-center h-64">
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />

      <main className="md:ml-64 px-6 py-8 pb-24 md:pb-8 max-w-4xl">

        {/* Hero */}
        <div
          className="rounded-3xl p-7 mb-7 relative overflow-hidden"
          style={{ background: 'var(--gradient-hero)', boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="relative z-10">
            <p className="text-white/70 text-sm font-medium mb-1">Good to see you,</p>
            <h1 className="text-3xl font-bold text-white mb-5" style={{ fontFamily: 'var(--font-display)' }}>
              Hey, {firstName}
            </h1>
            <div className="flex gap-2.5 flex-wrap">
              <Link href="/meals" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <SparklesIcon size={14} /> Plan meals
              </Link>
              <Link href="/shopping" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <ShoppingCartIcon size={14} /> Shopping
              </Link>
              <Link href="/recipes" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <BookOpenIcon size={14} /> Recipes
              </Link>
            </div>
          </div>
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="absolute -right-4 -bottom-12 w-56 h-56 rounded-full" style={{ background: 'rgba(255,255,255,0.03)' }} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { icon: <CalendarDaysIcon size={18} />, label: 'Meals planned', value: `${mealCount}`, color: 'var(--primary)' },
            { icon: <PackageIcon size={18} />, label: 'Pantry items', value: `${pantryItems.length}`, color: 'var(--primary)' },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-2xl p-5"
              style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}
            >
              <div className="mb-2" style={{ color: stat.color }}>{stat.icon}</div>
              <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>
                {stat.label}
              </p>
              <p className="text-2xl font-bold" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Weekly checklist */}
        <div className="mb-6 rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              This week's checklist
            </p>
          </div>
          {CHECKLIST_STEPS.map((step, i) => {
            const done = !!checked[step.key]
            const prevAllDone = CHECKLIST_STEPS.slice(0, i).every(s => checked[s.key])
            return (
              <div
                key={step.key}
                className="flex items-center gap-3 px-4 py-3.5 transition-opacity"
                style={{
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  opacity: !prevAllDone && !done ? 0.45 : 1,
                }}
              >
                <button
                  onClick={() => toggleChecked(step.key)}
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    borderColor: done ? 'var(--primary)' : 'var(--border)',
                    background: done ? 'var(--primary)' : 'transparent',
                  }}
                >
                  {done && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                <span
                  className="text-sm flex-1"
                  style={{
                    color: 'var(--foreground)',
                    textDecoration: done ? 'line-through' : 'none',
                    opacity: done ? 0.55 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {step.emoji} {step.label}
                </span>
                {!done && (
                  <Link
                    href={step.href}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium"
                    style={{ color: 'var(--primary)', background: 'var(--primary-light)' }}
                  >
                    Go →
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        {/* This week */}
        <div className="mb-4 mt-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>This week</h2>
          <Link href="/meals" className="text-sm font-medium px-3 py-1.5 rounded-xl" style={{ color: 'var(--primary)', background: 'var(--primary-light)' }}>
            Edit →
          </Link>
        </div>

        {meals && meals.length > 0 ? (
          <div className="space-y-2.5">
            {DAYS.map((day, i) => {
              const dayMeals = meals.filter(m => m.day_index === i)
              return (
                <div
                  key={day}
                  className="rounded-2xl px-4 py-3.5"
                  style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{day}</p>
                    {dayMeals.length === 0 && (
                      <span className="text-xs italic" style={{ color: 'var(--muted)' }}>Nothing planned</span>
                    )}
                  </div>
                  {dayMeals.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {dayMeals.map(meal => (
                        <button
                          key={meal.id}
                          onClick={() => openMeal(meal)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-all hover:opacity-80 active:scale-95"
                          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                        >
                          <MealTypeIcon type={meal.meal_type} />
                          {meal.recipes?.name || meal.custom_name || 'Meal'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div
            className="rounded-3xl p-10 text-center"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}
          >
            <div className="mb-4" style={{ color: 'var(--primary)', display: 'flex', justifyContent: 'center' }}><UtensilsIcon size={48} /></div>
            <p className="font-semibold text-lg mb-2" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
              No meals planned yet
            </p>
            <p className="text-sm mb-6 max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>
              Let NOM suggest a week of meals based on your household&apos;s preferences
            </p>
            <Link
              href="/meals"
              className="inline-block px-6 py-3 rounded-2xl text-white text-sm font-medium"
              style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-md)' }}
            >
              ✨ Plan this week
            </Link>
          </div>
        )}
      </main>

      {/* Confetti celebration */}
      {showConfetti && <ConfettiOverlay onDone={handleConfettiDone} />}

      {/* Meal detail slide-out */}
      {selectedMeal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            onClick={closeMeal}
          />
          {/* Panel */}
          <div
            className="fixed right-0 top-0 h-full z-50 w-full max-w-sm flex flex-col"
            style={{ background: 'var(--card)', boxShadow: '-4px 0 32px rgba(61,107,71,0.12)' }}
          >
            {/* Panel header */}
            <div
              className="px-6 pt-8 pb-5 flex items-start justify-between"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                  >
                    <MealTypeIcon type={selectedMeal.meal_type} />
                    {selectedMeal.meal_type.charAt(0).toUpperCase() + selectedMeal.meal_type.slice(1)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {DAYS[selectedMeal.day_index]}
                  </span>
                </div>
                <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                  {selectedMeal.custom_name || selectedMeal.recipes?.name || 'Meal'}
                </h2>
              </div>
              <button
                onClick={closeMeal}
                className="p-2 rounded-xl hover:opacity-70 transition-opacity"
                style={{ color: 'var(--muted)' }}
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {mealDetails?.loading ? (
                <div className="flex items-center gap-2 py-8 justify-center" style={{ color: 'var(--muted)' }}>
                  <SparklesIcon size={16} />
                  <span className="text-sm">Fetching details…</span>
                </div>
              ) : mealDetails ? (
                <div className="space-y-6">
                  {/* Quick stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      className="rounded-2xl p-4 flex items-center gap-3"
                      style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                    >
                      <div style={{ color: 'var(--primary)' }}><ClockIcon size={18} /></div>
                      <div>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>Cook time</p>
                        <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                          {mealDetails.cooking_time_minutes} min
                        </p>
                      </div>
                    </div>
                    <div
                      className="rounded-2xl p-4 flex items-center gap-3"
                      style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                    >
                      <div style={{ color: 'var(--accent)' }}><FlameIcon size={18} /></div>
                      <div>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>Per serving</p>
                        <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                          {mealDetails.calories_per_serving} kcal
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Ingredients */}
                  {mealDetails.ingredients.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Ingredients</p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>↻ to swap</p>
                      </div>
                      <div className="space-y-2">
                        {mealDetails.ingredients.map((ing, i) => {
                          const inPantry = matchesPantry(ing, pantryItems)
                          const swapState = swappedIngredients[ing]
                          const isSwapping = swapState === 'loading'
                          const swapped = swapState && swapState !== 'loading'
                          return (
                            <div key={i} className="flex items-center gap-2.5 group/ing">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: inPantry ? 'var(--primary)' : swapped ? 'var(--accent)' : 'var(--border)' }}
                              />
                              <div className="flex-1 min-w-0">
                                {swapped ? (
                                  <div>
                                    <span className="text-xs line-through" style={{ color: 'var(--muted)' }}>{ing}</span>
                                    <span className="text-sm block font-medium" style={{ color: 'var(--accent)' }}>{swapState}</span>
                                  </div>
                                ) : (
                                  <span className="text-sm" style={{ color: inPantry ? 'var(--foreground)' : 'var(--muted)' }}>
                                    {ing}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {inPantry && !swapped && (
                                  <span className="text-xs" style={{ color: 'var(--primary)' }}>in pantry</span>
                                )}
                                <button
                                  onClick={() => swapped
                                    ? setSwappedIngredients(prev => { const n = { ...prev }; delete n[ing]; return n })
                                    : swapIngredient(ing)
                                  }
                                  title={swapped ? 'Undo swap' : 'Swap ingredient'}
                                  disabled={isSwapping}
                                  style={{
                                    color: swapped ? 'var(--accent)' : 'var(--muted)',
                                    opacity: isSwapping ? 0.4 : 1,
                                    transition: 'opacity 0.15s',
                                  }}
                                >
                                  <RefreshIcon size={13} />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Missing from pantry */}
                  {pantryItems.length > 0 && missingIngredients.length > 0 && (
                    <div
                      className="rounded-2xl p-4"
                      style={{ background: 'var(--secondary-light)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <PackageIcon size={14} />
                        <p className="text-xs font-semibold" style={{ color: 'var(--secondary)' }}>
                          {missingIngredients.length} ingredient{missingIngredients.length > 1 ? 's' : ''} not in pantry
                        </p>
                      </div>
                      <div className="space-y-1">
                        {missingIngredients.map((ing, i) => (
                          <p key={i} className="text-xs" style={{ color: 'var(--secondary)' }}>• {ing}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* How to cook */}
                  {mealDetails.instructions && mealDetails.instructions.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>How to cook</p>
                      <ol className="space-y-3">
                        {mealDetails.instructions.map((step, i) => (
                          <li key={i} className="flex gap-3">
                            <span
                              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                            >
                              {i + 1}
                            </span>
                            <p className="text-sm leading-relaxed pt-0.5" style={{ color: 'var(--foreground)' }}>
                              {step}
                            </p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-5 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
              {/* Save to Recipes */}
              {!mealDetails?.loading && (
                <button
                  onClick={saveToRecipes}
                  disabled={savingRecipe || savedToRecipes}
                  className="w-full py-2.5 rounded-2xl text-sm font-medium transition-colors disabled:opacity-60"
                  style={{
                    background: savedToRecipes ? 'var(--primary-light)' : 'var(--background)',
                    color: savedToRecipes ? 'var(--primary)' : 'var(--muted)',
                    border: `1px solid ${savedToRecipes ? 'var(--primary)' : 'var(--border)'}`,
                  }}
                >
                  {savedToRecipes ? '✓ Saved to Recipes' : savingRecipe ? 'Saving…' : (
                    <>
                      <BookOpenIcon size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                      Save to My Recipes
                    </>
                  )}
                </button>
              )}

              {cartAdded ? (
                <div className="flex items-center gap-3">
                  <div
                    className="flex-1 py-3 rounded-2xl text-sm font-medium text-center"
                    style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                  >
                    ✓ {missingIngredients.length} item{missingIngredients.length !== 1 ? 's' : ''} added
                  </div>
                  <Link
                    href="/shopping"
                    className="px-4 py-3 rounded-2xl text-white text-sm font-medium flex-shrink-0"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    View list →
                  </Link>
                </div>
              ) : (
                <button
                  onClick={addMissingToCart}
                  disabled={addingToCart || mealDetails?.loading || missingIngredients.length === 0}
                  className="w-full py-3 rounded-2xl text-white text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  {addingToCart ? (
                    'Adding…'
                  ) : missingIngredients.length === 0 ? (
                    '✓ All ingredients in pantry'
                  ) : (
                    <>
                      <ShoppingCartIcon size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                      Add {missingIngredients.length} missing to shopping list
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
