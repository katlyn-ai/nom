import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', process.env.NEXT_PUBLIC_APP_URL))
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  if (!clientId) {
    return new NextResponse('Google Calendar is not configured. Add GOOGLE_CALENDAR_CLIENT_ID to your environment variables.', { status: 500 })
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-calendar/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state: user.id, // pass userId to associate tokens on callback
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return NextResponse.redirect(authUrl)
}
