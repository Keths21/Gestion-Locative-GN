import { NextResponse } from 'next/server'
import { relanceBodySchema } from '@/lib/schemas'
import { formatMontant } from '@/lib/utils'
import { DELAI_RELANCE_JOURS } from '@/lib/constants'

async function sendViaNimbaSMS(message: string, telephone: string, senderName: string) {
  const authToken = process.env.NIMBASMS_AUTH_TOKEN
  if (!authToken) throw new Error('NIMBASMS_AUTH_TOKEN non configuré')

  const res = await fetch('https://api.nimbasms.com/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender_name: senderName,
      to: [telephone],
      message,
      channel: 'sms',
    }),
  })
  const text = await res.text()
  return { ok: res.ok, text }
}

async function sendViaAfricasTalking(message: string, telephone: string) {
  const username = process.env.AFRICASTALKING_USERNAME
  const apiKey = process.env.AFRICASTALKING_API_KEY
  if (!username || !apiKey) throw new Error('Configuration Africa\'s Talking manquante')

  const isSandbox = process.env.AFRICASTALKING_SANDBOX === 'true'
  const senderId = process.env.AFRICASTALKING_SENDER_ID

  const url = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging'

  const params: Record<string, string> = { username, to: telephone, message }
  if (senderId) params.from = senderId

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'apiKey': apiKey,
    },
    body: new URLSearchParams(params),
  })
  const text = await res.text()
  return { ok: res.ok, text }
}

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

    const totalDu = paiements.reduce((s, p) => s + p.montant, 0)
    const agenceNom = agence?.nom_agence || 'Votre Agence'
    const moisListe = paiements.map((p) => `- ${p.mois_concerne} : ${formatMontant(p.montant)}`).join('\n')

    const message = `Avis d'impaye ${agenceNom}

Bonjour ${locataire.prenom} ${locataire.nom},
Loyer(s) impaye(s) :
${moisListe}

Total du : ${formatMontant(totalDu)}

Merci de regulariser sous ${DELAI_RELANCE_JOURS} jours.
Contact : ${agence?.telephone || agenceNom}`

    const provider = process.env.SMS_PROVIDER || 'africastalking'
    const senderName = process.env.NIMBASMS_SENDER_NAME || agenceNom

    const { ok, text } = provider === 'nimbasms'
      ? await sendViaNimbaSMS(message, locataire.telephone, senderName)
      : await sendViaAfricasTalking(message, locataire.telephone)

    if (!ok) return NextResponse.json({ error: 'Échec envoi SMS' }, { status: 400 })

    let data
    try { data = JSON.parse(text) } catch { data = text }
    return NextResponse.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
