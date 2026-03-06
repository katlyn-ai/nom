'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Person = {
  name: string
  age_group: string
  dislikes: string
  allergies: string
}

const STEPS = ['Welcome', 'Household', 'People', 'Eating habits', 'Shopping', 'All set']
const AGE_GROUPS = ['Baby (0–2)', 'Child (3–12)', 'Teen (13–17)', 'Adult (18+)']
const DIETS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal', 'Keto', 'Low-carb']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Step 2: Household
  const [householdSize, setHouseholdSize] = useState(2)

  // Step 3: People
  const [people, setPeople] = useState<Person[]>([
    { name: '', age_group: 'Adult (18+)', dislikes: '', allergies: '' },
    { name: '', age_group: 'Adult (18+)', dislikes: '', allergies: '' },
  ])

  // Step 4: Eating habits
  const [diets, setDiets] = useState<string[]>([])
  const [breakfastStyle, setBreakfastStyle] = useState('')
  const [lunchStyle, setLunchStyle] = useState('')
  const [dinnerStyle, setDinnerStyle] = useState('')

  // Step 5: Shopping
  const [preferredStore, setPreferredStore] = useState('')
  const [orderDay, setOrderDay] = useState('Sunday')
  const [pantryEnabled, setPantryEnabled] = useState(true)
  const [currency, setCurrency] = useState('€')

  const updatePerson = (i: number, field: keyof Person, value: string) => {
    setPeople(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  const updatePeopleCount = (n: number) => {
    setHouseholdSize(n)
    setPeople(prev => {
      if (n > prev.length) {
        return [...prev, ...Array(n - prev.length).fill({ name: '', age_group: 'Adult (18+)', dislikes: '', allergies: '' })]
      }
      return prev.slice(0, n)
    })
  }

  const toggleDiet = (diet: string) => {
    setDiets(prev => prev.includes(diet) ? prev.filter(d => d !== diet) : [...prev, diet])
  }

  const handleFinish = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Save settings
    await supabase.from('settings').upsert({
      user_id: user.id,
      household_size: householdSize,
      dietary_preferences: diets,
      pantry_enabled: pantryEnabled,
      preferred_store: preferredStore,
      order_day: orderDay,
      currency,
      breakfast_style: breakfastStyle,
      lunch_style: lunchStyle,
      dinner_style: dinnerStyle,
      onboarding_completed: true,
    })

    // Save people profiles
    const validPeople = people.filter(p => p.name.trim())
    if (validPeople.length > 0) {
      await supabase.from('people_profiles').upsert(
        validPeople.map(p => ({
          user_id: user.id,
          name: p.name.trim(),
          age_group: p.age_group,
          dislikes: p.dislikes.split(',').map(s => s.trim()).filter(Boolean),
          allergies: p.allergies.split(',').map(s => s.trim()).filter(Boolean),
        }))
      )
    }

    router.push('/dashboard')
    router.refresh()
  }

  const progress = (step / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>NOM</span>
        </div>

        {/* Progress bar */}
        {step > 0 && step < STEPS.length - 1 && (
          <div className="mb-8">
            <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--muted)' }}>
              <span>Step {step} of {STEPS.length - 2}</span>
              <span>{STEPS[step]}</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: 'var(--primary)' }}
              />
            </div>
          </div>
        )}

        {/* Card */}
        <div
          className="rounded-3xl p-8"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="text-6xl mb-6">👋</div>
              <h1 className="text-2xl font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
                Welcome to NOM!
              </h1>
              <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--muted)' }}>
                Let&apos;s take 2 minutes to set NOM up for your household. We&apos;ll learn what your family likes, how you shop, and make sure every suggestion feels made for you.
              </p>
              <button
                onClick={() => setStep(1)}
                className="w-full py-3.5 rounded-2xl text-white font-medium text-base"
                style={{ background: 'var(--primary)' }}
              >
                Let&apos;s go →
              </button>
            </div>
          )}

          {/* Step 1: Household size */}
          {step === 1 && (
            <div>
              <div className="text-4xl mb-4">🏠</div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                How many people are in your household?
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
                This helps NOM plan the right portions and quantities.
              </p>
              <div className="flex gap-3 flex-wrap mb-8">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    onClick={() => updatePeopleCount(n)}
                    className="w-14 h-14 rounded-2xl text-lg font-semibold transition-all"
                    style={{
                      background: householdSize === n ? 'var(--primary)' : 'var(--border)',
                      color: householdSize === n ? 'white' : 'var(--muted)',
                      transform: householdSize === n ? 'scale(1.08)' : 'scale(1)',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="px-5 py-3 rounded-2xl text-sm font-medium" style={{ background: 'var(--border)', color: 'var(--muted)' }}>Back</button>
                <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-2xl text-white font-medium text-sm" style={{ background: 'var(--primary)' }}>Continue →</button>
              </div>
            </div>
          )}

          {/* Step 2: People profiles */}
          {step === 2 && (
            <div>
              <div className="text-4xl mb-4">👥</div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                Tell us about each person
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
                Names, dislikes, and allergies — so NOM never suggests something someone won&apos;t eat.
              </p>
              <div className="space-y-5 mb-6 max-h-80 overflow-y-auto pr-1">
                {people.map((person, i) => (
                  <div
                    key={i}
                    className="rounded-2xl p-4 space-y-3"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={person.name}
                        onChange={e => updatePerson(i, 'name', e.target.value)}
                        placeholder={`Person ${i + 1} name`}
                        className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                      />
                      <select
                        value={person.age_group}
                        onChange={e => updatePerson(i, 'age_group', e.target.value)}
                        className="px-3 py-2 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                      >
                        {AGE_GROUPS.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                    <input
                      type="text"
                      value={person.dislikes}
                      onChange={e => updatePerson(i, 'dislikes', e.target.value)}
                      placeholder="Dislikes (e.g. mushrooms, fish)"
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                    />
                    <input
                      type="text"
                      value={person.allergies}
                      onChange={e => updatePerson(i, 'allergies', e.target.value)}
                      placeholder="Allergies (e.g. nuts, gluten)"
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-5 py-3 rounded-2xl text-sm font-medium" style={{ background: 'var(--border)', color: 'var(--muted)' }}>Back</button>
                <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-2xl text-white font-medium text-sm" style={{ background: 'var(--primary)' }}>Continue →</button>
              </div>
            </div>
          )}

          {/* Step 3: Eating habits */}
          {step === 3 && (
            <div>
              <div className="text-4xl mb-4">🍽️</div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                What are your eating habits?
              </h2>
              <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
                This helps NOM suggest meals that fit your lifestyle.
              </p>
              <div className="space-y-4 mb-5">
                {[
                  { label: '🌅 Typical breakfast', value: breakfastStyle, setter: setBreakfastStyle, placeholder: 'e.g. cereal, eggs, yoghurt, skip it…' },
                  { label: '☀️ Typical lunch', value: lunchStyle, setter: setLunchStyle, placeholder: 'e.g. sandwich, leftovers, eat out…' },
                  { label: '🌙 Typical dinner', value: dinnerStyle, setter: setDinnerStyle, placeholder: 'e.g. proper cooked meal, quick and easy…' },
                ].map(field => (
                  <div key={field.label}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>{field.label}</label>
                    <input
                      type="text"
                      value={field.value}
                      onChange={e => field.setter(e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    />
                  </div>
                ))}
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Any dietary requirements?</label>
                <div className="flex flex-wrap gap-2">
                  {DIETS.map(diet => (
                    <button
                      key={diet}
                      onClick={() => toggleDiet(diet)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium"
                      style={{
                        background: diets.includes(diet) ? 'var(--primary)' : 'var(--border)',
                        color: diets.includes(diet) ? 'white' : 'var(--muted)',
                      }}
                    >
                      {diet}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="px-5 py-3 rounded-2xl text-sm font-medium" style={{ background: 'var(--border)', color: 'var(--muted)' }}>Back</button>
                <button onClick={() => setStep(4)} className="flex-1 py-3 rounded-2xl text-white font-medium text-sm" style={{ background: 'var(--primary)' }}>Continue →</button>
              </div>
            </div>
          )}

          {/* Step 4: Shopping */}
          {step === 4 && (
            <div>
              <div className="text-4xl mb-4">🛒</div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                How do you shop?
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
                NOM will organise your shopping around your preferences.
              </p>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Preferred store</label>
                  <input
                    type="text"
                    value={preferredStore}
                    onChange={e => setPreferredStore(e.target.value)}
                    placeholder="e.g. Lidl, Tesco, Albert Heijn…"
                    className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Which day do you usually order?</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map(day => (
                      <button
                        key={day}
                        onClick={() => setOrderDay(day)}
                        className="px-3 py-1.5 rounded-full text-sm font-medium"
                        style={{
                          background: orderDay === day ? 'var(--primary)' : 'var(--border)',
                          color: orderDay === day ? 'white' : 'var(--muted)',
                        }}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Currency</label>
                  <div className="flex gap-2">
                    {['€', '£', '$', 'kr'].map(c => (
                      <button
                        key={c}
                        onClick={() => setCurrency(c)}
                        className="px-4 py-2 rounded-xl text-sm font-medium"
                        style={{
                          background: currency === c ? 'var(--primary)' : 'var(--border)',
                          color: currency === c ? 'white' : 'var(--muted)',
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className="flex items-center justify-between rounded-2xl p-4"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Track your pantry</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Keep a list of what you have at home</p>
                  </div>
                  <button
                    onClick={() => setPantryEnabled(!pantryEnabled)}
                    className="w-12 h-6 rounded-full flex items-center transition-colors"
                    style={{ background: pantryEnabled ? 'var(--primary)' : 'var(--border)' }}
                  >
                    <span
                      className="w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5"
                      style={{ transform: pantryEnabled ? 'translateX(24px)' : 'translateX(0)' }}
                    />
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="px-5 py-3 rounded-2xl text-sm font-medium" style={{ background: 'var(--border)', color: 'var(--muted)' }}>Back</button>
                <button onClick={() => setStep(5)} className="flex-1 py-3 rounded-2xl text-white font-medium text-sm" style={{ background: 'var(--primary)' }}>Almost done →</button>
              </div>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div className="text-center">
              <div className="text-6xl mb-6">🎉</div>
              <h2 className="text-2xl font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
                NOM is ready for you!
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--muted)' }}>
                Your household is set up. Head to your dashboard to plan your first week of meals — NOM will suggest options based on everything you just told us.
              </p>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="w-full py-3.5 rounded-2xl text-white font-medium text-base disabled:opacity-60"
                style={{ background: 'var(--primary)' }}
              >
                {saving ? 'Saving…' : 'Take me to NOM →'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
