import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, lireSession, peutEcrireDomaine } from '@/lib/supabase-server'
import { envoyerEmail, envoyerSms, envoyerWhatsapp, type Canal, type ResultatEnvoi } from '@/lib/envoi'
import { echapperHtml } from '@/lib/html'
import { enregistrerEnvoi, verifierLimite } from '@/lib/limite-envois'
import { formatMontant, formatMontantSMS } from '@/lib/utils'
import { DELAI_RELANCE_JOURS } from '@/lib/constants'

/**
 * Relances d'impayés et quittances envoyées aux locataires.
 *
 * Jusqu'à l'audit de sécurité du 11/10/2026, le navigateur envoyait le
 * locataire, ses paiements et l'agence, et la route les recopiait dans le
 * message. Destinataire et contenu étaient donc ceux que l'appelant voulait :
 * n'importe quel utilisateur connecté — un collaborateur en lecture seule
 * compris — pouvait faire partir des SMS, des WhatsApp ou des courriels vers
 * n'importe qui, au nom de l'agence et à ses frais.
 *
 * Désormais le navigateur n'envoie qu'un identifiant. Tout le reste est relu
 * ici, en base, avec la session de l'appelant : la RLS garantit que le
 * locataire est bien le sien, et le message ne contient que ce qu'elle lui
 * laisse voir.
 */

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>

type Agence = {
  nom_agence: string | null
  telephone: string | null
  email: string | null
  adresse: string | null
}

type Destinataire = { nom: string; prenom: string; email: string | null; telephone: string | null }

type Relance = {
  type: 'relance'
  locataire: Destinataire
  paiements: { montant: number; mois_concerne: string }[]
  agence: Agence | null
}

type Quittance = {
  type: 'quittance'
  locataire: Destinataire
  paiement: { montant: number; mois_concerne: string; date_paiement: string | null }
  bien: { nom: string; adresse: string | null; loyer_base: number | null; charges: number | null } | null
  agence: Agence | null
}

/* ------------------------------ Chargement ------------------------------ */

class Refus extends Error {
  constructor(message: string, public statut: number) {
    super(message)
  }
}

async function chargerAgence(supabase: Supabase, organisationId: string): Promise<Agence | null> {
  const { data } = await supabase
    .from('parametres')
    .select('nom_agence, telephone, email, adresse')
    .eq('organisation_id', organisationId)
    .maybeSingle()
  return data
}

async function chargerRelance(supabase: Supabase, organisationId: string, locataireId: string): Promise<Relance> {
  const { data: locataire } = await supabase
    .from('locataires')
    .select('nom, prenom, email, telephone')
    .eq('id', locataireId)
    .eq('organisation_id', organisationId)
    .maybeSingle()
  if (!locataire) throw new Refus('Locataire introuvable.', 404)

  // Même sélection que les pages Relances et Documents : les échéances au
  // statut « impayé », pas celles encore en attente.
  const { data: paiements } = await supabase
    .from('paiements')
    .select('montant, mois_concerne')
    .eq('locataire_id', locataireId)
    .eq('statut', 'impayé')
    .order('mois_concerne')
  if (!paiements?.length) throw new Refus('Aucun impayé pour ce locataire.', 409)

  return {
    type: 'relance',
    locataire,
    paiements: paiements.map((p) => ({ montant: Number(p.montant), mois_concerne: p.mois_concerne })),
    agence: await chargerAgence(supabase, organisationId),
  }
}

async function chargerQuittance(supabase: Supabase, organisationId: string, paiementId: string): Promise<Quittance> {
  const { data: p } = await supabase
    .from('paiements')
    .select('montant, mois_concerne, date_paiement, statut, locataire:locataires(nom, prenom, email, telephone), bien:biens(nom, adresse, loyer_base, charges)')
    .eq('id', paiementId)
    .eq('organisation_id', organisationId)
    .maybeSingle()
  if (!p) throw new Refus('Paiement introuvable.', 404)
  // Une quittance atteste un encaissement : jamais pour une échéance non réglée.
  if (p.statut !== 'payé') throw new Refus('Une quittance ne se délivre que pour un paiement réglé.', 409)

  const locataire = (Array.isArray(p.locataire) ? p.locataire[0] : p.locataire) as Destinataire | null
  if (!locataire) throw new Refus('Locataire introuvable.', 404)
  const bien = (Array.isArray(p.bien) ? p.bien[0] : p.bien) as Quittance['bien']

  return {
    type: 'quittance',
    locataire,
    paiement: { montant: Number(p.montant), mois_concerne: p.mois_concerne, date_paiement: p.date_paiement },
    bien,
    agence: await chargerAgence(supabase, organisationId),
  }
}

