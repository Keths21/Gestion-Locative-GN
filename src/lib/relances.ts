import { DELAI_RELANCE_JOURS } from '@/lib/constants'

export type Canal = 'sms' | 'email'

export type CanalResultat = {
  canal: Canal
  ok: boolean
  error?: string
}

type LocataireLike = {
  id: string
  nom: string
  prenom: string
  email?: string | null
  telephone?: string | null
  derniere_relance?: string | null
}

export type ImpayeGroupe = {
  locataire: LocataireLike
  paiements: unknown[]
  total: number
}

const JOUR_MS = 86_400_000

/**
 * Un locataire est relançable s'il a au moins un canal (email ou téléphone)
 * et n'a pas déjà été relancé dans les DELAI_RELANCE_JOURS derniers jours.
 */
export function estRelancable(loc: LocataireLike): boolean {
  if (!loc.email && !loc.telephone) return false
  if (!loc.derniere_relance) return true
  const jours = (Date.now() - new Date(loc.derniere_relance).getTime()) / JOUR_MS
  return jours >= DELAI_RELANCE_JOURS
}

/**
 * Envoie une relance à un locataire sur TOUS ses canaux disponibles
 * (email s'il a un email, SMS s'il a un téléphone).
 * Retourne le résultat par canal sans jamais throw.
 */
export async function envoyerRelanceMultiCanal(
  item: ImpayeGroupe,
  agence: unknown
): Promise<CanalResultat[]> {
  const { locataire, paiements } = item
  const body = JSON.stringify({ locataire, paiements, agence })
  const headers = { 'Content-Type': 'application/json' }
  const results: CanalResultat[] = []

  if (locataire.email) {
    try {
      const res = await fetch('/api/email/relance', { method: 'POST', headers, body })
      const data = await res.json().catch(() => ({}))
      results.push({
        canal: 'email',
        ok: res.ok && !data?.error,
        error: data?.error?.message || data?.error,
      })
    } catch (e) {
      results.push({ canal: 'email', ok: false, error: (e as Error).message })
    }
  }

  if (locataire.telephone) {
    try {
      const res = await fetch('/api/sms/relance', { method: 'POST', headers, body })
      const data = await res.json().catch(() => ({}))
      results.push({
        canal: 'sms',
        ok: res.ok && !data?.error,
        error: data?.error?.message || data?.error,
      })
    } catch (e) {
      results.push({ canal: 'sms', ok: false, error: (e as Error).message })
    }
  }

  return results
}
