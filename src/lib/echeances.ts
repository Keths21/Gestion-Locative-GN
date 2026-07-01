import type { SupabaseClient } from '@supabase/supabase-js'
import { getMoisActuel } from '@/lib/utils'

export type GenerationResult = {
  crees: number   // échéances du mois créées
  promus: number  // en_attente passés en impayé (mois échus)
}

type LocataireRow = {
  id: string
  bien_id: string | null
  date_entree: string | null
  date_sortie: string | null
  bien: { mode_location: string | null; loyer_base: number | null } | null
}

type PaiementRow = {
  id: string
  mois_concerne: string
  bien: { mode_location: string | null } | null
}

// Format d'un mois d'échéance mensuelle : "YYYY-MM" (les locations Airbnb
// utilisent un intervalle "YYYY-MM-DD → YYYY-MM-DD", exclu ici).
const MOIS_MENSUEL = /^\d{4}-\d{2}$/

/**
 * Génère les échéances de loyer manquantes pour le mois courant et met à jour
 * les échéances échues restées "en_attente" en "impayé".
 *
 * - Idempotent : ne crée jamais de doublon pour un couple (locataire, mois).
 * - Ne concerne que les biens en location mensuelle (mode_location = 'appartement').
 * - Montant = loyer_base du bien (hors charges).
 * - S'appuie sur la RLS Supabase : n'agit que sur les données de l'utilisateur.
 */
export async function genererEcheancesMensuelles(
  supabase: SupabaseClient
): Promise<GenerationResult> {
  const moisCourant = getMoisActuel() // "YYYY-MM"
  const today = new Date().toISOString().split('T')[0]

  // 1. Locataires mensuels actifs (pas sortis) entrés au plus tard ce mois-ci
  const { data: locData } = await supabase
    .from('locataires')
    .select('id, bien_id, date_entree, date_sortie, bien:biens(mode_location, loyer_base)')
    .or(`date_sortie.is.null,date_sortie.gt.${today}`)

  const locataires = (locData ?? []) as unknown as LocataireRow[]

  const mensuelsActifs = locataires.filter((l) => {
    if (!l.bien || l.bien.mode_location !== 'appartement') return false
    if (!l.bien_id) return false
    if (!(Number(l.bien.loyer_base) > 0)) return false
    // Le locataire doit être entré au plus tard durant le mois courant
    if (l.date_entree && l.date_entree.slice(0, 7) > moisCourant) return false
    return true
  })

  let crees = 0

  if (mensuelsActifs.length > 0) {
    const locIds = mensuelsActifs.map((l) => l.id)

    // 2. Échéances déjà présentes pour le mois courant (évite les doublons)
    const { data: existants } = await supabase
      .from('paiements')
      .select('locataire_id')
      .in('locataire_id', locIds)
      .eq('mois_concerne', moisCourant)

    const dejaFait = new Set((existants ?? []).map((p) => p.locataire_id))

    // 3. Insertion des échéances manquantes
    const aCreer = mensuelsActifs
      .filter((l) => !dejaFait.has(l.id))
      .map((l) => ({
        locataire_id: l.id,
        bien_id: l.bien_id,
        montant: Number(l.bien!.loyer_base) || 0,
        mois_concerne: moisCourant,
        date_paiement: null,
        statut: 'en_attente',
      }))

    if (aCreer.length > 0) {
      const { data, error } = await supabase.from('paiements').insert(aCreer).select('id')
      if (!error) crees = data?.length || 0
    }
  }

  // 4. Promotion des échéances échues : en_attente d'un mois passé → impayé.
  //    On récupère les candidats puis on filtre les locations mensuelles
  //    (format "YYYY-MM") pour ne pas toucher aux intervalles Airbnb.
  const { data: candData } = await supabase
    .from('paiements')
    .select('id, mois_concerne, bien:biens(mode_location)')
    .eq('statut', 'en_attente')
    .lt('mois_concerne', moisCourant)

  const candidats = (candData ?? []) as unknown as PaiementRow[]

  const idsPromo = candidats
    .filter((p) => p.bien?.mode_location !== 'airbnb' && MOIS_MENSUEL.test(p.mois_concerne))
    .map((p) => p.id)

  let promus = 0
  if (idsPromo.length > 0) {
    const { data } = await supabase
      .from('paiements')
      .update({ statut: 'impayé' })
      .in('id', idsPromo)
      .select('id')
    promus = data?.length || 0
  }

  return { crees, promus }
}
