import { createServerSupabase, lireSession, peutEcrireDomaine } from '@/lib/supabase-server'
import { echeancesAAlerter } from '@/lib/echeancier'
import { envoyerEmail, envoyerSms, type ResultatEnvoi } from '@/lib/envoi'
import { echapperHtml } from '@/lib/html'
import { enregistrerEnvoi, verifierLimite } from '@/lib/limite-envois'
import { erreur, gerer, ok } from '@/lib/api'
import { formatMontant, formatMontantSMS } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Alerte sur les échéances de chantier arrivant à terme.
 *
 * La sélection est faite en base : elle exclut ce qui est déjà soldé et ce
 * qui a été alerté dans les sept derniers jours. Sans cette seconde règle, un
 * appel répété inonderait le destinataire — un rappel qui agace n'est plus lu.
 *
 * L'horodatage n'est posé que sur les échéances réellement notifiées : un
 * échec d'envoi doit pouvoir être retenté.
 *
 * Destinataires : l'e-mail et le téléphone de l'agence, lus dans ses
 * paramètres. Jusqu'au 11/10/2026, ils venaient du corps de la requête — une
 * adresse arbitraire, donc, à qui l'on envoyait l'échéancier de l'agence.
 * L'écran, lui, n'en fournissait aucune : chaque appel finissait en 400.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase()
    const session = await lireSession(supabase)
    if (!session) return erreur('Non authentifié', 401)
    // La route marque les échéances comme alertées : c'est une écriture.
    if (!peutEcrireDomaine(session, 'chantiers')) {
      return erreur("Signaler les échéances demande le droit d'écriture sur les chantiers.", 403)
    }

    const corps = (await req.json().catch(() => ({}))) as { jours?: unknown }
    const demande = Number(corps.jours)
    const jours = Number.isInteger(demande) && demande >= 1 && demande <= 60 ? demande : 3

    const { data: agence } = await supabase
      .from('parametres')
      .select('email, telephone')
      .eq('organisation_id', session.organisationId)
      .maybeSingle()
    if (!agence?.email && !agence?.telephone) {
      return erreur("Renseignez l'e-mail ou le téléphone de l'agence dans Paramètres pour recevoir les alertes.", 409)
    }

    const reference = { organisationId: session.organisationId, canal: 'alerte', destinataire: 'echeances-chantier' }
    const limite = verifierLimite(reference)
    if (!limite.ok) return erreur(limite.motif, 429)

    const echeances = await echeancesAAlerter(supabase, jours)
    if (!echeances.length) {
      return ok({ alertees: 0, message: 'Aucune échéance à signaler.' })
    }

    const total = echeances.reduce((s, e) => s + e.montant, 0)
    const resultats: ResultatEnvoi[] = []

    if (agence.email) {
      const lignes = echeances
        .map(
          (e) => `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${echapperHtml(e.chantier_nom)}<br>
              <span style="color:#6b7280;font-size:12px">${echapperHtml(e.libelle)}</span></td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap">
              ${new Date(e.date_echeance).toLocaleDateString('fr-FR')}
              ${e.jours_restants < 0 ? '<strong style="color:#dc2626"> — en retard</strong>' : ''}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">
              ${formatMontant(e.montant)}</td>
          </tr>`
        )
        .join('')

      resultats.push(
        await envoyerEmail({
          destinataire: agence.email,
          sujet: `Échéances de chantier à régler — ${formatMontant(total)}`,
          html: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
            <body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px">
              <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
                <div style="background:#2563eb;padding:24px;text-align:center">
                  <h1 style="color:#fff;margin:0;font-size:20px">CASA CHAMS</h1>
                  <p style="color:#bfdbfe;margin:6px 0 0;font-size:13px">Suivi de chantier</p>
                </div>
                <div style="padding:24px">
                  <p style="color:#374151">${echeances.length} échéance(s) arrivent à terme sous ${jours} jour(s) :</p>
                  <table style="width:100%;border-collapse:collapse;font-size:14px">${lignes}</table>
                  <p style="margin-top:20px;font-weight:600;color:#111827">
                    Total à régler : ${formatMontant(total)}</p>
                </div>
              </div>
            </body></html>`,
        })
      )
    }

    if (agence.telephone) {
      // Un SMS est facturé par tranche de 160 caractères : on résume au lieu
      // d'énumérer, et on renvoie vers l'application pour le détail.
      const premiere = echeances[0]
      const message =
        echeances.length === 1
          ? `CASA CHAMS: echeance ${premiere.libelle.slice(0, 28)} ` +
            `${formatMontantSMS(premiere.montant)} le ` +
            `${new Date(premiere.date_echeance).toLocaleDateString('fr-FR')}.`
          : `CASA CHAMS: ${echeances.length} echeances chantier a regler, ` +
            `total ${formatMontantSMS(total)}. Detail dans l'application.`

      resultats.push(await envoyerSms(agence.telephone, message))
    }

    // Seules les échéances effectivement notifiées sont marquées : un échec
    // d'envoi doit rester rattrapable au prochain appel.
    const envoiReussi = resultats.some((r) => r.ok)
    if (!envoiReussi) {
      const bloque = resultats.find((r) => r.bloque)
      if (bloque) return erreur(bloque.erreur ?? 'Envoi bloqué sur cet environnement.', 403)
      // Le détail du fournisseur part dans les journaux, pas chez l'appelant.
      console.error('[alerte-echeance]', resultats.map((r) => `${r.canal}: ${r.erreur}`).join(' | '))
      return erreur("Échec de l'envoi de l'alerte.", 502)
    }

    await supabase
      .from('echeances_chantier')
      .update({ alerte_envoyee_le: new Date().toISOString() })
      .in('id', echeances.map((e) => e.id))
    enregistrerEnvoi(reference)

    return ok({
      alertees: echeances.length,
      total,
      canaux: resultats.filter((r) => r.ok).map((r) => r.canal),
    })
  } catch (e) {
    return gerer(e)
  }
}
