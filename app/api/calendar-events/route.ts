import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const NIGHT_OFF_KEYWORDS = [
  'restaurant', 'dinner out', 'lunch out', 'takeaway', 'takeout', 'pizza delivery',
  'eating out', 'date night', 'birthday dinner', 'party', 'away', 'travel',
  'holiday', 'hotel', 'flight', 'wedding', 'conference', 'business dinner',
  'bbq', 'barbeque', 'potluck', 'picnic',
]

function isNightOffEvent(summary: string): boolean {
  const lower = summary.toLowerCase()
  return NIGHT_OFF_KEYWORDS.some(kw => lower.includes(kw))
}

// Refresh expired token
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  return data.access_token || null
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch stored calendar tokens
  const { data: tokenData } = await supabase
    .from('user_calendar_tokens')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!tokenData) {
    return NextResponse.json({ needsAuth: true })
  }

  let accessToken = tokenData.access_token

  // Refresh if expired
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    if (tokenData.refresh_token) {
      const newToken = await refreshAccessToken(tokenData.refresh_token)
      if (newToken) {
        accessToken = newToken
        const newExpiry = new Date(Date.now() + 3600 * 1000).toISOString()
        await supabase.from('user_calendar_tokens').update({
          access_token: newToken,
          expires_at: newExpiry,
        }).eq('user_id', user.id)
      } else {
        return NextResponse.json({ needsAuth: true })
      }
    } else {
      return NextResponse.json({ needsAuth: true })
    }
  }

  // Get current week (Mon–Sun)
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon ...
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + daysToMonday)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  // Fetch Google Calendar events
  const params = new URLSearchParams({
    timeMin: monday.toISOString(),
    timeMax: sunday.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  const calRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!calRes.ok) {
    const err = await calRes.json()
    console.error('Calendar API error:', err)
    return NextResponse.json({ events: [] })
  }

  const calData = await calRes.json()
  const items = calData.items || []

  // Map events to day indices (0=Mon ... 6=Sun)
  const events = items
    .filter((item: Record<string, unknown>) => item.summary)
    .map((item: Record<string, unknown>) => {
      const start = item.start as Record<string, string>
      const startDate = new Date(start.dateTime || start.date || '')
      const eventDow = startDate.getDay() // 0=Sun
      const dayIndex = eventDow === 0 ? 6 : eventDow - 1 // convert to Mon=0
      const summary = item.summary as string
      return {
        dayIndex,
        summary,
        isNightOff: isNightOffEvent(summary),
        allDay: !!(start.date && !start.dateTime),
      }
    })
    .filter((e: { dayIndex: number }) => e.dayIndex >= 0 && e.dayIndex <= 6)

  return NextResponse.json({ events })
}
