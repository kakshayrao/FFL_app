import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  // Read session cookie set by next-auth
  const hasSession = req.cookies.has('next-auth.session-token') || req.cookies.has('__Secure-next-auth.session-token')

  const isAuthRoute = req.nextUrl.pathname.startsWith('/signin') || req.nextUrl.pathname.startsWith('/signup')
  const isProtected = ['/dashboard', '/team', '/leaderboards', '/rules', '/my-challenges'].some((p) => req.nextUrl.pathname.startsWith(p))

  if (!hasSession && isProtected) {
    const url = new URL('/', req.url)
    return NextResponse.redirect(url)
  }

  if (hasSession && (req.nextUrl.pathname === '/' || isAuthRoute)) {
    const url = new URL('/dashboard', req.url)
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api).*)'],
}



