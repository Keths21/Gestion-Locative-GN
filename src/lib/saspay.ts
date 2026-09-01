import crypto from 'node:crypto'

/**
 * Client SASPay — encaissement des abonnements.
 *
 * Ce module ne tourne QUE côté serveur : il manipule la clé secrète, qui ne doit
 * jamais atteindre le navigateur.
 *
 * ── Deux contraintes de leur API qui dictent la conception ──────────────────
 *
 * 1. `POST /checkout-sessions/` n'a AUCUNE idempotence : deux appels créent deux
 *    sessions. On ne réessaie donc jamais un appel dont on ignore l'issue sans
 *    avoir d'abord relu l'état.
 *
 * 2. Une transaction ne porte NI l'identifiant de session, NI les métadonnées
 *    (vérifié dans leur documentation). À la réception d'un webhook
 *    `transaction.success`, rien ne dit donc à quelle organisation il se
 *    rapporte. Le lien n'existe que dans l'autre sens : la SESSION expose sa
 *    transaction, son `paid_at` et ses métadonnées.
 *
 * D'où le choix central : **le webhook n'est pas la source de vérité, c'est un
 * déclencheur**. Il nous dit « quelque chose a bougé » ; c'est ensuite nous qui
 * relisons nos sessions en attente auprès de SASPay pour savoir laquelle a été
 * payée. Ce détour a un avantage inattendu : le même chemin sert au retour du
 * client sur le site, et à un bouton « j'ai payé » — trois entrées, une seule
 * logique.
 */

const BASE = 'https://api.saspay.me/api/v1'

/** Écart d'horodatage toléré, imposé par leur documentation. */
const TOLERANCE_HORODATAGE_S = 5 * 60

/**
 * Construit à l'appel, jamais au chargement du module : Next importe les routes
 * pendant la construction de l'image, où les secrets d'exécution sont absents.
 * Même façon de procéder que `clientResend()` et `createAdminClient()`.
 */
function cleSecrete(): string {
  const cle = process.env.SASPAY_SECRET_KEY
  if (!cle) {
    throw new Error(
      'SASPAY_SECRET_KEY non configurée : les abonnements sont indisponibles sur ' +
        'cet environnement. La clé se génère depuis app.saspay.me, portée PAYIN.'
    )
  }
  return cle
}

/** Prix mensuel, en unités entières de la devise (GNF n'a pas de centimes). */
export function prixMensuel(): number {
  const brut = process.env.SASPAY_PRIX_MENSUEL
  const n = Number(brut)
  if (!brut || !Number.isFinite(n) || n <= 0) {
    throw new Error('SASPAY_PRIX_MENSUEL absente ou invalide : montant mensuel en GNF attendu.')
  }
  return n
}

export const DEVISE = 'GNF'
export const PAYS = 'GN'

export type SessionCheckout = {
  id: string
  slug?: string
  checkout_url: string
  amount: string
  currency: string
  status?: string
  paid_at?: string | null
  transaction?: string | null
  metadata?: Record<string, unknown> | null
}

