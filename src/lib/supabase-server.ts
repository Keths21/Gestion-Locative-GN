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

export type Domaine = 'locatif' | 'foncier' | 'chantiers'
export type NiveauDroit = 'aucun' | 'lecture' | 'ecriture'

export type SessionCourante = {
  userId: string
  organisationId: string
  role: RoleMembreCourant
  /** Droits par domaine. Le propriétaire les a tous en écriture. */
  droits: Record<Domaine, NiveauDroit>
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

  // Un seul appel, qui couvre le propriétaire ET le collaborateur invité.
  //
  // Cette fonction ne lisait que `membres`, où un collaborateur ne figure pas :
  // TOUTES les routes d'API lui répondaient 401, pas seulement celles de
  // gestion. Défaut trouvé à l'essai de bout en bout, invisible autrement.
  const { data: acces } = await supabase.rpc('etat_acces').single<{
    organisation_id: string | null
    est_proprietaire: boolean | null
    droit_locatif: NiveauDroit | null
    droit_foncier: NiveauDroit | null
    droit_chantiers: NiveauDroit | null
  }>()

  if (!acces?.organisation_id) return null

  const droits: Record<Domaine, NiveauDroit> = {
    locatif: acces.droit_locatif ?? 'aucun',
    foncier: acces.droit_foncier ?? 'aucun',
    chantiers: acces.droit_chantiers ?? 'aucun',
  }

  // Un collaborateur sans aucun droit est un accès révoqué qu'on n'a pas encore
  // supprimé : il n'a pas de session applicative.
  if (!acces.est_proprietaire && Object.values(droits).every(d => d === 'aucun')) return null

  return {
    userId: user.id,
    organisationId: acces.organisation_id,
    role: acces.est_proprietaire ? 'proprietaire' : 'editeur',
    droits,
  }
}

/**
 * Droit d'écriture. Sans domaine, la question n'a plus de réponse juste depuis
 * que les droits sont découpés : on la réserve donc au propriétaire, et les
 * appelants qui savent de quel domaine ils relèvent utilisent peutEcrireDomaine.
 */
export function peutEcrire(session: SessionCourante): boolean {
  return session.role === 'proprietaire'
}

export function peutEcrireDomaine(session: SessionCourante, domaine: Domaine): boolean {
  return session.droits[domaine] === 'ecriture'
}

export function peutLireDomaine(session: SessionCourante, domaine: Domaine): boolean {
  return session.droits[domaine] !== 'aucun'
}
