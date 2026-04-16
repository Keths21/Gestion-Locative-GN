import { NextResponse } from 'next/server'

const formatGNF = (n: number) =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' GNF'

export async function POST(req: Request) {
  try {
    const { locataire, paiement, bien, agence } = await req.json()

    if (!locataire.telephone) {
      return NextResponse.json({ error: 'Numéro de téléphone manquant' }, { status: 400 })
    }

    const agenceNom = agence?.nom_agence || 'CASA CHAMS'
    const message = `✅ Quittance de loyer
${agenceNom}

Bonjour ${locataire.prenom} ${locataire.nom},
Paiement reçu pour ${paiement.mois_concerne}.
Montant : ${formatGNF(paiement.montant)}
Bien : ${bien?.nom || '-'}

Merci de votre confiance.
${agenceNom}`

    const username = process.env.AFRICASTALKING_USERNAME!
    const apiKey = process.env.AFRICASTALKING_API_KEY!
    const isSandbox = process.env.AFRICASTALKING_SANDBOX === 'true'

    const url = isSandbox
      ? 'https://api.sandbox.africastalking.com/version1/messaging'
      : 'https://api.africastalking.com/version1/messaging'

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': apiKey,
      },
      body: new URLSearchParams({
        username,
        to: locataire.telephone,
        message,
      }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: 400 })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
