'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>
      {/* Left panel — branding */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: 'var(--primary)' }}
      >
        <div className="text-white text-3xl font-bold tracking-tight">NOM</div>
        <div>
          <p className="text-white/80 text-lg leading-relaxed mb-8">
            "The easiest way to plan what we eat, know what we need, and actually enjoy the process."
          </p>
          <div className="flex gap-3">
            {['🥗', '🍝', '🛒', '🍳'].map((emoji, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                {emoji}
              </div>
            ))}
          </div>
        </div>
        <div className="text-white/50 text-sm">
          Meal planning · Recipe book · Smart shopping
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="text-2xl font-bold mb-1" style={{ color: 'var(--primary)' }}>NOM</div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
              Welcome back
            </h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>
              Sign in to your account
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--foreground)' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--foreground)' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                }}
              />
            </div>

            {error && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: '#FEE2E2', color: '#DC2626' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: 'var(--primary)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Don&apos;t have an account?{' '}
            <Link
              href="/auth/signup"
              className="font-medium hover:underline"
              style={{ color: 'var(--primary)' }}
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
