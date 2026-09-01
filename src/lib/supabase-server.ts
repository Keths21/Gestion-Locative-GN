import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { configSupabaseServeur } from './config-supabase'

/**
 * Client Supabase pour les route handlers.
 *
 * Il porte la session de l'appelant, donc la RLS s'applique : une route n'a
 * jamais à filtrer par organisation elle-même, la base s'en charge. C'est la
 * différence essentielle avec l'ancienne application carto, dont chaque
 * requête devait transporter un `organisation_id` explicite.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()
  const { url, cleAnon } = configSupabaseServeur()

  return createServerClient(
    url,
    cleAnon,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Appelé depuis un Server Component : le proxy rafraîchit
            // déjà la session, on peut ignorer.
          }
        },
      },
    }
  )
}

export type RoleMembreCourant = 'proprietaire' | 'editeur' | 'lecteur'

export type SessionCourante = {
  userId: string
  organisationId: string
  role: RoleMembreCourant
}

/**
 * Session applicative : utilisateur, organisation active et rôle.
 * Renvoie null si l'appelant n'est pas authentifié ou n'appartient à aucune
 * organisation.
 */
export async function lireSession(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>
): Promise<SessionCourante | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membre } = await supabase
    .from('membres')
    .select('organisation_id, role')
    .eq('user_id', user.id)
    .order('cree_le', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membre) return null

  return {
    userId: user.id,
    organisationId: membre.organisation_id,
    role: membre.role as RoleMembreCourant,
  }
}

export function peutEcrire(session: SessionCourante): boolean {
  return session.role === 'proprietaire' || session.role === 'editeur'
}
