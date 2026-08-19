import type { SupabaseClient } from '@supabase/supabase-js'
import type { Chantier } from '@/types'
import type { CorpsEtat } from '@/lib/constants'

/**
 * Accès aux chantiers et à leur budget.
 *
 * Comme pour les parcelles, aucun filtre d'organisation n'apparaît ici : la
 * RLS s'en charge. Elle offre en plus une seconde voie — l'accès explicite
 * accordé à un architecte — que le code n'a pas à connaître.
 */

type Client = SupabaseClient

const VUE = 'v_chantiers'

export interface FiltresChantiers {
  recherche?: string
  statut?: string
  nature?: string
  bienId?: string
  parcelleId?: string
  inclureSupprimes?: boolean
}

export async function listerChantiers(sb: Client, f: FiltresChantiers = {}): Promise<Chantier[]> {
  let q = sb.from(VUE).select('*')
  if (!f.inclureSupprimes) q = q.is('supprime_le', null)
  if (f.statut) q = q.eq('statut', f.statut)
  if (f.nature) q = q.eq('nature', f.nature)
  if (f.bienId) q = q.eq('bien_id', f.bienId)
  if (f.parcelleId) q = q.eq('parcelle_id', f.parcelleId)

  if (f.recherche) {
    const motif = `%${f.recherche.replace(/[,()]/g, ' ').trim()}%`
    q = q.or(
      [`nom.ilike.${motif}`, `reference.ilike.${motif}`, `commune.ilike.${motif}`, `quartier.ilike.${motif}`].join(',')
    )
  }

  const { data, error } = await q.order('modifie_le', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Chantier[]
}

export async function lireChantier(sb: Client, id: string): Promise<Chantier | null> {
  const { data, error } = await sb.from(VUE).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Chantier) ?? null
}

export async function creerChantier(
  sb: Client,
  champs: Partial<Chantier> & { nom: string },
  options: { postesStandard?: boolean } = {}
): Promise<Chantier> {
  const { point_geom, ...reste } = champs
  const charge: Record<string, unknown> = { ...reste }

  // La géométrie ne se transmet pas en GeoJSON à la table : on passe par une
  // écriture SQL du point, comme pour les parcelles.
  const { data, error } = await sb
    .from('chantiers')
    .insert(charge)
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  if (point_geom) await placerChantier(sb, data.id, point_geom.coordinates[0], point_geom.coordinates[1])
  if (options.postesStandard !== false) {
    await sb.rpc('creer_postes_standard', { c: data.id })
  }

  const cree = await lireChantier(sb, data.id)
  if (!cree) throw new Error('Chantier créé mais illisible.')
  return cree
}

export async function modifierChantier(
  sb: Client,
  id: string,
  champs: Partial<Chantier>
): Promise<void> {
  const { point_geom, bien, parcelle, ...reste } = champs as Record<string, unknown> & {
    point_geom?: Chantier['point_geom']
  }
  void bien
  void parcelle

  if (Object.keys(reste).length) {
    const { error } = await sb.from('chantiers').update(reste).eq('id', id)
    if (error) throw new Error(error.message)
  }
  if (point_geom) {
    await placerChantier(sb, id, point_geom.coordinates[0], point_geom.coordinates[1])
  }
}

/** Positionne le repère du chantier — le seul ancrage du journal géolocalisé. */
export async function placerChantier(sb: Client, id: string, lon: number, lat: number): Promise<void> {
  const { error } = await sb.rpc('placer_chantier', { c: id, lon, lat })
  if (error) throw new Error(error.message)
}

export async function supprimerChantier(sb: Client, id: string): Promise<void> {
  const { error } = await sb
    .from('chantiers')
    .update({ supprime_le: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Chantiers voisins d'un point — pour éviter les doublons au moment d'enregistrer une parcelle. */
export async function chantiersProches(
  sb: Client,
  lon: number,
  lat: number,
  rayonM = 200
): Promise<{ id: string; nom: string; distance_m: number }[]> {
  const { data, error } = await sb.rpc('chantiers_proches', { lon, lat, rayon_m: rayonM })
  if (error) throw new Error(error.message)
  return data ?? []
}

/* -------------------------------------------------------------------------- */
/*  Budget                                                                     */
/* -------------------------------------------------------------------------- */

export interface PosteBudget {
  id: string
  corps_etat: CorpsEtat
  libelle: string
  ordre: number
  /** Budget de départ augmenté des avenants acceptés. */
  prevu: number
  base: number
  avenants: number
  /** Devis validés : ce à quoi on s'est engagé, pas ce qu'on a dépensé. */
  engage: number
  /** Factures : ce qui est réellement dû ou payé. */
  realise: number
  paye: number
  ecart: number
}

export interface SyntheseBudget {
  budget_initial: number
  reserve_imprevus: number
  prevu_total: number
  avenants_total: number
  engage_total: number
  realise_total: number
  paye_total: number
  /** Négatif = la réserve est épuisée et le dépassement a commencé. */
  reserve_restante: number
  depassement: number
  depenses_sans_poste: number
  postes: PosteBudget[]
}

export async function syntheseBudget(sb: Client, chantierId: string): Promise<SyntheseBudget> {
  const { data, error } = await sb.rpc('synthese_budget_chantier', { c: chantierId })
  if (error) throw new Error(error.message)
  return data as SyntheseBudget
}

export interface Depense {
  id: string
  chantier_id: string
  poste_id: string | null
  libelle: string
  montant: number
  type: 'devis' | 'facture' | 'avenant'
  statut: 'en_attente' | 'valide' | 'paye' | 'annule'
  reference: string | null
  date_depense: string
  document: string | null
  cree_le: string
}

export async function listerDepenses(sb: Client, chantierId: string): Promise<Depense[]> {
  const { data, error } = await sb
    .from('depenses_chantier')
    .select('*')
    .eq('chantier_id', chantierId)
    .order('date_depense', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Depense[]
}

export async function enregistrerDepense(
  sb: Client,
  depense: Partial<Depense> & { chantier_id: string; libelle: string; montant: number }
): Promise<Depense> {
  const { data, error } = await sb
    .from('depenses_chantier')
    .upsert(depense)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as Depense
}

export async function supprimerDepense(sb: Client, id: string): Promise<void> {
  const { error } = await sb.from('depenses_chantier').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function modifierPoste(
  sb: Client,
  id: string,
  champs: { libelle?: string; montant_prevu?: number; corps_etat?: CorpsEtat }
): Promise<void> {
  const { error } = await sb.from('postes_budget').update(champs).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function ajouterPoste(
  sb: Client,
  chantierId: string,
  poste: { libelle: string; corps_etat: CorpsEtat; montant_prevu?: number; ordre?: number }
): Promise<void> {
  const { error } = await sb.from('postes_budget').insert({ chantier_id: chantierId, ...poste })
  if (error) throw new Error(error.message)
}
