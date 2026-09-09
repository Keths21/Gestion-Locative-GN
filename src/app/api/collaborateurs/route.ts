import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createServerSupabase, lireSession } from '@/lib/supabase-server'
import { configSupabaseServeur } from '@/lib/config-supabase'

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
  nom: z.string().trim().max(120).optional(),
  /** Créer le compte tout de suite, avec un mot de passe à transmettre soi-même. */
  creer_compte: z.boolean().default(false),
})

/**
 * Mot de passe provisoire.
 *
 * Tiré au sort plutôt que saisi : un mot de passe choisi à la main pour un tiers
 * finit toujours réutilisé d'un collaborateur à l'autre. L'alphabet écarte les
 * caractères qu'on confond en les recopiant — 0/O, 1/l/I — parce que celui-ci
 * sera lu sur un écran et retapé sur un autre.
 */
function motDePasseProvisoire(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const octets = crypto.randomBytes(14)
  // % alphabet.length introduit un biais négligeable ici (256 n'est pas un
  // multiple de 56), sans conséquence pour un secret à usage unique de 14 signes.
  return Array.from(octets, (o) => alphabet[o % alphabet.length]).join('')
}

/** Client d'administration : seul habilité à créer un compte. */
function clientAdmin() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!cle) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY non configurée : la création de comptes est " +
        'indisponible sur cet environnement.'
    )
  }
  return createSupabaseClient(configSupabaseServeur().url, cle, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

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
  const { email, nom, creer_compte, ...droits } = parsed.data

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

  // L'invitation est posée AVANT le compte, et l'ordre n'est pas indifférent :
  // handle_new_user regarde s'il existe une invitation pour décider s'il crée
  // une agence au nouveau venu. Inversé, le collaborateur recevrait la sienne,
  // vide, et l'application la lui servirait de préférence à la vôtre.
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

  if (!creer_compte) {
    return NextResponse.json({ collaborateur: data }, { status: 201 })
  }

  // --- Création immédiate du compte ------------------------------------------
  //
  // Le mot de passe n'est renvoyé qu'ICI, une seule fois, et n'est stocké nulle
  // part : Supabase n'en garde qu'une empreinte. Le conserver en clair dans la
  // base créerait précisément le risque qu'on cherche à écarter.
  const motDePasse = motDePasseProvisoire()

  try {
    const admin = clientAdmin()

    const { data: cree, error: errCompte } = await admin.auth.admin.createUser({
      email,
      password: motDePasse,
      // Confirmé d'office : la personne doit pouvoir se connecter tout de suite,
      // sans passer par un courriel qu'elle ne recevra peut-être jamais — c'est
      // toute la raison de ce mode.
      email_confirm: true,
      user_metadata: { full_name: nom || email },
    })

    if (errCompte) {
      // Le compte existe déjà : ce n'est pas un échec. L'invitation vient d'être
      // posée, et lier_invitations_collaborateur() la rattachera à sa prochaine
      // connexion. On le dit plutôt que de laisser croire à une erreur.
      const dejaPris = /already|exist|registered/i.test(errCompte.message)
      if (dejaPris) {
        return NextResponse.json(
          {
            collaborateur: data,
            compte_existant: true,
            message:
              'Cette personne avait déjà un compte. Son accès sera actif à sa prochaine connexion, ' +
              'avec son mot de passe habituel.',
          },
          { status: 201 },
        )
      }
      throw new Error(errCompte.message)
    }

    // handle_new_user a créé le profil en statut `pending` : sans cette
    // approbation, le collaborateur se heurterait à l'écran d'attente. C'est
    // vous qui l'invitez — l'approbation est déjà donnée.
    await admin.from('profiles').update({ status: 'approved' }).eq('id', cree.user!.id)

    return NextResponse.json(
      {
        collaborateur: { ...data, user_id: cree.user!.id },
        compte_cree: true,
        mot_de_passe: motDePasse,
      },
      { status: 201 },
    )
  } catch (e) {
    // L'invitation, elle, est bien enregistrée : on ne la défait pas. La
    // personne pourra s'inscrire d'elle-même et sera rattachée.
    console.error('[collaborateurs] création de compte impossible :', e)
    return NextResponse.json(
      {
        collaborateur: data,
        compte_cree: false,
        message:
          "L'accès est enregistré, mais le compte n'a pas pu être créé : " +
          (e instanceof Error ? e.message : 'erreur inconnue') +
          ". La personne peut s'inscrire elle-même avec cette adresse.",
      },
      { status: 201 },
    )
  }
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
