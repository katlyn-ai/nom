'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Nav from '@/components/nav'

type Settings = {
  household_size: number
  dietary_preferences: string[]
  pantry_enabled: boolean
  currency: string
  preferred_store: string
  order_day: string
  calorie_target: number | null
  plan_breakfast: boolean
  plan_lunch: boolean
  plan_dinner: boolean
  vegetarian_meals_per_week: number
  snacks: string
  preferred_brands: string[]
  store_sort_preference: string
}

const DIETS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal', 'Keto', 'Low-carb']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SORT_OPTIONS = [
  { value: 'popular', label: 'Most popular first', emoji: '⭐' },
  { value: 'sale', label: 'On sale first', emoji: '🏷️' },
  { value: 'price_per_kg', label: 'Lowest price per kg', emoji: '⚖️' },
  { value: 'my_brands', label: 'My preferred brands first', emoji: '❤️' },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    household_size: 2,
    dietary_preferences: [],
    pantry_enabled: true,
    currency: '€',
    preferred_store: '',
    order_day: 'Sunday',
    calorie_target: null,
    plan_breakfast: true,
    plan_lunch: true,
    plan_dinner: true,
    vegetarian_meals_per_week: 0,
    snacks: '',
    preferred_brands: [],
    store_sort_preference: 'popular',
  })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [brandInput, setBrandInput] = useState('')
  const [calendarConnected, setCalendarConnected] = useState(false)
  const brandInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase.from('settings').select('*').eq('user_id', user.id).single()
      if (data) {
        setSettings(prev => ({
          ...prev, ...data,
          plan_breakfast: data.plan_breakfast ?? true,
          plan_lunch: data.plan_lunch ?? true,
          plan_dinner: data.plan_dinner ?? true,
          vegetarian_meals_per_week: data.vegetarian_meals_per_week ?? 0,
          snacks: data.snacks ?? '',
          preferred_brands: data.preferred_brands ?? [],
          store_sort_preference: data.store_sort_preference ?? 'popular',
        }))
      }
      // Check if calendar is connected
      const { data: calToken } = await supabase
        .from('user_calendar_tokens')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      setCalendarConnected(!!calToken)
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!userId) return
    await supabase.from('settings').upsert({ ...settings, user_id: userId })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const toggleDiet = (diet: string) => {
    setSettings(prev => ({
      ...prev,
      dietary_preferences: prev.dietary_preferences.includes(diet)
        ? prev.dietary_preferences.filter(d => d !== diet)
        : [...prev.dietary_preferences, diet],
    }))
  }

  const toggleMealPlan = (key: 'plan_breakfast' | 'plan_lunch' | 'plan_dinner') => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const addBrand = (val: string) => {
    const trimmed = val.trim()
    if (trimmed && !settings.preferred_brands.includes(trimmed)) {
      setSettings(prev => ({ ...prev, preferred_brands: [...prev.preferred_brands, trimmed] }))
    }
    setBrandInput('')
  }

  const removeBrand = (brand: string) => {
    setSettings(prev => ({ ...prev, preferred_brands: prev.preferred_brands.filter(b => b !== brand) }))
  }

  const disconnectCalendar = async () => {
    if (!userId) return
    await supabase.from('user_calendar_tokens').delete().eq('user_id', userId)
    setCalendarConnected(false)
  }

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}><Nav /></div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-64 px-6 py-8 pb-24 md:pb-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Settings</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Personalise NOM for your household</p>
        </div>

        <div className="space-y-5">

          {/* Household */}
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>🏠 Household</h2>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Number of people</label>
            <div className="flex gap-2">
              {[1,2,3,4,5,6].map(n => (
                <button key={n} onClick={() => setSettings(prev => ({ ...prev, household_size: n }))}
                  className="w-10 h-10 rounded-xl text-sm font-medium"
                  style={{ background: settings.household_size === n ? 'var(--gradient-primary)' : 'var(--background)', color: settings.household_size === n ? 'white' : 'var(--muted)', boxShadow: settings.household_size === n ? 'var(--shadow-sm)' : 'none', border: `1px solid ${settings.household_size === n ? 'transparent' : 'var(--border)'}` }}
                >{n}</button>
              ))}
            </div>
          </section>

          {/* Dietary */}
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>🥗 Dietary preferences</h2>
            <div className="flex flex-wrap gap-2">
              {DIETS.map(diet => (
                <button key={diet} onClick={() => toggleDiet(diet)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: settings.dietary_preferences.includes(diet) ? 'var(--gradient-primary)' : 'var(--background)', color: settings.dietary_preferences.includes(diet) ? 'white' : 'var(--muted)', border: `1px solid ${settings.dietary_preferences.includes(diet) ? 'transparent' : 'var(--border)'}` }}
                >{diet}</button>
              ))}
            </div>
          </section>

          {/* Meal planning */}
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>📅 Meal planning</h2>

            <div className="mb-5">
              <label className="block text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>Which meals should NOM plan?</label>
              <div className="space-y-2.5">
                {[
                  { key: 'plan_breakfast' as const, label: '🌅 Breakfast' },
                  { key: 'plan_lunch' as const, label: '☀️ Lunch' },
                  { key: 'plan_dinner' as const, label: '🌙 Dinner' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{label}</span>
                    <button onClick={() => toggleMealPlan(key)}
                      className="w-12 h-6 rounded-full flex items-center"
                      style={{ background: settings[key] ? 'var(--gradient-primary)' : 'var(--border)' }}
                    >
                      <span className="w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5"
                        style={{ transform: settings[key] ? 'translateX(24px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Vegetarian meals per week</label>
              <div className="flex gap-2 flex-wrap">
                {[0,1,2,3,4,5,6,7].map(n => (
                  <button key={n} onClick={() => setSettings(prev => ({ ...prev, vegetarian_meals_per_week: n }))}
                    className="w-10 h-10 rounded-xl text-sm font-medium"
                    style={{ background: settings.vegetarian_meals_per_week === n ? 'var(--gradient-primary)' : 'var(--background)', color: settings.vegetarian_meals_per_week === n ? 'white' : 'var(--muted)', border: `1px solid ${settings.vegetarian_meals_per_week === n ? 'transparent' : 'var(--border)'}` }}
                  >{n}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Typical snacks (optional)</label>
              <input type="text" value={settings.snacks}
                onChange={e => setSettings(prev => ({ ...prev, snacks: e.target.value }))}
                placeholder="e.g. fruit, nuts, crackers, yoghurt…"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
              />
            </div>
          </section>

          {/* Preferred brands */}
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold mb-1" style={{ color: 'var(--foreground)' }}>🛍️ Preferred brands & products</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              NOM will prioritise these when generating your shopping list
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {settings.preferred_brands.map(brand => (
                <span key={brand} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                >
                  {brand}
                  <button onClick={() => removeBrand(brand)} className="hover:opacity-70 leading-none font-bold">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                ref={brandInputRef}
                type="text"
                value={brandInput}
                onChange={e => setBrandInput(e.target.value)}
                placeholder="e.g. Lurpak, Oatly, Warburtons…"
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addBrand(brandInput) } }}
                className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
              />
              <button
                onClick={() => addBrand(brandInput)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: 'var(--gradient-primary)' }}
              >
                Add
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>Press Enter or comma to add</p>
          </section>

          {/* Store sorting */}
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold mb-1" style={{ color: 'var(--foreground)' }}>🔢 Find items in store by</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>How should NOM sort products when filling your basket?</p>
            <div className="space-y-2">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSettings(prev => ({ ...prev, store_sort_preference: opt.value }))}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-left"
                  style={{
                    background: settings.store_sort_preference === opt.value ? 'var(--primary-light)' : 'var(--background)',
                    color: settings.store_sort_preference === opt.value ? 'var(--primary)' : 'var(--muted)',
                    border: `1px solid ${settings.store_sort_preference === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                  }}
                >
                  <span>{opt.emoji}</span>
                  {opt.label}
                  {settings.store_sort_preference === opt.value && <span className="ml-auto">✓</span>}
                </button>
              ))}
            </div>
          </section>

          {/* Shopping */}
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>🛒 Shopping</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Preferred order day</label>
                <select value={settings.order_day} onChange={e => setSettings(prev => ({ ...prev, order_day: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                >
                  {DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Preferred store (optional)</label>
                <input type="text" value={settings.preferred_store}
                  onChange={e => setSettings(prev => ({ ...prev, preferred_store: e.target.value }))}
                  placeholder="e.g. Lidl, Tesco, Albert Heijn…"
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Currency</label>
                <div className="flex gap-2">
                  {['€','£','$','kr'].map(c => (
                    <button key={c} onClick={() => setSettings(prev => ({ ...prev, currency: c }))}
                      className="px-4 py-2 rounded-xl text-sm font-medium"
                      style={{ background: settings.currency === c ? 'var(--gradient-primary)' : 'var(--background)', color: settings.currency === c ? 'white' : 'var(--muted)', border: `1px solid ${settings.currency === c ? 'transparent' : 'var(--border)'}` }}
                    >{c}</button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Google Calendar */}
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>🗓 Google Calendar</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                  {calendarConnected
                    ? 'Your calendar is connected. Events show in your meal plan.'
                    : 'Connect to see your events in the meal plan and flag nights off.'}
                </p>
              </div>
              {calendarConnected ? (
                <button onClick={disconnectCalendar}
                  className="flex-shrink-0 px-3 py-2 rounded-xl text-sm font-medium"
                  style={{ background: '#FEE2E2', color: '#DC2626' }}
                >
                  Disconnect
                </button>
              ) : (
                <a href="/api/auth/google-calendar"
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-sm)' }}
                >
                  Connect
                </a>
              )}
            </div>
          </section>

          {/* Pantry */}
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>🥫 Pantry tracking</h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>Track what you have at home</p>
              </div>
              <button onClick={() => setSettings(prev => ({ ...prev, pantry_enabled: !prev.pantry_enabled }))}
                className="w-12 h-6 rounded-full flex items-center"
                style={{ background: settings.pantry_enabled ? 'var(--gradient-primary)' : 'var(--border)' }}
              >
                <span className="w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5"
                  style={{ transform: settings.pantry_enabled ? 'translateX(24px)' : 'translateX(0)' }} />
              </button>
            </div>
          </section>

          {/* Calories */}
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>🔥 Calorie target (optional)</h2>
            <input type="number" value={settings.calorie_target || ''}
              onChange={e => setSettings(prev => ({ ...prev, calorie_target: e.target.value ? +e.target.value : null }))}
              placeholder="e.g. 2000 kcal per person per day"
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
          </section>

          <button onClick={handleSave}
            className="w-full py-3.5 rounded-2xl text-white font-medium"
            style={{ background: saved ? '#4A7C59' : 'var(--gradient-primary)', boxShadow: 'var(--shadow-md)' }}
          >
            {saved ? '✓ Saved!' : 'Save settings'}
          </button>

          {/* Sign out — always visible, especially useful on mobile where the sidebar isn't shown */}
          <button
            onClick={handleSignOut}
            className="w-full py-3.5 rounded-2xl text-sm font-medium"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}
          >
            Sign out
          </button>
        </div>
      </main>
    </div>
  )
}
