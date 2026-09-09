import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, lireSession } from '@/lib/supabase-server'

/**
 * Gestion des collaborateurs d'une organisation.
 *
 * Toutes les opérations passent par la session de l'appelant, jamais par la clé
 * de service : la RLS de `collaborateurs` réserve déjà l'écriture au
 * propriétaire. Une route qui utiliserait la clé de service devrait refaire ce
 * contrôle à la main, et ce serait un second endroit où se tromper.
 */
export const dynamic = 'force-dynamic'

const DROIT = z.enum(['aucun', 'lecture', 'ecriture'])

const corpsInvitation = z.object({
  email: z.string().trim().toLowerCase().email("Adresse électronique invalide"),
  droit_locatif: DROIT.default('aucun'),
  droit_foncier: DROIT.default('aucun'),
  droit_chantiers: DROIT.default('aucun'),
})

const corpsModification = z.object({
  id: z.string().uuid(),
  droit_locatif: DROIT,
  droit_foncier: DROIT,
  droit_chantiers: DROIT,
})

/** Le propriétaire seul gère les collaborateurs. */
async function exigerProprietaire() {
  const supabase = await createServerSupabase()
  const session = await lireSession(supabase)
  if (!session) return { erreur: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }
  if (session.role !== 'proprietaire') {
    return {
      erreur: NextResponse.json(
        { error: "Seul le propriétaire de l'agence peut gérer les collaborateurs." },
        { status: 403 },
      ),
    }
  }
  return { supabase, session }
}

export async function GET() {
  const r = await exigerProprietaire()
  if (r.erreur) return r.erreur

  const { data, error } = await r.supabase!
    .from('collaborateurs')
    .select('id, email, user_id, droit_locatif, droit_foncier, droit_chantiers, cree_le')
    .order('cree_le', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ collaborateurs: data })
}

export async function POST(req: NextRequest) {
  const r = await exigerProprietaire()
  if (r.erreur) return r.erreur

  const parsed = corpsInvitation.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 422 })
  }
  const { email, ...droits } = parsed.data

  // On ne s'invite pas soi-même : le propriétaire a déjà tout, et sa ligne de
  // collaborateur créerait deux sources de vérité sur ses propres droits.
  const { data: moi } = await r.supabase!
    .from('profiles').select('email').eq('id', r.session!.userId).single()
  if (moi?.email?.toLowerCase() === email) {
    return NextResponse.json(
      { error: "Vous êtes déjà propriétaire de cette agence." },
      { status: 422 },
    )
  }

  if (droits.droit_locatif === 'aucun' && droits.droit_foncier === 'aucun' && droits.droit_chantiers === 'aucun') {
    return NextResponse.json(
      { error: 'Accordez au moins un accès, sinon la personne ne verra rien.' },
      { status: 422 },
    )
  }

  const { data, error } = await r.supabase!
    .from('collaborateurs')
    .insert({
      organisation_id: r.session!.organisationId,
      email,
      invite_par: r.session!.userId,
      ...droits,
    })
    .select('id, email, user_id, droit_locatif, droit_foncier, droit_chantiers, cree_le')
    .single()

  if (error) {
    // 23505 : l'index unique sur (organisation_id, lower(email)). Le message
    // brut de Postgres n'apprendrait rien à qui n'en connaît pas les codes.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Cette personne est déjà invitée.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ collaborateur: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const r = await exigerProprietaire()
  if (r.erreur) return r.erreur

  const parsed = corpsModification.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 422 })
  }
  const { id, ...droits } = parsed.data

  const { data, error } = await r.supabase!
    .from('collaborateurs')
    .update(droits)
    .eq('id', id)
    .select('id, email, user_id, droit_locatif, droit_foncier, droit_chantiers, cree_le')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ collaborateur: data })
}

export async function DELETE(req: NextRequest) {
  const r = await exigerProprietaire()
  if (r.erreur) return r.erreur

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Identifiant manquant' }, { status: 400 })

  const { error } = await r.supabase!.from('collaborateurs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supprime: true })
}
