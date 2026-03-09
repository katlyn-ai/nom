import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/nav'
import Link from 'next/link'
import { SparklesIcon, ShoppingCartIcon, BookOpenIcon, CreditCardIcon, CalendarDaysIcon, SunIcon, CloudSunIcon, MoonIcon, UtensilsIcon } from '@/components/icons'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MealTypeIcon = ({ type }: { type: string }) => {
  if (type === 'breakfast') return <SunIcon size={12} />
  if (type === 'lunch') return <CloudSunIcon size={12} />
  return <MoonIcon size={12} />
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: meals } = await supabase
    .from('meal_plans')
    .select('*, recipes(*)')
    .eq('user_id', user.id)
    .order('day_index', { ascending: true })
    .limit(21)

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data: orders } = await supabase
    .from('orders')
    .select('amount')
    .eq('user_id', user.id)
    .gte('created_at', startOfMonth.toISOString())

  const totalSpent = orders?.reduce((sum, o) => sum + (o.amount || 0), 0) ?? 0
  const mealCount = meals?.length ?? 0
  const firstName = user.user_metadata?.full_name?.split(' ')[0] || 'there'

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
        <div className="grid grid-cols-2 gap-4 mb-7">
          {[
            { icon: <CreditCardIcon size={18} />, label: 'Spent this month', value: `€${totalSpent.toFixed(2)}` },
            { icon: <CalendarDaysIcon size={18} />, label: 'Meals planned', value: `${mealCount}` },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-2xl p-5"
              style={{ background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}
            >
              <div className="mb-2" style={{ color: 'var(--primary)' }}>{stat.icon}</div>
              <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>
                {stat.label}
              </p>
              <p className="text-2xl font-bold" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* This week */}
        <div className="mb-4 flex items-center justify-between">
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
                        <span
                          key={meal.id}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                        >
                          <MealTypeIcon type={meal.meal_type} />
                          {meal.recipes?.name || meal.custom_name || 'Meal'}
                        </span>
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
    </div>
  )
}
