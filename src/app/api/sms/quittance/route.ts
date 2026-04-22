import { NextResponse } from 'next/server'
import { quittanceBodySchema } from '@/lib/schemas'
import { formatMontant } from '@/lib/utils'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = quittanceBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { locataire, paiement, bien, agence } = parsed.data

    if (!locataire.telephone) {
      return NextResponse.json({ error: 'Numéro de téléphone manquant' }, { status: 400 })
    }

    const username = process.env.AFRICASTALKING_USERNAME
    const apiKey = process.env.AFRICASTALKING_API_KEY
    if (!username || !apiKey) {
      return NextResponse.json({ error: 'Configuration Africa\'s Talking manquante' }, { status: 500 })
    }

    const agenceNom = agence?.nom_agence || 'Votre Agence'
    const message = `Quittance de loyer
${agenceNom}

Bonjour ${locataire.prenom} ${locataire.nom},
Paiement recu pour ${paiement.mois_concerne}.
Montant : ${formatMontant(paiement.montant)}
Bien : ${bien?.nom || '-'}

Merci de votre confiance.
${agenceNom}`

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
      body: new URLSearchParams({ username, to: locataire.telephone, message }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: 'Échec envoi SMS' }, { status: 400 })
    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
