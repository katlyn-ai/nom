'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { HomeIcon, UtensilsIcon, BookOpenIcon, ShoppingCartIcon, SettingsIcon, LogOutIcon } from './icons'

const navItems = [
  { href: '/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/meals', label: 'Meals', Icon: UtensilsIcon },
  { href: '/recipes', label: 'Recipes', Icon: BookOpenIcon },
  { href: '/shopping', label: 'Shopping', Icon: ShoppingCartIcon },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon },
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
        <Link href="/dashboard" className="px-6 py-6 mb-2 flex items-center gap-3 hover:opacity-85 transition-opacity" style={{ borderBottom: '1px solid var(--border)' }}>
          {/* Logo mark */}
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <rect width="40" height="40" rx="12" fill="url(#nomLogoGrad)" />
            <defs>
              <linearGradient id="nomLogoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#2D5438" />
                <stop offset="100%" stopColor="#4E7E5A" />
              </linearGradient>
            </defs>
            {/* Bowl body */}
            <path d="M11 22 Q11 30 20 30 Q29 30 29 22 Z" fill="white" opacity="0.95" />
            {/* Bowl rim */}
            <line x1="10" y1="22" x2="30" y2="22" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
            {/* Steam — three wavy lines */}
            <path d="M15 19 Q14 16.5 15 14" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />
            <path d="M20 18 Q19 15.5 20 13" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />
            <path d="M25 19 Q24 16.5 25 14" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />
          </svg>
          {/* Wordmark */}
          <div>
            <div
              className="text-2xl font-bold tracking-tight leading-none"
              style={{ fontFamily: 'var(--font-display)', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              NOM
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Meal planning, simplified</p>
          </div>
        </Link>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all"
                style={{
                  background: active ? 'var(--gradient-primary)' : 'transparent',
                  color: active ? 'white' : 'var(--muted)',
                  boxShadow: active ? 'var(--shadow-md)' : 'none',
                }}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User + sign out */}
        <div className="px-3 pb-5 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 px-3 py-3 rounded-2xl" style={{ background: 'var(--background)' }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {initials}
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-sm font-medium hover:opacity-70 transition-opacity"
              style={{ color: 'var(--muted)' }}
            >
              <LogOutIcon size={14} />
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
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl"
              style={{ color: active ? 'var(--primary)' : 'var(--muted)' }}
            >
              <Icon size={20} />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
