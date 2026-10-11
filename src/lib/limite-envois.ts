/**
 * Limite de débit des envois sortants — SMS, WhatsApp, courriel.
 *
 * Chaque envoi est facturé, et part au nom de l'agence. Avant l'audit du
 * 11/10/2026, rien ne bornait leur nombre : une boucle côté navigateur, ou un
 * collaborateur mal intentionné, pouvait en émettre des milliers. Deux
 * garde-fous, par organisation :
 *
 *  - un délai entre deux envois au même destinataire sur le même canal. Il
 *    absorbe le double clic et la boucle, sans gêner l'usage normal : on ne
 *    relance pas deux fois le même locataire en dix minutes ;
 *  - un plafond quotidien par canal, très au-dessus d'une relance générale
 *    (un envoi par locataire), et très en dessous d'un abus.
 *
 * L'état vit en mémoire du processus. C'est suffisant ici : un seul conteneur
 * sert chaque environnement, et un redéploiement qui remet les compteurs à
 * zéro ne change rien à l'ordre de grandeur. Il s'agit de borner un abus, pas
 * de facturer.
 *
 * Seuls les envois RÉUSSIS sont comptés (enregistrerEnvoi après coup) : un
 * envoi bloqué par la garde de recette, ou refusé par le fournisseur, doit
 * pouvoir être retenté sans attendre.
 */

const DELAI_MEME_DESTINATAIRE_MS = 10 * 60_000
const PLAFOND_QUOTIDIEN = 200

const derniersEnvois = new Map<string, number>()
const compteursDuJour = new Map<string, { jour: string; n: number }>()

const aujourdhui = () => new Date().toISOString().slice(0, 10)

/** Purge les entrées périmées, pour que la mémoire ne croisse pas sans fin. */
function purger(maintenant: number) {
  if (derniersEnvois.size < 1000) return
  for (const [cle, t] of derniersEnvois) {
    if (maintenant - t > DELAI_MEME_DESTINATAIRE_MS) derniersEnvois.delete(cle)
  }
  const jour = aujourdhui()
  for (const [cle, c] of compteursDuJour) {
    if (c.jour !== jour) compteursDuJour.delete(cle)
  }
}

export type ReferenceEnvoi = {
  organisationId: string
  canal: string
  /** Ce qui identifie le destinataire : un locataire, une agence… */
  destinataire: string
}

export function verifierLimite(r: ReferenceEnvoi): { ok: true } | { ok: false; motif: string } {
  const maintenant = Date.now()
  purger(maintenant)

  const dernier = derniersEnvois.get(`${r.organisationId}|${r.canal}|${r.destinataire}`)
  if (dernier && maintenant - dernier < DELAI_MEME_DESTINATAIRE_MS) {
    const minutes = Math.ceil((DELAI_MEME_DESTINATAIRE_MS - (maintenant - dernier)) / 60_000)
    return { ok: false, motif: `Un envoi vient déjà de partir vers ce destinataire. Réessayez dans ${minutes} min.` }
  }

  const compteur = compteursDuJour.get(`${r.organisationId}|${r.canal}`)
  if (compteur && compteur.jour === aujourdhui() && compteur.n >= PLAFOND_QUOTIDIEN) {
    return { ok: false, motif: `Plafond de ${PLAFOND_QUOTIDIEN} envois par jour atteint sur ce canal.` }
  }

  return { ok: true }
}

export function enregistrerEnvoi(r: ReferenceEnvoi) {
  derniersEnvois.set(`${r.organisationId}|${r.canal}|${r.destinataire}`, Date.now())
  const cle = `${r.organisationId}|${r.canal}`
  const jour = aujourdhui()
  const c = compteursDuJour.get(cle)
  compteursDuJour.set(cle, c && c.jour === jour ? { jour, n: c.n + 1 } : { jour, n: 1 })
}
