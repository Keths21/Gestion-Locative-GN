import { NextResponse } from 'next/server'

/**
 * Garde-fou des envois sortants — courriel, SMS, WhatsApp.
 *
 * Depuis que la recette a sa propre base, elle n'a plus vos vraies données.
 * Mais elle a toujours les mêmes clés Resend, NimbaSMS et Meta : un jeu
 * d'essai contenant un numéro réel, ou une restauration de données faite un
 * peu vite, et une relance de recette part chez un vrai locataire. Le
 * cloisonnement des bases ne protège pas de ça — seul un verrou sur l'envoi
 * lui-même le fait.
 *
 * D'où ce module, par lequel TOUT envoi doit passer.
 *
 * Le verrou est fermé par défaut, et c'est le point important : un
 * environnement qui ne dit rien n'envoie rien. Il faut poser ENVOIS_REELS=true
 * pour ouvrir, ce qui rend l'autorisation d'émettre explicite et vérifiable
 * dans le app.env du serveur. L'inverse — ouvert par défaut, fermé sur demande —
 * ferait qu'un nouvel environnement, un conteneur de secours ou une machine de
 * développement émettrait vers de vrais destinataires par simple omission.
 *
 * En environnement fermé, ENVOIS_LISTE_BLANCHE laisse passer vos propres
 * adresses et numéros, pour pouvoir tester la chaîne complète pour de vrai.
 */

export type CanalEnvoi = 'email' | 'sms' | 'whatsapp'

export type VerdictEnvoi =
  | { autorise: true }
  | { autorise: false; motif: string }

const NOM_CANAL: Record<CanalEnvoi, string> = {
  email: 'Le courriel',
  sms: 'Le SMS',
  whatsapp: 'Le message WhatsApp',
}

function envoisReels(): boolean {
  return process.env.ENVOIS_REELS === 'true'
}

/**
 * Réduit un numéro à ses chiffres pour la comparaison : +224 621 00 00 00,
 * 224621000000 et 00224 621 000 000 désignent le même abonné. On compare
 * ensuite par suffixe, ce qui rend l'indicatif pays facultatif dans la liste.
 */
function chiffres(valeur: string): string {
  return valeur.replace(/\D/g, '').replace(/^0+/, '')
}

function correspond(destinataire: string, entree: string, canal: CanalEnvoi): boolean {
  if (canal === 'email') {
    return destinataire.trim().toLowerCase() === entree.trim().toLowerCase()
  }
  const a = chiffres(destinataire)
  const b = chiffres(entree)
  if (!a || !b) return false
  // Le plus court doit terminer le plus long : 621000000 correspond à
  // 224621000000, mais 1000000 ne correspond pas à 224621000000.
  const [court, long] = a.length <= b.length ? [a, b] : [b, a]
  return court.length >= 8 && long.endsWith(court)
}

function listeBlanche(): string[] {
  return (process.env.ENVOIS_LISTE_BLANCHE ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
}

/**
 * À appeler avant tout envoi, sans exception.
 */
export function verifierEnvoi(canal: CanalEnvoi, destinataire: string): VerdictEnvoi {
  if (envoisReels()) return { autorise: true }

  const liste = listeBlanche()
  if (liste.some((entree) => correspond(destinataire, entree, canal))) {
    return { autorise: true }
  }

  return {
    autorise: false,
    motif:
      `${NOM_CANAL[canal]} n'a pas été envoyé : cet environnement n'émet pas vers ` +
      `de vrais destinataires. Ajoutez l'adresse à ENVOIS_LISTE_BLANCHE pour tester, ` +
      `ou posez ENVOIS_REELS=true s'il s'agit bien de la production.`,
  }
}

/**
 * Réponse HTTP pour un envoi refusé.
 *
 * 403 et non 200 : l'appelant doit pouvoir distinguer « envoyé » de « refusé »
 * sans lire le corps. Le drapeau `bloque` permet à l'interface de traiter ce
 * cas autrement qu'une panne — ce n'en est pas une.
 */
export function reponseEnvoiBloque(motif: string) {
  return NextResponse.json({ error: motif, bloque: true }, { status: 403 })
}
