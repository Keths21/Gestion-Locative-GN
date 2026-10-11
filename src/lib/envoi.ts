import { Resend } from 'resend'
import { verifierEnvoi } from './garde-envoi'

/**
 * Transport des notifications — e-mail, SMS et WhatsApp.
 *
 * Seul endroit qui parle aux fournisseurs. Les routes de relance et de
 * quittance gardaient chacune leur propre copie de ce code ; elles passent
 * toutes ici depuis l'audit de sécurité du 11/10/2026, et donc toutes par la
 * garde d'envoi (garde-envoi.ts).
 */

export type Canal = 'email' | 'sms' | 'whatsapp'

export interface ResultatEnvoi {
  canal: Canal
  ok: boolean
  erreur?: string
  /** Refusé par la garde d'envoi (environnement hors production) : pas une panne. */
  bloque?: boolean
  indice?: string
}

function refusParLaGarde(canal: Canal, destinataire: string): ResultatEnvoi | null {
  const verdict = verifierEnvoi(canal, destinataire)
  if (verdict.autorise) return null
  return { canal, ok: false, bloque: true, erreur: verdict.motif, indice: verdict.indice }
}

/* ------------------------------------ SMS --------------------------------- */

async function viaNimbaSms(message: string, telephone: string, expediteur: string) {
  const jeton = process.env.NIMBASMS_AUTH_TOKEN
  if (!jeton) throw new Error('NIMBASMS_AUTH_TOKEN non configuré')

  const res = await fetch('https://api.nimbasms.com/v1/messages', {
    method: 'POST',
    headers: { Authorization: jeton, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender_name: expediteur, to: [telephone], message, channel: 'sms' }),
  })
  return { ok: res.ok, detail: await res.text() }
}

async function viaAfricasTalking(message: string, telephone: string) {
  const username = process.env.AFRICASTALKING_USERNAME
  const apiKey = process.env.AFRICASTALKING_API_KEY
  if (!username || !apiKey) throw new Error("Configuration Africa's Talking manquante")

  const sandbox = process.env.AFRICASTALKING_SANDBOX === 'true'
  const url = sandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging'

  const params: Record<string, string> = { username, to: telephone, message }
  const expediteur = process.env.AFRICASTALKING_SENDER_ID
  if (expediteur) params.from = expediteur

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      apiKey,
    },
    body: new URLSearchParams(params),
  })
  return { ok: res.ok, detail: await res.text() }
}

/**
 * Un SMS coûte par tranche de 160 caractères : les messages doivent rester
 * courts, c'est pourquoi les libellés sont tronqués à l'appel plutôt qu'ici.
 */
export async function envoyerSms(
  telephone: string,
  message: string,
  expediteur = process.env.NIMBASMS_SENDER_NAME ?? 'CasaChams'
): Promise<ResultatEnvoi> {
  const refus = refusParLaGarde('sms', telephone)
  if (refus) return refus

  try {
    const r =
      (process.env.SMS_PROVIDER ?? 'nimbasms') === 'africastalking'
        ? await viaAfricasTalking(message, telephone)
        : await viaNimbaSms(message, telephone, expediteur)
    return { canal: 'sms', ok: r.ok, erreur: r.ok ? undefined : r.detail.slice(0, 200) }
  } catch (e) {
    return { canal: 'sms', ok: false, erreur: e instanceof Error ? e.message : 'Envoi impossible' }
  }
}

/* ---------------------------------- WhatsApp ------------------------------- */

export async function envoyerWhatsapp(telephone: string, texte: string): Promise<ResultatEnvoi> {
  const refus = refusParLaGarde('whatsapp', telephone)
  if (refus) return refus

  try {
    const idNumero = process.env.WHATSAPP_PHONE_NUMBER_ID
    const jeton = process.env.WHATSAPP_ACCESS_TOKEN
    if (!idNumero || !jeton) throw new Error('Configuration WhatsApp manquante')

    const res = await fetch(`https://graph.facebook.com/v19.0/${idNumero}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telephone.replace(/[\s+]/g, ''),
        type: 'text',
        text: { body: texte },
      }),
    })
    return { canal: 'whatsapp', ok: res.ok, erreur: res.ok ? undefined : (await res.text()).slice(0, 200) }
  } catch (e) {
    return { canal: 'whatsapp', ok: false, erreur: e instanceof Error ? e.message : 'Envoi impossible' }
  }
}

/* ----------------------------------- E-mail -------------------------------- */

/**
 * Nom affiché de l'expéditeur. Il vient du nom de l'agence, donc d'une saisie :
 * guillemets, chevrons et retours à la ligne y permettraient de forger l'en-tête
 * From. On les retire et on borne la longueur.
 */
function nomExpediteur(nom: string): string {
  const propre = nom.replace(/["<>\\\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return propre || 'CASA CHAMS'
}

export async function envoyerEmail(params: {
  destinataire: string
  sujet: string
  html: string
  expediteur?: string
}): Promise<ResultatEnvoi> {
  const refus = refusParLaGarde('email', params.destinataire)
  if (refus) return refus

  try {
    const cle = process.env.RESEND_API_KEY
    if (!cle) throw new Error('RESEND_API_KEY non configurée')

    const resend = new Resend(cle)
    const { error } = await resend.emails.send({
      from: `${nomExpediteur(params.expediteur ?? 'CASA CHAMS')} <noreply@casachams.com>`,
      to: params.destinataire,
      // Pas de retour à la ligne dans un en-tête : le sujet porte des noms saisis.
      subject: params.sujet.replace(/[\r\n]+/g, ' ').slice(0, 200),
      html: params.html,
    })
    if (error) return { canal: 'email', ok: false, erreur: error.message }
    return { canal: 'email', ok: true }
  } catch (e) {
    return { canal: 'email', ok: false, erreur: e instanceof Error ? e.message : 'Envoi impossible' }
  }
}
