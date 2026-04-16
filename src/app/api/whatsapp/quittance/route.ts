import { NextResponse } from 'next/server'

const formatGNF = (n: number) =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' GNF'

export async function POST(req: Request) {
  try {
    const { locataire, paiement, bien, agence } = await req.json()

    if (!locataire.telephone) {
      return NextResponse.json({ error: 'Numéro de téléphone manquant' }, { status: 400 })
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!
    const agenceNom = agence?.nom_agence || 'CASA CHAMS'

    // Formatage du numéro : supprimer le + et les espaces
    const to = locataire.telephone.replace(/[\s+]/g, '')

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: `✅ *Quittance de loyer - ${agenceNom}*\n\nBonjour *${locataire.prenom} ${locataire.nom}*,\n\nNous confirmons la réception de votre paiement :\n\n📅 Période : ${paiement.mois_concerne}\n💰 Montant : *${formatGNF(paiement.montant)}*\n🏠 Bien : ${bien?.nom || '-'}\n📍 Adresse : ${bien?.adresse || '-'}\n\nMerci de votre confiance.\n\n_${agenceNom}_`,
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
        body: JSON.stringify(body),
      }
    )

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: 400 })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
