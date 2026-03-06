import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes — no auth needed
  const publicRoutes = ['/', '/auth/login', '/auth/signup', '/auth/callback']
  const isPublicRoute = publicRoutes.some(route => pathname === route)

  // Redirect to login if not authenticated and trying to access protected route
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Redirect to dashboard if already logged in and visiting auth pages
  if (user && (pathname === '/auth/login' || pathname === '/auth/signup' || pathname === '/')) {
    // Check if onboarding is completed
    const { data: settings } = await supabase
      .from('settings')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .single()

    if (!settings?.onboarding_completed) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Redirect logged-in users who haven't done onboarding
  if (user && pathname !== '/onboarding') {
    const { data: settings } = await supabase
      .from('settings')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .single()

    if (!settings?.onboarding_completed) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
