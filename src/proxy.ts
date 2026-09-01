import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { configSupabaseServeur } from '@/lib/config-supabase'

export async function proxy(request: NextRequest) {
  // Les rappels de prestataires passent AVANT toute authentification : ils sont
  // émis par un serveur tiers, qui n'a ni session ni cookie. Sans cette sortie,
  // le webhook SASPay recevait 401 à chaque livraison — cinq tentatives, puis
  // abandon, et aucun paiement jamais crédité. Constaté en essai local.
  //
  // Ces routes ne sont pas pour autant ouvertes : leur défense est la signature
  // HMAC vérifiée dans la route elle-même, ce qui est la seule protection
  // possible pour un appelant sans identité.
  if (request.nextUrl.pathname.startsWith('/api/saspay/')) {
    return NextResponse.next({ request })
  }

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
  // Restent joignables quand l'accès a expiré : la page qui explique et permet
  // de payer, et la route qui ouvre le paiement. Bloquer celles-ci enfermerait
  // le client dehors sans moyen de rentrer.
  const isAbonnementRoute =
    pathname.startsWith('/abonnement') || pathname.startsWith('/api/abonnement/')
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

  // Un seul aller-retour pour le rôle, le statut du compte ET l'abonnement.
  // Le proxy s'exécutant à chaque requête, une lecture de plus serait une
  // lecture de plus sur chaque page de chaque utilisateur.
  const { data: acces } = await supabase.rpc('etat_acces').single<{
    role: string | null
    statut_compte: string | null
    organisation_id: string | null
    acces_jusqu_au: string | null
    abonnement_actif: boolean | null
    a_deja_paye: boolean | null
  }>()

  const status = acces?.statut_compte ?? 'pending'
  const role = acces?.role ?? 'user'

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

  // --- Abonnement -----------------------------------------------------------
  //
  // Le contrôle est ici, en un seul endroit, parce que c'est le seul passage
  // obligé : le poser dans les pages laisserait les routes d'API ouvertes, et
  // le poser dans la RLS obligerait à réécrire une trentaine de policies pour
  // un besoin qui n'est pas de la propriété des données mais du droit d'usage.
  //
  // L'administrateur n'est jamais bloqué : c'est vous, et vous devez pouvoir
  // entrer même quand tout le reste est fermé.
  const abonnementExpire = acces?.abonnement_actif === false

  if (abonnementExpire && role !== 'admin' && !isAbonnementRoute) {
    if (isApiRoute) {
      // 402 et non 403 : « il faut payer » n'est pas « vous n'avez pas le
      // droit ». Le drapeau permet à l'interface — et à la file de
      // synchronisation hors-ligne — de traiter ce cas autrement qu'une panne.
      return NextResponse.json(
        { erreur: 'Abonnement expiré', abonnement_expire: true },
        { status: 402 }
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/abonnement'
    url.searchParams.set('expire', '1')
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
