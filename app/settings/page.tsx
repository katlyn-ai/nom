'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'

type Settings = {
  household_size: number
  dietary_preferences: string[]
  pantry_enabled: boolean
  currency: string
  preferred_store: string
  order_day: string
  calorie_target: number | null
}

const DIETS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal', 'Keto', 'Low-carb']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    household_size: 2,
    dietary_preferences: [],
    pantry_enabled: true,
    currency: '€',
    preferred_store: '',
    order_day: 'Sunday',
    calorie_target: null,
  })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase.from('settings').select('*').eq('user_id', user.id).single()
      if (data) setSettings(data)
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

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-60 px-6 py-8 pb-24 md:pb-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Settings</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Personalise NOM for your household</p>
        </div>

        <div className="space-y-6">
          {/* Household */}
          <section
            className="rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>🏠 Household</h2>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                Number of people
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    onClick={() => setSettings(prev => ({ ...prev, household_size: n }))}
                    className="w-10 h-10 rounded-xl text-sm font-medium transition-colors"
                    style={{
                      background: settings.household_size === n ? 'var(--primary)' : 'var(--border)',
                      color: settings.household_size === n ? 'white' : 'var(--muted)',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Dietary */}
          <section
            className="rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>🥗 Dietary preferences</h2>
            <div className="flex flex-wrap gap-2">
              {DIETS.map(diet => (
                <button
                  key={diet}
                  onClick={() => toggleDiet(diet)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={{
                    background: settings.dietary_preferences.includes(diet) ? 'var(--primary)' : 'var(--border)',
                    color: settings.dietary_preferences.includes(diet) ? 'white' : 'var(--muted)',
                  }}
                >
                  {diet}
                </button>
              ))}
            </div>
          </section>

          {/* Shopping */}
          <section
            className="rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>🛒 Shopping</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                  Preferred order day
                </label>
                <select
                  value={settings.order_day}
                  onChange={e => setSettings(prev => ({ ...prev, order_day: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                >
                  {DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                  Preferred store (optional)
                </label>
                <input
                  type="text"
                  value={settings.preferred_store}
                  onChange={e => setSettings(prev => ({ ...prev, preferred_store: e.target.value }))}
                  placeholder="e.g. Lidl, Tesco, Albert Heijn…"
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                  Currency
                </label>
                <div className="flex gap-2">
                  {['€', '£', '$', 'kr'].map(c => (
                    <button
                      key={c}
                      onClick={() => setSettings(prev => ({ ...prev, currency: c }))}
                      className="px-4 py-2 rounded-xl text-sm font-medium"
                      style={{
                        background: settings.currency === c ? 'var(--primary)' : 'var(--border)',
                        color: settings.currency === c ? 'white' : 'var(--muted)',
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Pantry toggle */}
          <section
            className="rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>🥫 Pantry tracking</h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                  Track what you have at home
                </p>
              </div>
              <button
                onClick={() => setSettings(prev => ({ ...prev, pantry_enabled: !prev.pantry_enabled }))}
                className="w-12 h-6 rounded-full transition-colors flex items-center"
                style={{ background: settings.pantry_enabled ? 'var(--primary)' : 'var(--border)' }}
              >
                <span
                  className="w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5"
                  style={{ transform: settings.pantry_enabled ? 'translateX(24px)' : 'translateX(0)' }}
                />
              </button>
            </div>
          </section>

          {/* Calories */}
          <section
            className="rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>🔥 Calorie target (optional)</h2>
            <input
              type="number"
              value={settings.calorie_target || ''}
              onChange={e => setSettings(prev => ({ ...prev, calorie_target: e.target.value ? +e.target.value : null }))}
              placeholder="e.g. 2000 kcal per person per day"
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
          </section>

          <button
            onClick={handleSave}
            className="w-full py-3.5 rounded-xl text-white font-medium transition-opacity hover:opacity-90"
            style={{ background: saved ? 'var(--secondary)' : 'var(--primary)' }}
          >
            {saved ? '✓ Saved!' : 'Save settings'}
          </button>
        </div>
      </main>
    </div>
  )
}
