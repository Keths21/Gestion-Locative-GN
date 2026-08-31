import { NextResponse } from 'next/server'
import { quittanceBodySchema } from '@/lib/schemas'
import { formatMontant } from '@/lib/utils'
import { verifierEnvoi, reponseEnvoiBloque } from '@/lib/garde-envoi'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = quittanceBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { locataire, paiement, bien, agence } = parsed.data

    const verdict = locataire.telephone
      ? verifierEnvoi('whatsapp', locataire.telephone)
      : { autorise: true as const }
    if (!verdict.autorise) return reponseEnvoiBloque(verdict)

    if (!locataire.telephone) {
      return NextResponse.json({ error: 'Numéro de téléphone manquant' }, { status: 400 })
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({ error: 'Configuration WhatsApp manquante' }, { status: 500 })
    }

    const agenceNom = agence?.nom_agence || 'Votre Agence'
    const to = locataire.telephone.replace(/[\s+]/g, '')

    const messageBody = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: `*Quittance de loyer - ${agenceNom}*\n\nBonjour *${locataire.prenom} ${locataire.nom}*,\n\nNous confirmons la réception de votre paiement :\n\nPériode : ${paiement.mois_concerne}\nMontant : *${formatMontant(paiement.montant)}*\nBien : ${bien?.nom || '-'}\nAdresse : ${bien?.adresse || '-'}\n\nMerci de votre confiance.\n\n_${agenceNom}_`,
      },
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageBody),
      }
    )

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: 'Échec envoi WhatsApp' }, { status: 400 })
    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
