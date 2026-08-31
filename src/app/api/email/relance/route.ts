import { Resend } from 'resend'
import { NextResponse } from 'next/server'
import { relanceBodySchema } from '@/lib/schemas'
import { formatMontant } from '@/lib/utils'
import { DELAI_RELANCE_JOURS } from '@/lib/constants'
import { verifierEnvoi, reponseEnvoiBloque } from '@/lib/garde-envoi'

// Construit à l'appel, jamais au chargement du module : le constructeur lève
// quand la clé manque, et Next importe cette route pendant la construction pour
// en collecter les métadonnées. Au chargement, l'absence de clé ferait donc
// échouer la construction de l'image — là où un secret d'exécution n'a rien à
// faire. Même façon de procéder que lib/envoi.ts.
function clientResend() {
  const cle = process.env.RESEND_API_KEY
  if (!cle) throw new Error('RESEND_API_KEY non configurée')
  return new Resend(cle)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = relanceBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { locataire, paiements, agence } = parsed.data

    if (!locataire.email) {
      return NextResponse.json({ error: 'Adresse email manquante' }, { status: 400 })
    }

    const verdict = verifierEnvoi('email', locataire.email)
    if (!verdict.autorise) return reponseEnvoiBloque(verdict.motif)

    const totalDu = paiements.reduce((s, p) => s + p.montant, 0)
    const agenceNom = agence?.nom_agence || 'Votre Agence Immobilière'

    const lignesPaiements = paiements.map((p) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #fee2e2">${p.mois_concerne}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;text-align:right;font-weight:600">${formatMontant(p.montant)}</td>
      </tr>
    `).join('')

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px">
        <div style="max-width:580px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07)">

          <!-- Header -->
          <div style="background:#dc2626;padding:32px;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">Avis de Loyer Impaye</h1>
            <p style="color:#fecaca;margin:8px 0 0">${agenceNom}</p>
          </div>

          <!-- Corps -->
          <div style="padding:32px">
            <p style="color:#374151;font-size:15px">Bonjour <strong>${locataire.prenom} ${locataire.nom}</strong>,</p>
            <p style="color:#6b7280;font-size:14px;line-height:1.6">
              Sauf erreur de notre part, nous constatons que le(s) loyer(s) suivant(s)
              n'ont pas encore été réglés à ce jour. Nous vous remercions de bien vouloir
              régulariser votre situation dans les plus brefs délais.
            </p>

            <!-- Tableau impayés -->
            <table style="width:100%;border-collapse:collapse;margin:24px 0;border-radius:8px;overflow:hidden">
              <thead>
                <tr style="background:#fee2e2">
                  <th style="padding:10px 12px;text-align:left;color:#dc2626;font-size:13px">Mois concerné</th>
                  <th style="padding:10px 12px;text-align:right;color:#dc2626;font-size:13px">Montant dû</th>
                </tr>
              </thead>
              <tbody>${lignesPaiements}</tbody>
              <tfoot>
                <tr style="background:#fef2f2">
                  <td style="padding:12px;font-weight:700;color:#dc2626">TOTAL DÛ</td>
                  <td style="padding:12px;text-align:right;font-weight:700;color:#dc2626;font-size:16px">${formatMontant(totalDu)}</td>
                </tr>
              </tfoot>
            </table>

            <!-- Alerte -->
            <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0;color:#92400e;font-size:13px">
                <strong>Important :</strong> Sans réponse de votre part dans les <strong>${DELAI_RELANCE_JOURS} jours</strong>,
                nous serons dans l'obligation d'engager les procédures légales nécessaires.
              </p>
            </div>

            <p style="color:#6b7280;font-size:14px">
              Pour tout renseignement ou arrangement de paiement, n'hésitez pas à nous contacter.
            </p>
          </div>

          <!-- Footer -->
          <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center">
              ${agenceNom} · ${agence?.adresse || ''}<br>
              ${agence?.telephone ? `${agence.telephone} · ` : ''}${agence?.email || ''}
            </p>
          </div>
        </div>
      </body>
      </html>
    `

    const { data, error } = await clientResend().emails.send({
      from: `${agenceNom} <noreply@casachams.com>`,
      to: locataire.email,
      subject: `Rappel : Loyer(s) impayé(s) - ${formatMontant(totalDu)}`,
      html,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
