import { NextResponse } from 'next/server'
import { relanceBodySchema } from '@/lib/schemas'
import { formatMontantSMS } from '@/lib/utils'
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
    const agence_nom = (agence?.nom_agence || 'CasaChams').substring(0, 12)
    const prenom = locataire.prenom.substring(0, 12)
    const nom = locataire.nom.substring(0, 15)
    const contact = agence?.telephone || agence_nom

    // Format détaillé (1 ligne par mois)
    const moisListe = paiements.map(p => `${p.mois_concerne}: ${formatMontantSMS(p.montant)}`).join('\n')
    const messageFull = `Avis impaye ${agence_nom}\nBj ${prenom} ${nom}, Impayes:\n${moisListe}\nTotal: ${formatMontantSMS(totalDu)}\nPayer sous ${DELAI_RELANCE_JOURS}j.\nContact: ${contact}`

    // Format résumé si le détaillé dépasse 160 chars
    const messageCompact = `Avis impaye ${agence_nom}\nBj ${prenom} ${nom}, ${paiements.length} mois impayes\nTotal: ${formatMontantSMS(totalDu)}\nPayer sous ${DELAI_RELANCE_JOURS}j.\nContact: ${contact}`

    const message = messageFull.length <= 160 ? messageFull : messageCompact

    const provider = process.env.SMS_PROVIDER || 'africastalking'
    const senderName = process.env.NIMBASMS_SENDER_NAME || agence_nom

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
