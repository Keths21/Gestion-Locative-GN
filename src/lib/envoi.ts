import { Resend } from 'resend'

/**
 * Transport des notifications — e-mail et SMS.
 *
 * Extrait des routes de relance locative, où il était enfermé dans un
 * traitement propre aux locataires. Le module Travaux en a besoin pour ses
 * alertes d'échéance ; le dupliquer aurait fait vivre deux copies des
 * réglages fournisseur.
 *
 * Les routes de relance existantes n'ont pas été migrées : elles fonctionnent
 * en production, et les toucher ferait courir un risque sans bénéfice
 * immédiat. À reprendre lors d'un passage sur ce code.
 */

export type Canal = 'email' | 'sms'

export interface ResultatEnvoi {
  canal: Canal
  ok: boolean
  erreur?: string
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

/* ----------------------------------- E-mail -------------------------------- */

export async function envoyerEmail(params: {
  destinataire: string
  sujet: string
  html: string
  expediteur?: string
}): Promise<ResultatEnvoi> {
  try {
    const cle = process.env.RESEND_API_KEY
    if (!cle) throw new Error('RESEND_API_KEY non configurée')

    const resend = new Resend(cle)
    const { error } = await resend.emails.send({
      from: `${params.expediteur ?? 'CASA CHAMS'} <noreply@casachams.com>`,
      to: params.destinataire,
      subject: params.sujet,
      html: params.html,
    })
    if (error) return { canal: 'email', ok: false, erreur: error.message }
    return { canal: 'email', ok: true }
  } catch (e) {
    return { canal: 'email', ok: false, erreur: e instanceof Error ? e.message : 'Envoi impossible' }
  }
}
