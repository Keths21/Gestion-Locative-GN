import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const { locataire, paiement, bien, agence } = await req.json()
    const formatGNF = (n: number) => new Intl.NumberFormat('fr-GN', { style: 'currency', currency: 'GNF', maximumFractionDigits: 0 }).format(n)
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px">
        <div style="max-width:580px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07)">
          <div style="background:#2563eb;padding:32px;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">✅ Quittance de Loyer</h1>
            <p style="color:#bfdbfe;margin:8px 0 0">Mois de ${paiement.mois_concerne}</p>
          </div>
          <div style="padding:32px">
            <p style="color:#374151">Bonjour <strong>${locataire.prenom} ${locataire.nom}</strong>,</p>
            <p style="color:#6b7280;font-size:14px">Nous vous confirmons la réception de votre paiement de loyer pour le mois de <strong>${paiement.mois_concerne}</strong>.</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0;text-align:center">
              <p style="margin:0;color:#15803d;font-size:14px">Montant reçu</p>
              <p style="margin:8px 0 0;color:#15803d;font-size:28px;font-weight:700">${formatGNF(paiement.montant)}</p>
              <p style="margin:4px 0 0;color:#86efac;font-size:12px">Payé le ${new Date(paiement.date_paiement).toLocaleDateString('fr-FR')}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr><td style="padding:6px 0;color:#6b7280">Bien loué</td><td style="text-align:right;font-weight:600">${bien?.nom || '-'}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Adresse</td><td style="text-align:right">${bien?.adresse || '-'}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Loyer de base</td><td style="text-align:right">${formatGNF(bien?.loyer_base || 0)}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Charges</td><td style="text-align:right">${formatGNF(bien?.charges || 0)}</td></tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">Fait à Conakry, le ${today}</p>
          </div>
          <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:12px">${agence?.nom_agence || 'Votre Agence'} · ${agence?.telephone || ''}<br><em>GérerSeul Guinée</em></p>
          </div>
        </div>
      </body>
      </html>
    `

    const { data, error } = await resend.emails.send({
      from: `${agence?.nom_agence || 'GérerSeul'} <onboarding@resend.dev>`,
      to: locataire.email,
      subject: `✅ Quittance de loyer - ${paiement.mois_concerne}`,
      html,
    })

    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
