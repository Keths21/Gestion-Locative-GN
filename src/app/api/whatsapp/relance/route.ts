import { NextResponse } from 'next/server'
import { relanceBodySchema } from '@/lib/schemas'
import { formatMontant } from '@/lib/utils'
import { DELAI_RELANCE_JOURS } from '@/lib/constants'
import { verifierEnvoi, reponseEnvoiBloque } from '@/lib/garde-envoi'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = relanceBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { locataire, paiements, agence } = parsed.data

    if (!locataire.telephone) {
      return NextResponse.json({ error: 'Numéro de téléphone manquant' }, { status: 400 })
    }

    const verdict = verifierEnvoi('whatsapp', locataire.telephone)
    if (!verdict.autorise) return reponseEnvoiBloque(verdict.motif)

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({ error: 'Configuration WhatsApp manquante' }, { status: 500 })
    }

    const agenceNom = agence?.nom_agence || 'Votre Agence'
    const totalDu = paiements.reduce((s, p) => s + p.montant, 0)
    const moisListe = paiements.map((p) => `• ${p.mois_concerne} : ${formatMontant(p.montant)}`).join('\n')
    const to = locataire.telephone.replace(/[\s+]/g, '')

    const messageBody = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: `*Avis de loyer impayé - ${agenceNom}*\n\nBonjour *${locataire.prenom} ${locataire.nom}*,\n\nSauf erreur, les loyers suivants restent impayés :\n\n${moisListe}\n\n*Total dû : ${formatMontant(totalDu)}*\n\nMerci de régulariser votre situation dans les *${DELAI_RELANCE_JOURS} jours*.\n\nPour tout arrangement, contactez-nous :\n${agence?.telephone || agenceNom}\n\n_${agenceNom}_`,
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
