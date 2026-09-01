import { NextRequest, NextResponse } from 'next/server'
import { verifierSignatureWebhook } from '@/lib/saspay'
import { reconcilier } from '@/lib/abonnement-serveur'

/**
 * Webhook SASPay.
 *
 * Cette route est PUBLIQUE — elle doit l'être, SASPay n'a pas de session. Sa
 * seule défense est la signature, d'où le soin qu'on y met.
 *
 * Le corps est lu en TEXTE BRUT et jamais re-sérialisé : la signature porte sur
 * les octets reçus, et un simple espace déplacé par un aller-retour JSON la
 * rendrait invalide.
 *
 * On ne croit pas la charge utile sur parole. Elle déclenche une réconciliation,
 * qui interroge SASPay avec notre propre clé pour savoir ce qui a réellement été
 * payé — voir lib/abonnement-serveur.ts. Une charge falsifiée qui passerait la
 * signature n'ouvrirait donc toujours rien.
 */

// La route doit voir chaque requête : rien à mettre en cache ici.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Leur livraison abandonne au bout de 15 secondes, puis réessaie cinq fois.
  // On répond donc vite, quitte à ce que la réconciliation reste partielle : une
  // réponse tardive vaut un échec, et un échec vaut cinq relances inutiles.
  const corpsBrut = await req.text()

  const verdict = verifierSignatureWebhook(
    corpsBrut,
    req.headers.get('x-webhook-signature'),
    req.headers.get('x-webhook-timestamp'),
  )

  if (!verdict.valide) {
    // 401 et non 400 : ce n'est pas une requête mal formée, c'est une requête
    // dont on ne peut pas établir l'origine. On ne détaille pas au-delà du
    // motif — inutile d'aider qui chercherait à forger une signature.
    console.warn('[saspay] webhook rejeté :', verdict.motif)
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
  }

  let evenement: { event?: string } = {}
  try {
    evenement = JSON.parse(corpsBrut)
  } catch {
    return NextResponse.json({ error: 'Corps illisible' }, { status: 400 })
  }

  const type = evenement.event ?? '(sans type)'

  // `webhook.test` sert à éprouver la configuration depuis leur tableau de bord :
  // on l'accuse sans rien réconcilier.
  if (type === 'webhook.test') {
    return NextResponse.json({ recu: true, type })
  }

  if (!type.startsWith('transaction.')) {
    // Règlements et virements de portefeuille ne nous concernent pas. On répond
    // 200 : un 4xx déclencherait cinq relances pour un événement qu'on ignore
    // volontairement.
    return NextResponse.json({ recu: true, type, traite: false })
  }

  try {
    const r = await reconcilier()
    console.info('[saspay] webhook', type, '→', JSON.stringify(r))
    return NextResponse.json({ recu: true, type, ...r })
  } catch (e) {
    // 500 pour que SASPay réessaie : notre base ou leur API était indisponible,
    // et l'événement mérite une seconde chance.
    console.error('[saspay] réconciliation impossible :', e)
    return NextResponse.json({ error: 'Réconciliation impossible' }, { status: 500 })
  }
}
