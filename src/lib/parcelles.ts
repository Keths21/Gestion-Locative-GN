import type { SupabaseClient } from '@supabase/supabase-js'
import type { Parcelle } from '@/types'
import type { EntreeParcelle } from '@/lib/schemas'

/**
 * Accès aux parcelles foncières.
 *
 * Transposition de lib/biens.ts de l'application CartographieBiens, qui
 * écrivait du SQL brut via `pg`. Trois différences structurantes :
 *
 *  - Plus aucun filtre par organisation dans le code : la RLS s'en charge.
 *    Une requête qui « oublierait » le filtre ne fuite donc rien.
 *  - La lecture passe par la vue `v_parcelles`, qui rend la géométrie en
 *    GeoJSON là où la table stocke du PostGIS.
 *  - L'écriture passe par la RPC `enregistrer_parcelle`, qui porte la
 *    conversion GeoJSON → geometry et reste idempotente sur l'identifiant.
 *
 * Toutes les fonctions prennent le client en paramètre : le même code sert
 * côté navigateur (client anonyme + session) et côté route handler (client
 * serveur), sans duplication.
 */

type Client = SupabaseClient

const VUE = 'v_parcelles'

export interface FiltresParcelles {
  recherche?: string
  type?: string
  statut?: string
  statutJuridique?: string
  tag?: string
  /** Inclut les parcelles supprimées. Nécessaire à la synchronisation. */
  inclureSupprimes?: boolean
  /** Ne renvoie que ce qui a changé après cette date ISO. */
  depuis?: string | null
  /** Restreint aux parcelles rattachées à ce bien locatif. */
  bienId?: string
}

export async function listerParcelles(
  sb: Client,
  f: FiltresParcelles = {}
): Promise<Parcelle[]> {
  let q = sb.from(VUE).select('*')

  if (!f.inclureSupprimes) q = q.is('supprime_le', null)
  if (f.depuis) q = q.gt('modifie_le', f.depuis)
  if (f.type) q = q.eq('type', f.type)
  if (f.statut) q = q.eq('statut', f.statut)
  if (f.statutJuridique) q = q.eq('statut_juridique', f.statutJuridique)
  if (f.tag) q = q.contains('tags', [f.tag])
  if (f.bienId) q = q.eq('bien_id', f.bienId)

  if (f.recherche) {
    // Échappe les caractères que PostgREST interprète dans un `or(...)`.
    const motif = `%${f.recherche.replace(/[,()]/g, ' ').trim()}%`
    q = q.or(
      [
        `nom.ilike.${motif}`,
        `reference.ilike.${motif}`,
        `quartier.ilike.${motif}`,
        `commune.ilike.${motif}`,
        `proprietaire.ilike.${motif}`,
      ].join(',')
    )
  }

  const { data, error } = await q.order('modifie_le', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Parcelle[]
}

export async function lireParcelle(sb: Client, id: string): Promise<Parcelle | null> {
  const { data, error } = await sb.from(VUE).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Parcelle) ?? null
}

/**
 * Création ou mise à jour complète. Idempotent sur l'identifiant, ce qui
 * permet au client de générer l'UUID hors-ligne sans risque de doublon à la
 * synchronisation.
 */
export async function enregistrerParcelle(
  sb: Client,
  entree: EntreeParcelle
): Promise<Parcelle> {
  const { data, error } = await sb.rpc('enregistrer_parcelle', { p: entree })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Enregistrement impossible.')
  return data as Parcelle
}

/** Suppression logique : la ligne reste, pour que la synchro puisse la propager. */
export async function supprimerParcelle(sb: Client, id: string): Promise<boolean> {
  const { data, error } = await sb
    .from('parcelles')
    .update({ supprime_le: new Date().toISOString() })
    .eq('id', id)
    .is('supprime_le', null)
    .select('id')

  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

export async function restaurerParcelle(sb: Client, id: string): Promise<boolean> {
  const { data, error } = await sb
    .from('parcelles')
    .update({ supprime_le: null })
    .eq('id', id)
    .select('id')

  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

/** Le journal ne doit jamais faire échouer une écriture métier. */
export async function journaliser(
  sb: Client,
  parcelleId: string | null,
  action: string,
  details?: unknown
): Promise<void> {
  try {
    const { data: { user } } = await sb.auth.getUser()
    await sb.from('journal_parcelles').insert({
      parcelle_id: parcelleId,
      user_id: user?.id ?? null,
      action,
      details: details ?? null,
    })
  } catch {
    /* silencieux par conception */
  }
}

export interface StatistiquesParcelles {
  nombre: number
  superficie_totale_m2: number
  valeur_totale: number
  sans_trace: number
  par_statut: { statut: string; nombre: number; superficie_m2: number }[]
  par_type: { type: string; nombre: number; superficie_m2: number }[]
}

export async function statistiquesParcelles(sb: Client): Promise<StatistiquesParcelles> {
  const { data, error } = await sb.rpc('statistiques_parcelles')
  if (error) throw new Error(error.message)
  return data as StatistiquesParcelles
}

export interface Chevauchement {
  a_id: string
  a_nom: string
  b_id: string
  b_nom: string
  surface_m2: number
}

/** Parcelles qui se superposent : révélateur de litige foncier. */
export async function chevauchementsParcelles(sb: Client): Promise<Chevauchement[]> {
  const { data, error } = await sb.rpc('chevauchements_parcelles')
  if (error) throw new Error(error.message)
  return (data ?? []) as Chevauchement[]
}

/** Biens locatifs proposés au rattachement dans le formulaire de parcelle. */
export async function listerBiensRattachables(
  sb: Client
): Promise<{ id: string; nom: string; adresse: string }[]> {
  const { data, error } = await sb
    .from('biens')
    .select('id, nom, adresse')
    .order('nom', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}
