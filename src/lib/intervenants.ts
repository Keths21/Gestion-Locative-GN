import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Annuaire des artisans et entreprises, et leur affectation aux chantiers.
 *
 * L'annuaire appartient à l'organisation — un maçon travaille sur plusieurs
 * chantiers — tandis que l'affectation est propre à chaque chantier.
 */

type Client = SupabaseClient

export type Metier =
  | 'maconnerie' | 'charpente' | 'couverture' | 'plomberie' | 'electricite'
  | 'menuiserie' | 'peinture' | 'carrelage' | 'terrassement'
  | 'geometre' | 'architecte' | 'bureau_etudes' | 'autre'

export const LIBELLES_METIER: Record<Metier, string> = {
  maconnerie: 'Maçonnerie',
  charpente: 'Charpente',
  couverture: 'Couverture',
  plomberie: 'Plomberie',
  electricite: 'Électricité',
  menuiserie: 'Menuiserie',
  peinture: 'Peinture',
  carrelage: 'Carrelage',
  terrassement: 'Terrassement',
  geometre: 'Géomètre',
  architecte: 'Architecte',
  bureau_etudes: 'Bureau d’études',
  autre: 'Autre',
}

export interface Intervenant {
  id: string
  organisation_id: string
  nom: string
  entreprise: string | null
  metier: Metier
  telephone: string | null
  email: string | null
  adresse: string | null
  rccm: string | null
  nif: string | null
  decennale_numero: string | null
  decennale_assureur: string | null
  decennale_valide_jusqu_au: string | null
  notes: string | null
  cree_le: string
}

export interface Intervention {
  id: string
  chantier_id: string
  intervenant_id: string
  lot: string
  montant_marche: number | null
  date_debut: string | null
  date_fin: string | null
  statut: 'prevu' | 'en_cours' | 'termine' | 'resilie'
  intervenant?: Intervenant
}

export type EtatDecennale = 'valide' | 'expire_bientot' | 'expiree' | 'absente'

/**
 * État de la garantie décennale.
 *
 * C'est la vérification qu'on omet volontiers et qui coûte cher au premier
 * sinistre : une assurance expirée le jour du chantier ne couvre rien, même
 * si elle était valable à la signature.
 */
export function etatDecennale(i: Pick<Intervenant, 'decennale_valide_jusqu_au'>): EtatDecennale {
  if (!i.decennale_valide_jusqu_au) return 'absente'
  const fin = new Date(i.decennale_valide_jusqu_au)
  const maintenant = new Date()
  if (fin < maintenant) return 'expiree'
  const joursRestants = (fin.getTime() - maintenant.getTime()) / 86_400_000
  return joursRestants < 60 ? 'expire_bientot' : 'valide'
}

export const LIBELLES_DECENNALE: Record<EtatDecennale, string> = {
  valide: 'Décennale à jour',
  expire_bientot: 'Décennale expire bientôt',
  expiree: 'Décennale expirée',
  absente: 'Décennale non renseignée',
}

export async function listerIntervenants(sb: Client): Promise<Intervenant[]> {
  const { data, error } = await sb.from('intervenants').select('*').order('nom')
  if (error) throw new Error(error.message)
  return (data ?? []) as Intervenant[]
}

export async function enregistrerIntervenant(
  sb: Client,
  i: Partial<Intervenant> & { nom: string }
): Promise<Intervenant> {
  const { data, error } = await sb.from('intervenants').upsert(i).select('*').single()
  if (error) throw new Error(error.message)
  return data as Intervenant
}

export async function supprimerIntervenant(sb: Client, id: string): Promise<void> {
  const { error } = await sb.from('intervenants').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listerInterventions(sb: Client, chantierId: string): Promise<Intervention[]> {
  const { data, error } = await sb
    .from('interventions')
    .select('*, intervenant:intervenants(*)')
    .eq('chantier_id', chantierId)
  if (error) throw new Error(error.message)
  return (data ?? []) as Intervention[]
}

export async function affecterIntervenant(
  sb: Client,
  intervention: {
    chantier_id: string
    intervenant_id: string
    lot: string
    montant_marche?: number | null
    statut?: Intervention['statut']
  }
): Promise<void> {
  const { error } = await sb.from('interventions').upsert(intervention, {
    onConflict: 'chantier_id,intervenant_id,lot',
  })
  if (error) throw new Error(error.message)
}

export async function retirerIntervention(sb: Client, id: string): Promise<void> {
  const { error } = await sb.from('interventions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
