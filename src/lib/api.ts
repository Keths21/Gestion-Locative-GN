import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export function ok<T>(donnees: T, statut = 200) {
  return NextResponse.json(donnees, { status: statut })
}

export function erreur(message: string, statut = 400) {
  return NextResponse.json({ erreur: message }, { status: statut })
}

/** Réponse d'erreur homogène pour les routes de cartographie. */
export function gerer(e: unknown) {
  if (e instanceof ZodError) {
    return erreur(e.issues[0]?.message ?? 'Données invalides.', 422)
  }
  console.error('[api]', e)
  return erreur(e instanceof Error ? e.message : 'Erreur interne', 500)
}

export function fichier(contenu: string, nom: string, type: string) {
  return new Response(contenu, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${nom}"`,
    },
  })
}
