import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const { locataire, paiements, agence } = await req.json()

    const totalDu = paiements.reduce((s: number, p: any) => s + p.montant, 0)
    const formatGNF = (n: number) => new Intl.NumberFormat('fr-GN', { style: 'currency', currency: 'GNF', maximumFractionDigits: 0 }).format(n)

    const lignesPaiements = paiements.map((p: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #fee2e2">${p.mois_concerne}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;text-align:right;font-weight:600">${formatGNF(p.montant)}</td>
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
            <h1 style="color:white;margin:0;font-size:22px">⚠️ Avis de Loyer Impayé</h1>
            <p style="color:#fecaca;margin:8px 0 0">${agence?.nom_agence || 'Votre Agence Immobilière'}</p>
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
                  <td style="padding:12px;text-align:right;font-weight:700;color:#dc2626;font-size:16px">${formatGNF(totalDu)}</td>
                </tr>
              </tfoot>
            </table>

            <!-- Alerte -->
            <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0;color:#92400e;font-size:13px">
                ⏰ <strong>Important :</strong> Sans réponse de votre part dans les <strong>8 jours</strong>, 
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
              ${agence?.nom_agence || 'Votre Agence'} · ${agence?.adresse || 'Conakry, Guinée'}<br>
              📞 ${agence?.telephone || ''} · ✉️ ${agence?.email || ''}<br><br>
              <em>Document généré par GérerSeul Guinée</em>
            </p>
          </div>
        </div>
      </body>
      </html>
    `

    const { data, error } = await resend.emails.send({
      from: `${agence?.nom_agence || 'GérerSeul'} <onboarding@resend.dev>`,
      to: locataire.email,
      subject: `⚠️ Rappel : Loyer(s) impayé(s) - ${formatGNF(totalDu)}`,
      html,
    })

    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
