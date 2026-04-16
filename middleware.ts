import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ACCESSIBLE_PAGES } from './lib/rbac'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes that don't require authentication
  const publicRoutes = ['/auth/login', '/auth/signup', '/setup', '/']
  
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Protected routes - require authentication
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    try {
      let supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getSetCookie().map(cookie => {
                const [name, ...rest] = cookie.split('=')
                const value = rest.join('=')
                return { name, value }
              })
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => {
                request.cookies.set(name, value)
              })
              const responseHeaders = new Headers()
              cookiesToSet.forEach(({ name, value, options }) => {
                responseHeaders.append('Set-Cookie', serializeCookieHeader(name, value, options))
              })
              return responseHeaders
            },
          },
        }
      )

      const {
        data: { user },
      } = await supabase.auth.getUser()

      // No session - redirect to login
      if (!user) {
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }

      // Fetch user role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const userRole = (profile?.role || 'user') as 'superadmin' | 'admin' | 'user'

      // Check page access based on role
      const allowedPages = ACCESSIBLE_PAGES[userRole] || ACCESSIBLE_PAGES.user

      // Extract base path without query params
      const basePath = pathname.split('?')[0]

      // Check if path is accessible
      const isAccessible = allowedPages.some(page => 
        basePath === page || basePath.startsWith(page + '/')
      )

      if (!isAccessible) {
        console.log(`[v0] Access denied for ${userRole} to ${basePath}`)
        // Redirect to default dashboard for their role
        const defaultDashboard = userRole === 'superadmin' ? '/dashboard/admin' : 
                                 userRole === 'admin' ? '/dashboard/admin' : 
                                 '/dashboard'
        return NextResponse.redirect(new URL(defaultDashboard, request.url))
      }

      return NextResponse.next()
    } catch (error) {
      console.error('[v0] Middleware error:', error)
      // On error, redirect to login for safety
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