/* -------------------------------- Messages ------------------------------- */

// Un nom saisi n'a pas de longueur bornée en base ; dans un message, si.
const court = (s: string | null | undefined, n: number) => (s ?? '').trim().slice(0, n)

function smsRelance(d: Relance): string {
  const agence = court(d.agence?.nom_agence || 'CasaChams', 12)
  const prenom = court(d.locataire.prenom, 12)
  const nom = court(d.locataire.nom, 15)
  const contact = court(d.agence?.telephone, 20) || agence
  const total = d.paiements.reduce((s, p) => s + p.montant, 0)
  const mois = d.paiements.map((p) => `${court(p.mois_concerne, 10)}: ${formatMontantSMS(p.montant)}`).join('\n')

  const detaille = `Avis impaye ${agence}\nBj ${prenom} ${nom}, Impayes:\n${mois}\nTotal: ${formatMontantSMS(total)}\nPayer sous ${DELAI_RELANCE_JOURS}j.\nContact: ${contact}`
  // Un SMS est facturé par tranche de 160 caractères : résumé au-delà.
  const resume = `Avis impaye ${agence}\nBj ${prenom} ${nom}, ${d.paiements.length} mois impayes\nTotal: ${formatMontantSMS(total)}\nPayer sous ${DELAI_RELANCE_JOURS}j.\nContact: ${contact}`
  return detaille.length <= 160 ? detaille : resume
}

function whatsappRelance(d: Relance): string {
  const agence = court(d.agence?.nom_agence || 'Votre Agence', 80)
  const total = d.paiements.reduce((s, p) => s + p.montant, 0)
  const mois = d.paiements.map((p) => `• ${court(p.mois_concerne, 20)} : ${formatMontant(p.montant)}`).join('\n')
  return `*Avis de loyer impayé - ${agence}*\n\nBonjour *${court(d.locataire.prenom, 60)} ${court(d.locataire.nom, 60)}*,\n\nSauf erreur, les loyers suivants restent impayés :\n\n${mois}\n\n*Total dû : ${formatMontant(total)}*\n\nMerci de régulariser votre situation dans les *${DELAI_RELANCE_JOURS} jours*.\n\nPour tout arrangement, contactez-nous :\n${court(d.agence?.telephone, 30) || agence}\n\n_${agence}_`
}

