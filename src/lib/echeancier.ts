import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Échéancier de paiement d'un chantier.
 *
 * Une échéance peut être calendaire, ou conditionnée par la validation d'un
 * jalon : dans ce second cas elle reste « prévue » et devient « exigible »
 * au moment où l'ouvrage correspondant est réceptionné. C'est ce qui relie
 * l'avancement réel au décaissement.
 */

type Client = SupabaseClient

export type StatutEcheance = 'prevue' | 'exigible' | 'payee' | 'annulee'

export const LIBELLES_STATUT_ECHEANCE: Record<StatutEcheance, string> = {
  prevue: 'Prévue',
  exigible: 'Exigible',
  payee: 'Payée',
  annulee: 'Annulée',
}

export interface Echeance {
  id: string
  libelle: string
  montant: number
  montant_paye: number
  date_echeance: string
  statut: StatutEcheance
  date_paiement: string | null
  intervenant_nom: string | null
  jalon_nom: string | null
  /** Conditionnée par un jalon qui n'est pas encore validé. */
  bloquee_par_jalon: boolean
  en_retard: boolean
  alerte_envoyee_le: string | null
}

export interface SyntheseEcheancier {
  total_prevu: number
  total_paye: number
  reste_a_payer: number
  exigible_maintenant: number
  en_retard_nombre: number
  a_venir_7j: number
  echeances: Echeance[]
}

export async function syntheseEcheancier(sb: Client, chantierId: string): Promise<SyntheseEcheancier> {
  const { data, error } = await sb.rpc('synthese_echeancier_chantier', { c: chantierId })
  if (error) throw new Error(error.message)
  return data as SyntheseEcheancier
}

export async function ajouterEcheance(
  sb: Client,
  e: {
    chantier_id: string
    libelle: string
    montant: number
    date_echeance: string
    jalon_id?: string | null
    intervenant_id?: string | null
  }
): Promise<void> {
  const { error } = await sb.from('echeances_chantier').insert(e)
  if (error) throw new Error(error.message)
}

/** Enregistre un versement, total ou partiel. */
export async function enregistrerVersement(
  sb: Client,
  id: string,
  montantPaye: number,
  montantTotal: number
): Promise<void> {
  const { error } = await sb
    .from('echeances_chantier')
    .update({
      montant_paye: montantPaye,
      statut: montantPaye >= montantTotal ? 'payee' : 'exigible',
      date_paiement: montantPaye > 0 ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function supprimerEcheance(sb: Client, id: string): Promise<void> {
  const { error } = await sb.from('echeances_chantier').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export interface EcheanceAAlerter {
  id: string
  chantier_id: string
  chantier_nom: string
  libelle: string
  montant: number
  date_echeance: string
  jours_restants: number
}

/** Échéances dues sous `jours` et non encore alertées récemment. */
export async function echeancesAAlerter(sb: Client, jours = 3): Promise<EcheanceAAlerter[]> {
  const { data, error } = await sb.rpc('echeances_a_alerter', { jours })
  if (error) throw new Error(error.message)
  return (data ?? []) as EcheanceAAlerter[]
}
