'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', label: 'Home', emoji: '🏠' },
  { href: '/meals', label: 'Meals', emoji: '🍽️' },
  { href: '/recipes', label: 'Recipes', emoji: '📖' },
  { href: '/shopping', label: 'Shopping', emoji: '🛒' },
  { href: '/settings', label: 'Settings', emoji: '⚙️' },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-60 min-h-screen py-8 px-4 fixed left-0 top-0"
        style={{ background: 'var(--card)', borderRight: '1px solid var(--border)' }}
      >
        <div
          className="text-2xl font-bold tracking-tight px-3 mb-10"
          style={{ color: 'var(--primary)' }}
        >
          NOM
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: active ? 'var(--primary-light)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--muted)',
                }}
              >
                <span className="text-lg">{item.emoji}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full text-left transition-colors hover:opacity-70"
          style={{ color: 'var(--muted)' }}
        >
          <span className="text-lg">👋</span>
          Sign out
        </button>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around py-3 px-2 z-50"
        style={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}
      >
        {navItems.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl"
              style={{ color: active ? 'var(--primary)' : 'var(--muted)' }}
            >
              <span className="text-xl">{item.emoji}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
