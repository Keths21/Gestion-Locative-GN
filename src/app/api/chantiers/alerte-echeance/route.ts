import { createServerSupabase, lireSession } from '@/lib/supabase-server'
import { echeancesAAlerter } from '@/lib/echeancier'
import { envoyerEmail, envoyerSms, type ResultatEnvoi } from '@/lib/envoi'
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
 */
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase()
    const session = await lireSession(supabase)
    if (!session) return erreur('Non authentifié', 401)

    const corps = (await req.json().catch(() => ({}))) as {
      jours?: number
      email?: string
      telephone?: string
    }
    const jours = Number.isFinite(corps.jours) ? Number(corps.jours) : 3

    if (!corps.email && !corps.telephone) {
      return erreur('Indiquez au moins une adresse e-mail ou un numéro de téléphone.', 400)
    }

    const echeances = await echeancesAAlerter(supabase, jours)
    if (!echeances.length) {
      return ok({ alertees: 0, message: 'Aucune échéance à signaler.' })
    }

    const total = echeances.reduce((s, e) => s + e.montant, 0)
    const resultats: ResultatEnvoi[] = []

    if (corps.email) {
      const lignes = echeances
        .map(
          (e) => `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${e.chantier_nom}<br>
              <span style="color:#6b7280;font-size:12px">${e.libelle}</span></td>
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
          destinataire: corps.email,
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

    if (corps.telephone) {
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

      resultats.push(await envoyerSms(corps.telephone, message))
    }

    // Seules les échéances effectivement notifiées sont marquées : un échec
    // d'envoi doit rester rattrapable au prochain appel.
    const envoiReussi = resultats.some((r) => r.ok)
    if (envoiReussi) {
      await supabase
        .from('echeances_chantier')
        .update({ alerte_envoyee_le: new Date().toISOString() })
        .in('id', echeances.map((e) => e.id))
    }

    return ok({
      alertees: envoiReussi ? echeances.length : 0,
      total,
      resultats,
    })
  } catch (e) {
    return gerer(e)
  }
}