async function appeler<T>(chemin: string, init?: RequestInit): Promise<T> {
  const rep = await fetch(`${BASE}${chemin}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cleSecrete()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    // Leur webhook a 15 s de patience ; nos propres appels n'ont aucune raison
    // de traîner davantage, et un appel pendu bloquerait une requête utilisateur.
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })

  const texte = await rep.text()
  let corps: unknown = null
  try {
    corps = texte ? JSON.parse(texte) : null
  } catch {
    // Une réponse non-JSON est une anomalie : on la remonte telle quelle plutôt
    // que de la masquer derrière un message générique.
    throw new Error(`SASPay a répondu ${rep.status} en dehors du JSON : ${texte.slice(0, 200)}`)
  }

  if (!rep.ok) {
    const c = corps as { error?: { detail?: string }; detail?: string } | null
    const detail = c?.error?.detail ?? c?.detail ?? `HTTP ${rep.status}`
    throw new Error(`SASPay : ${detail}`)
  }

  // Leur enveloppe est `{ success, data, code }` sur la plupart des routes, mais
  // pas toutes (le catalogue des pays renvoie un tableau nu). On accepte les deux.
  const enveloppe = corps as { data?: T } | T
  return (enveloppe && typeof enveloppe === 'object' && 'data' in (enveloppe as object)
    ? (enveloppe as { data: T }).data
    : (enveloppe as T))
}

export async function creerSessionCheckout(p: {
  montant: number
  email: string
  nom: string
  telephone?: string
  description: string
  returnUrl: string
  metadata: Record<string, string>
  expireLe: Date
}): Promise<SessionCheckout> {
  return appeler<SessionCheckout>('/checkout-sessions/', {
    method: 'POST',
    body: JSON.stringify({
      // Leur API attend une chaîne décimale. Le GNF n'a pas de subdivision, mais
      // le format reste imposé.
      amount: p.montant.toFixed(2),
      currency: DEVISE,
      country: PAYS,
      customer_email: p.email,
      customer_name: p.nom,
      ...(p.telephone ? { customer_phone: p.telephone } : {}),
      description: p.description,
      return_url: p.returnUrl,
      metadata: p.metadata,
      expires_at: p.expireLe.toISOString(),
    }),
  })
}

export async function lireSessionCheckout(id: string): Promise<SessionCheckout> {
  return appeler<SessionCheckout>(`/checkout-sessions/${id}/`)
}

/**
 * Une session est-elle réglée ?
 *
 * On se fie d'abord à `paid_at`, documenté comme l'horodatage d'achèvement du
 * paiement. Les valeurs de `status` ne sont PAS énumérées dans leur
 * documentation — seul `PENDING` y figure — et deviner une liste fermée
 * reviendrait à refuser un paiement le jour où ils en ajoutent une.
 */
export function sessionEstPayee(s: SessionCheckout): boolean {
  if (s.paid_at) return true
  const statut = (s.status ?? '').toUpperCase()
  return statut === 'PAID' || statut === 'SUCCESS' || statut === 'COMPLETED'
}

/**
 * Vérifie la signature d'un webhook.
 *
 * Trois exigences de leur documentation, et aucune n'est facultative :
 *   - le contenu signé est `"{horodatage}.{corps brut}"` ;
 *   - HMAC-SHA256, hexadécimal minuscule ;
 *   - comparaison à temps constant, et rejet au-delà de 5 minutes d'écart.
 *
 * Le corps doit être celui REÇU, jamais un JSON re-sérialisé : le moindre
 * espace déplacé invalide la signature. C'est pourquoi la route lit
 * `await req.text()` et ne touche pas à `req.json()`.
 */
export function verifierSignatureWebhook(
  corpsBrut: string,
  signature: string | null,
  horodatage: string | null,
): { valide: true } | { valide: false; motif: string } {
  const secret = process.env.SASPAY_WEBHOOK_SECRET
  if (!secret) return { valide: false, motif: 'SASPAY_WEBHOOK_SECRET non configurée' }
  if (!signature) return { valide: false, motif: 'en-tête X-Webhook-Signature absent' }
  if (!horodatage) return { valide: false, motif: 'en-tête X-Webhook-Timestamp absent' }

  const t = Number(horodatage)
  if (!Number.isFinite(t)) return { valide: false, motif: 'horodatage illisible' }

  // Sans cette fenêtre, une requête interceptée resterait rejouable indéfiniment.
  const ecart = Math.abs(Date.now() / 1000 - t)
  if (ecart > TOLERANCE_HORODATAGE_S) {
    return { valide: false, motif: `horodatage hors fenêtre (${Math.round(ecart)} s)` }
  }

  const attendue = crypto
    .createHmac('sha256', secret)
    .update(`${horodatage}.${corpsBrut}`)
    .digest('hex')

  // timingSafeEqual exige des longueurs égales et lève sinon : on compare les
  // tailles d'abord, ce qui ne divulgue rien qu'un attaquant ignore.
  const a = Buffer.from(attendue, 'utf8')
  const b = Buffer.from(signature.toLowerCase(), 'utf8')
  if (a.length !== b.length) return { valide: false, motif: 'signature de longueur inattendue' }
  if (!crypto.timingSafeEqual(a, b)) return { valide: false, motif: 'signature invalide' }

  return { valide: true }
}
