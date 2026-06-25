import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  ACCESSIBLE_PAGES,
  getDefaultDashboard,
  isSuperAdmin,
  normalizeUserRole,
} from './lib/rbac'
import { getSupabaseAnonKey, getSupabaseUrl } from './lib/supabase-env'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes that don't require authentication
  const publicRoutes = ['/auth/login', '/auth/signup', '/setup', '/']

  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Protected routes - require authentication
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    try {
      const supabase = createServerClient(
        getSupabaseUrl(),
        getSupabaseAnonKey(),
        {
          cookies: {
            getAll() {
              return request.cookies.getSetCookie().map((cookie) => {
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
                responseHeaders.append(
                  'Set-Cookie',
                  serializeCookieHeader(name, value, options)
                )
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

      const metaRole = (user.user_metadata as { role?: string } | undefined)?.role
      const userRole = normalizeUserRole(profile?.role ?? metaRole)

      console.log(
        '[CodeSpectra] Proxy - User role:',
        userRole,
        'profile:',
        profile?.role,
        'metadata:',
        metaRole
      )

      // Superadmin has unrestricted access
      if (isSuperAdmin(userRole)) {
        console.log('[CodeSpectra] Superadmin access granted to:', pathname)
        return NextResponse.next()
      }

      // Check page access based on role
      const allowedPages = ACCESSIBLE_PAGES[userRole] || ACCESSIBLE_PAGES.user
      const basePath = pathname.split('?')[0]

      const isAccessible = allowedPages.some(
        (page) => basePath === page || basePath.startsWith(page + '/')
      )

      if (!isAccessible) {
        console.log(
          `[CodeSpectra] Access denied for ${userRole} to ${basePath}. Allowed pages:`,
          allowedPages
        )
        // Redirect to default dashboard for their role
        const defaultDashboard = getDefaultDashboard(userRole)
        return NextResponse.redirect(new URL(defaultDashboard, request.url))
      }

      return NextResponse.next()
    } catch (error) {
      console.error('[CodeSpectra] Proxy error:', error)
      // On error, redirect to login for safety
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