function courrielRelance(d: Relance): { sujet: string; html: string } {
  const agence = echapperHtml(d.agence?.nom_agence || 'Votre Agence Immobilière')
  const total = d.paiements.reduce((s, p) => s + p.montant, 0)
  const lignes = d.paiements.map((p) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #fee2e2">${echapperHtml(p.mois_concerne)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;text-align:right;font-weight:600">${formatMontant(p.montant)}</td>
      </tr>`).join('')

  return {
    sujet: `Rappel : Loyer(s) impayé(s) - ${formatMontant(total)}`,
    html: `
      <!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px">
        <div style="max-width:580px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07)">
          <div style="background:#dc2626;padding:32px;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">Avis de Loyer Impaye</h1>
            <p style="color:#fecaca;margin:8px 0 0">${agence}</p>
          </div>
          <div style="padding:32px">
            <p style="color:#374151;font-size:15px">Bonjour <strong>${echapperHtml(d.locataire.prenom)} ${echapperHtml(d.locataire.nom)}</strong>,</p>
            <p style="color:#6b7280;font-size:14px;line-height:1.6">
              Sauf erreur de notre part, nous constatons que le(s) loyer(s) suivant(s)
              n'ont pas encore été réglés à ce jour. Nous vous remercions de bien vouloir
              régulariser votre situation dans les plus brefs délais.
            </p>
            <table style="width:100%;border-collapse:collapse;margin:24px 0;border-radius:8px;overflow:hidden">
              <thead>
                <tr style="background:#fee2e2">
                  <th style="padding:10px 12px;text-align:left;color:#dc2626;font-size:13px">Mois concerné</th>
                  <th style="padding:10px 12px;text-align:right;color:#dc2626;font-size:13px">Montant dû</th>
                </tr>
              </thead>
              <tbody>${lignes}</tbody>
              <tfoot>
                <tr style="background:#fef2f2">
                  <td style="padding:12px;font-weight:700;color:#dc2626">TOTAL DÛ</td>
                  <td style="padding:12px;text-align:right;font-weight:700;color:#dc2626;font-size:16px">${formatMontant(total)}</td>
                </tr>
              </tfoot>
            </table>
            <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0;color:#92400e;font-size:13px">
                <strong>Important :</strong> Sans réponse de votre part dans les <strong>${DELAI_RELANCE_JOURS} jours</strong>,
                nous serons dans l'obligation d'engager les procédures légales nécessaires.
              </p>
            </div>
            <p style="color:#6b7280;font-size:14px">
              Pour tout renseignement ou arrangement de paiement, n'hésitez pas à nous contacter.
            </p>
          </div>
          <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center">
              ${agence} · ${echapperHtml(d.agence?.adresse)}<br>
              ${d.agence?.telephone ? `${echapperHtml(d.agence.telephone)} · ` : ''}${echapperHtml(d.agence?.email)}
            </p>
          </div>
        </div>
      </body>
      </html>`,
  }
}

function smsQuittance(d: Quittance): string {
  const agence = court(d.agence?.nom_agence || 'CasaChams', 12)
  const contact = court(d.agence?.telephone, 20) || agence
  return `Quittance ${agence}\nBj ${court(d.locataire.prenom, 12)} ${court(d.locataire.nom, 15)}, paiement recu.\nMois: ${court(d.paiement.mois_concerne, 25)} | ${formatMontantSMS(d.paiement.montant)}\nMerci. Contact: ${contact}`
}

function whatsappQuittance(d: Quittance): string {
  const agence = court(d.agence?.nom_agence || 'Votre Agence', 80)
  return `*Quittance de loyer - ${agence}*\n\nBonjour *${court(d.locataire.prenom, 60)} ${court(d.locataire.nom, 60)}*,\n\nNous confirmons la réception de votre paiement :\n\nPériode : ${court(d.paiement.mois_concerne, 40)}\nMontant : *${formatMontant(d.paiement.montant)}*\nBien : ${court(d.bien?.nom, 80) || '-'}\nAdresse : ${court(d.bien?.adresse, 120) || '-'}\n\nMerci de votre confiance.\n\n_${agence}_`
}

function courrielQuittance(d: Quittance): { sujet: string; html: string } {
  const agence = echapperHtml(d.agence?.nom_agence || 'Votre Agence Immobilière')
  const mois = echapperHtml(d.paiement.mois_concerne)
  const fait = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const paye = new Date(d.paiement.date_paiement || Date.now()).toLocaleDateString('fr-FR')

  return {
    sujet: `Quittance de loyer - ${court(d.paiement.mois_concerne, 40)}`,
    html: `
      <!DOCTYPE html>
      <html lang="fr">
      <body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px">
        <div style="max-width:580px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07)">
          <div style="background:#2563eb;padding:32px;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">Quittance de Loyer</h1>
            <p style="color:#bfdbfe;margin:8px 0 0">Mois de ${mois}</p>
          </div>
          <div style="padding:32px">
            <p style="color:#374151">Bonjour <strong>${echapperHtml(d.locataire.prenom)} ${echapperHtml(d.locataire.nom)}</strong>,</p>
            <p style="color:#6b7280;font-size:14px">Nous vous confirmons la réception de votre paiement de loyer pour le mois de <strong>${mois}</strong>.</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0;text-align:center">
              <p style="margin:0;color:#15803d;font-size:14px">Montant reçu</p>
              <p style="margin:8px 0 0;color:#15803d;font-size:28px;font-weight:700">${formatMontant(d.paiement.montant)}</p>
              <p style="margin:4px 0 0;color:#86efac;font-size:12px">Payé le ${paye}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr><td style="padding:6px 0;color:#6b7280">Bien loué</td><td style="text-align:right;font-weight:600">${echapperHtml(d.bien?.nom) || '-'}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Adresse</td><td style="text-align:right">${echapperHtml(d.bien?.adresse) || '-'}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Loyer de base</td><td style="text-align:right">${formatMontant(d.bien?.loyer_base || 0)}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Charges</td><td style="text-align:right">${formatMontant(d.bien?.charges || 0)}</td></tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">Fait le ${fait}</p>
          </div>
          <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:12px">${agence} · ${echapperHtml(d.agence?.telephone)}</p>
          </div>
        </div>
      </body>
      </html>`,
  }
}

/* --------------------------------- Route --------------------------------- */

const corpsRelance = z.object({ locataire_id: z.string().uuid('Identifiant de locataire invalide') })
const corpsQuittance = z.object({ paiement_id: z.string().uuid('Identifiant de paiement invalide') })

const repondre = (statut: number, corps: Record<string, unknown>) => NextResponse.json(corps, { status: statut })

/**
 * Traitement commun aux six routes /api/{email,sms,whatsapp}/{relance,quittance}.
 *
 * Ordre des contrôles : session et droit d'ÉCRITURE sur le locatif (relancer
 * est un acte, pas une lecture), limite de débit, chargement en base, envoi.
 * Les réponses gardent la clé `error` qu'attendent les pages.
 */
export async function traiterEnvoiLocatif(req: Request, canal: Canal, type: 'relance' | 'quittance') {
  try {
    const supabase = await createServerSupabase()
    const session = await lireSession(supabase)
    if (!session) return repondre(401, { error: 'Non authentifié' })
    if (!peutEcrireDomaine(session, 'locatif')) {
      return repondre(403, { error: "Envoyer une relance ou une quittance demande le droit d'écriture sur le locatif." })
    }

    const brut = await req.json().catch(() => null)
    const analyse = type === 'relance' ? corpsRelance.safeParse(brut) : corpsQuittance.safeParse(brut)
    if (!analyse.success) return repondre(422, { error: analyse.error.issues[0]?.message ?? 'Données invalides' })
    const id = 'locataire_id' in analyse.data ? analyse.data.locataire_id : analyse.data.paiement_id

    const reference = { organisationId: session.organisationId, canal, destinataire: `${type}:${id}` }
    const limite = verifierLimite(reference)
    if (!limite.ok) return repondre(429, { error: limite.motif, limite: true })

    const d = type === 'relance'
      ? await chargerRelance(supabase, session.organisationId, id)
      : await chargerQuittance(supabase, session.organisationId, id)

    let resultat: ResultatEnvoi
    if (canal === 'email') {
      if (!d.locataire.email) return repondre(400, { error: 'Adresse email manquante' })
      const { sujet, html } = d.type === 'relance' ? courrielRelance(d) : courrielQuittance(d)
      resultat = await envoyerEmail({
        destinataire: d.locataire.email,
        sujet,
        html,
        expediteur: d.agence?.nom_agence || 'Votre Agence Immobilière',
      })
    } else {
      if (!d.locataire.telephone) return repondre(400, { error: 'Numéro de téléphone manquant' })
      if (canal === 'sms') {
        resultat = await envoyerSms(
          d.locataire.telephone,
          d.type === 'relance' ? smsRelance(d) : smsQuittance(d),
          process.env.NIMBASMS_SENDER_NAME || court(d.agence?.nom_agence || 'CasaChams', 12),
        )
      } else {
        resultat = await envoyerWhatsapp(d.locataire.telephone, d.type === 'relance' ? whatsappRelance(d) : whatsappQuittance(d))
      }
    }

    if (resultat.bloque) return repondre(403, { error: resultat.erreur, indice: resultat.indice, bloque: true })
    if (!resultat.ok) {
      // Le détail du fournisseur part dans les journaux, pas chez l'appelant.
      console.error(`[envoi ${type} ${canal}]`, resultat.erreur)
      return repondre(502, { error: `Échec de l'envoi (${canal}).` })
    }

    enregistrerEnvoi(reference)
    return repondre(200, { success: true })
  } catch (e) {
    if (e instanceof Refus) return repondre(e.statut, { error: e.message })
    console.error(`[envoi ${type} ${canal}]`, e)
    return repondre(500, { error: 'Erreur serveur' })
  }
}
