import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/nav'
import Link from 'next/link'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Fetch this week's meal plan
  const { data: meals } = await supabase
    .from('meal_plans')
    .select('*, recipes(*)')
    .eq('user_id', user.id)
    .order('day_index', { ascending: true })
    .limit(21) // 7 days x 3 meals

  // Fetch grocery spending this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data: orders } = await supabase
    .from('orders')
    .select('amount')
    .eq('user_id', user.id)
    .gte('created_at', startOfMonth.toISOString())

  const totalSpent = orders?.reduce((sum, o) => sum + (o.amount || 0), 0) ?? 0

  const firstName = user.user_metadata?.full_name?.split(' ')[0] || 'there'

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />

      <main className="md:ml-60 px-6 py-8 pb-24 md:pb-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
            Hey {firstName} 👋
          </h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            Here&apos;s your week at a glance
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Spent this month</p>
            <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--foreground)' }}>
              €{totalSpent.toFixed(2)}
            </p>
          </div>
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Meals planned</p>
            <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--foreground)' }}>
              {meals?.length ?? 0} / 21
            </p>
          </div>
        </div>

        {/* This week's meals */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
            This week
          </h2>
          <Link
            href="/meals"
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Edit plan →
          </Link>
        </div>

        {meals && meals.length > 0 ? (
          <div className="space-y-3">
            {DAYS.map((day, i) => {
              const dayMeals = meals.filter(m => m.day_index === i)
              return (
                <div
                  key={day}
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  <p className="text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>
                    {day}
                  </p>
                  {dayMeals.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {dayMeals.map(meal => (
                        <span
                          key={meal.id}
                          className="text-sm px-3 py-1 rounded-full"
                          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                        >
                          {meal.meal_type === 'breakfast' ? '🌅' : meal.meal_type === 'lunch' ? '☀️' : '🌙'}{' '}
                          {meal.recipes?.name || meal.custom_name || 'Meal'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      Nothing planned yet
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-4xl mb-3">🍽️</p>
            <p className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>
              No meals planned yet
            </p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Let NOM suggest meals for the week based on your preferences
            </p>
            <Link
              href="/meals"
              className="inline-block px-5 py-2.5 rounded-xl text-white text-sm font-medium"
              style={{ background: 'var(--primary)' }}
            >
              Plan this week
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
