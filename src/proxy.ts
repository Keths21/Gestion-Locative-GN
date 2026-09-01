import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { configSupabaseServeur } from '@/lib/config-supabase'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const { url: urlSupabase, cleAnon } = configSupabaseServeur()

  const supabase = createServerClient(
    urlSupabase,
    cleAnon,
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
  // Une route d'API doit répondre par un statut, jamais par une redirection :
  // un client fetch() suivrait le 307 et recevrait la page de connexion en
  // HTML au lieu du 401 qu'il attend. C'est ce dont dépend la file de
  // synchronisation hors-ligne pour distinguer « session expirée » de
  // « pas de réseau ».
  const isApiRoute = pathname.startsWith('/api/')

  if (!user) {
    if (isApiRoute) {
      return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 })
    }
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

  // Compte non approuvé : même raison que plus haut, une API répond par un
  // statut plutôt que par une redirection.
  if (status !== 'approved' && isApiRoute) {
    return NextResponse.json(
      { erreur: status === 'rejected' ? 'Compte rejeté' : 'Compte en attente de validation' },
      { status: 403 }
    )
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
    /*
     * Le service worker, le manifeste, les icônes et la page de repli doivent
     * rester joignables sans session : sans cette exclusion, le contrôle
     * d'authentification intercepte /sw.js, le worker ne s'installe jamais, et
     * l'application ne démarre pas hors connexion. Le défaut est invisible
     * tant qu'on teste en ligne.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|hors-ligne|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
