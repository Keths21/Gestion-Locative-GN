import { NextResponse } from 'next/server'

const formatGNF = (n: number) =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' GNF'

export async function POST(req: Request) {
  try {
    const { locataire, paiements, agence } = await req.json()

    if (!locataire.telephone) {
      return NextResponse.json({ error: 'Numéro de téléphone manquant' }, { status: 400 })
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!
    const agenceNom = agence?.nom_agence || 'CASA CHAMS'

    const totalDu = paiements.reduce((s: number, p: any) => s + p.montant, 0)
    const moisListe = paiements.map((p: any) => `• ${p.mois_concerne} : ${formatGNF(p.montant)}`).join('\n')
    const to = locataire.telephone.replace(/[\s+]/g, '')

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: `⚠️ *Avis de loyer impayé - ${agenceNom}*\n\nBonjour *${locataire.prenom} ${locataire.nom}*,\n\nSauf erreur, les loyers suivants restent impayés :\n\n${moisListe}\n\n💰 *Total dû : ${formatGNF(totalDu)}*\n\n⏰ Merci de régulariser votre situation dans les *8 jours*.\n\nPour tout arrangement, contactez-nous :\n📞 ${agence?.telephone || agenceNom}\n\n_${agenceNom}_`,
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
