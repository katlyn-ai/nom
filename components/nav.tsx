'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

const navItems = [
  { href: '/dashboard', label: 'Home', icon: '⌂' },
  { href: '/meals', label: 'Meals', icon: '🍽' },
  { href: '/recipes', label: 'Recipes', icon: '📖' },
  { href: '/shopping', label: 'Shopping', icon: '🛒' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [initials, setInitials] = useState('?')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name = user?.user_metadata?.full_name || user?.email || ''
      setInitials(name ? name.slice(0, 1).toUpperCase() : '?')
    })
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-64 min-h-screen py-0 fixed left-0 top-0 z-40"
        style={{ background: 'var(--card)', boxShadow: '2px 0 24px rgba(61,107,71,0.08)', borderRight: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="px-6 py-6 mb-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            className="text-3xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-display)', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            NOM
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Meal planning, simplified</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium group"
                style={{
                  background: active ? 'var(--gradient-primary)' : 'transparent',
                  color: active ? 'white' : 'var(--muted)',
                  boxShadow: active ? 'var(--shadow-md)' : 'none',
                }}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User + sign out */}
        <div className="px-3 pb-5 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 px-3 py-3 rounded-2xl mb-1" style={{ background: 'var(--background)' }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {initials}
            </div>
            <button
              onClick={handleSignOut}
              className="text-sm font-medium hover:opacity-70 transition-opacity"
              style={{ color: 'var(--muted)' }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around py-2 px-1 z-50"
        style={{ background: 'var(--card)', boxShadow: '0 -4px 20px rgba(61,107,71,0.08)', borderTop: '1px solid var(--border)' }}
      >
        {navItems.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl"
              style={{ color: active ? 'var(--primary)' : 'var(--muted)' }}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
