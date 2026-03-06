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
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else { router.push('/dashboard'); router.refresh() }
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>

      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'var(--gradient-hero)' }}
      >
        <div className="relative z-10 text-white text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          NOM
        </div>
        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-white leading-tight mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Your kitchen,<br />planned perfectly.
          </h2>
          <p className="text-white/70 text-base leading-relaxed mb-8">
            AI-powered meal planning that learns what your family loves and handles the shopping automatically.
          </p>
          <div className="flex gap-3 flex-wrap">
            {['🥗 Smart meals', '🛒 Auto shopping', '👨‍👩‍👧 For families', '✨ AI powered'].map(tag => (
              <div key={tag} className="px-3 py-1.5 rounded-full text-sm text-white/90 font-medium" style={{ background: 'rgba(255,255,255,0.15)' }}>
                {tag}
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-white/40 text-sm">Meal planning · Recipes · Smart shopping</div>
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
        <div className="absolute -left-8 -bottom-16 w-56 h-56 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div
              className="text-2xl font-bold mb-1"
              style={{ fontFamily: 'var(--font-display)', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              NOM
            </div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Welcome back</h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>Sign in to your account</p>
          </div>

          {/* Google sign in */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl text-sm font-medium mb-4 transition-all hover:shadow-md disabled:opacity-60"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)', boxShadow: 'var(--shadow-sm)' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Email</label>
              <input
                id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)', boxShadow: 'var(--shadow-sm)' }}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Password</label>
              <input
                id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)', boxShadow: 'var(--shadow-sm)' }}
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-3 rounded-2xl text-white font-medium text-sm transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-md)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="font-medium hover:underline" style={{ color: 'var(--primary)' }}>
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
