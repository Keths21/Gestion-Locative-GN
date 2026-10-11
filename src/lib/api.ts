import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export function ok<T>(donnees: T, statut = 200) {
  return NextResponse.json(donnees, { status: statut })
}

export function erreur(message: string, statut = 400) {
  return NextResponse.json({ erreur: message }, { status: statut })
}

/**
 * Réponse d'erreur homogène pour les routes de cartographie.
 *
 * Seules les erreurs de validation remontent telles quelles : elles sont
 * écrites pour l'utilisateur. Le reste — erreur de la base, de configuration,
 * d'un fournisseur — part dans les journaux du serveur, pas dans la réponse :
 * un message de PostgreSQL y révélait des noms de colonnes, de fonctions ou de
 * variables d'environnement (audit de sécurité du 11/10/2026).
 */
export function gerer(e: unknown) {
  if (e instanceof ZodError) {
    return erreur(e.issues[0]?.message ?? 'Données invalides.', 422)
  }
  console.error('[api]', e)
  return erreur('Erreur interne. Réessayez, ou signalez-le si cela persiste.', 500)
}

export function fichier(contenu: string, nom: string, type: string) {
  return new Response(contenu, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${nom}"`,
    },
  })
}
