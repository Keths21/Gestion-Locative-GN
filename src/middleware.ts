import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  const isPublicRoute = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isPendingRoute = pathname.startsWith('/pending-approval')
  const isRejectedRoute = pathname.startsWith('/account-rejected')
  const isAdminRoute = pathname.startsWith('/admin')

  if (!user) {
    if (!isPublicRoute && !isPendingRoute && !isRejectedRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Vérifier le profil de l'utilisateur
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  const status = profile?.status ?? 'pending'
  const role = profile?.role ?? 'user'

  // Rediriger depuis les pages publiques selon le statut
  if (isPublicRoute) {
    const url = request.nextUrl.clone()
    if (status === 'approved') {
      url.pathname = '/dashboard'
    } else if (status === 'rejected') {
      url.pathname = '/account-rejected'
    } else {
      url.pathname = '/pending-approval'
    }
    return NextResponse.redirect(url)
  }

  // Bloquer les utilisateurs en attente
  if (status === 'pending' && !isPendingRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/pending-approval'
    return NextResponse.redirect(url)
  }

  // Bloquer les utilisateurs rejetés
  if (status === 'rejected' && !isRejectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/account-rejected'
    return NextResponse.redirect(url)
  }

  // Bloquer l'accès admin aux non-admins
  if (isAdminRoute && role !== 'admin') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
