import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { configSupabaseServeur } from './config-supabase'
import { lireSessionCheckout, sessionEstPayee } from './saspay'

/**
 * Réconciliation des paiements d'abonnement.
 *
 * Une seule fonction, appelée depuis trois endroits : le webhook SASPay, le
 * retour du client sur le site après paiement, et un éventuel bouton « j'ai
 * payé ». Cette convergence n'est pas une élégance gratuite — elle vient d'une
 * contrainte de leur API.
 *
 * Une transaction SASPay ne porte ni l'identifiant de session ni les
 * métadonnées. Un webhook `transaction.success` ne permet donc PAS de savoir
 * quelle organisation créditer. Le lien n'existe que dans l'autre sens : la
 * session expose sa transaction et son `paid_at`.
 *
 * On ne croit donc jamais le webhook sur parole : on relit nos propres sessions
 * en attente auprès de SASPay. C'est plus lent, et c'est la seule façon d'être
 * juste — un webhook falsifié ou mal interprété ne peut rien ouvrir, puisque
 * l'autorité reste l'API interrogée avec notre clé.
 */

/** Client d'administration : la RLS interdit d'écrire un abonnement, à raison. */
function clientAdmin() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!cle) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY non configurée : la réconciliation des paiements ' +
        'est indisponible sur cet environnement.'
    )
  }
  return createSupabaseClient(configSupabaseServeur().url, cle, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type ResultatReconciliation = {
  examinees: number
  creditees: number
  echouees: number
  erreurs: string[]
}

/**
 * Relit les sessions encore en attente et crédite celles qui sont payées.
 *
 * `sessionId` restreint à une session précise — c'est le cas du retour client,
 * où l'on sait exactement quoi vérifier et où l'on veut une réponse immédiate.
 * Sans lui, on balaie les sessions récentes, ce que fait le webhook.
 *
 * La fenêtre de 48 h borne le balayage : au-delà, une session non réglée est
 * abandonnée, et son `expires_at` l'a de toute façon périmée côté SASPay.
 */
export async function reconcilier(sessionId?: string): Promise<ResultatReconciliation> {
  const admin = clientAdmin()
  const res: ResultatReconciliation = { examinees: 0, creditees: 0, echouees: 0, erreurs: [] }

  let requete = admin
    .from('paiements_abonnement')
    .select('session_id')
    .eq('statut', 'en_attente')

  requete = sessionId
    ? requete.eq('session_id', sessionId)
    : requete.gte('cree_le', new Date(Date.now() - 48 * 3600_000).toISOString())

  const { data: enAttente, error } = await requete
  if (error) throw new Error(`Lecture des sessions en attente : ${error.message}`)

  for (const ligne of enAttente ?? []) {
    res.examinees++
    try {
      const session = await lireSessionCheckout(ligne.session_id)

      if (!sessionEstPayee(session)) continue

      // C'est `crediter_abonnement` qui porte l'idempotence : elle ne prolonge
      // l'accès que si la ligne est encore `en_attente`. Deux réconciliations
      // simultanées — le webhook et le retour client, par exemple — ne peuvent
      // donc pas offrir deux mois.
      const { data, error: err } = await admin.rpc('crediter_abonnement', {
        p_session_id: ligne.session_id,
        p_reference: session.transaction ?? null,
        p_debite: null,
        p_net: null,
        p_frais: null,
        p_charge: session as unknown as Record<string, unknown>,
      })

      if (err) {
        res.echouees++
        res.erreurs.push(`${ligne.session_id} : ${err.message}`)
      } else if ((data as { credite?: boolean } | null)?.credite) {
        res.creditees++
      }
    } catch (e) {
      res.echouees++
      res.erreurs.push(`${ligne.session_id} : ${e instanceof Error ? e.message : 'erreur inconnue'}`)
    }
  }

  return res
}

/** Enregistre une session à peine créée, avant de rediriger le client. */
export async function enregistrerSession(p: {
  organisationId: string
  sessionId: string
  montant: number
  devise: string
}): Promise<void> {
  const admin = clientAdmin()
  const { error } = await admin.from('paiements_abonnement').insert({
    organisation_id: p.organisationId,
    session_id: p.sessionId,
    montant: p.montant,
    devise: p.devise,
  })
  if (error) throw new Error(`Enregistrement de la session : ${error.message}`)
}
