'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) { setError(error.message); setLoading(false) }
    else { setSuccess(true); setLoading(false) }
  }

  const handleGoogleSignup = async () => {
    setGoogleLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--background)' }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-6">🎉</div>
          <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>Check your email</h1>
          <p style={{ color: 'var(--muted)' }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <Link href="/auth/login" className="inline-block mt-6 text-sm font-medium hover:underline" style={{ color: 'var(--primary)' }}>
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>

      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'var(--gradient-hero)' }}
      >
        <div className="relative z-10 text-white text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>NOM</div>
        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-white leading-tight mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Your household,<br />your meals,<br />your way.
          </h2>
          <p className="text-white/70 text-base leading-relaxed">
            NOM learns your family&apos;s preferences, builds meal plans you&apos;ll love, and handles the shopping automatically.
          </p>
        </div>
        <div className="relative z-10 text-white/40 text-sm">Free to get started · No credit card required</div>
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
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Create your account</h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>Takes less than a minute</p>
          </div>

          {/* Google sign up */}
          <button
            onClick={handleGoogleSignup}
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

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Your name</label>
              <input
                id="name" type="text" value={name} onChange={e => setName(e.target.value)} required
                placeholder="Käts"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)', boxShadow: 'var(--shadow-sm)' }}
              />
            </div>
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
                id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                placeholder="At least 6 characters"
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
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Already have an account?{' '}
            <Link href="/auth/login" className="font-medium hover:underline" style={{ color: 'var(--primary)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
