import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const userId = searchParams.get('state') // we passed userId as state

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (!code || !userId) {
    return NextResponse.redirect(`${appUrl}/settings?calendar=error`)
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET!
  const redirectUri = `${appUrl}/api/auth/google-calendar/callback`

  // Exchange auth code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    console.error('Google token exchange failed:', tokens)
    return NextResponse.redirect(`${appUrl}/settings?calendar=error`)
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()

  // Store tokens in Supabase
  const supabase = await createClient()
  await supabase.from('user_calendar_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: expiresAt,
  }, { onConflict: 'user_id' })

  return NextResponse.redirect(`${appUrl}/settings?calendar=connected`)
}
