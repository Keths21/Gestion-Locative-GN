import { NextResponse } from 'next/server'
import { createServerSupabase, lireSession } from '@/lib/supabase-server'
import { creerSessionCheckout, prixMensuel, DEVISE } from '@/lib/saspay'
import { enregistrerSession, reconcilier } from '@/lib/abonnement-serveur'

/**
 * Ouvre une session de paiement pour l'organisation de l'appelant.
 *
 * Renvoie l'URL de la page hébergée SASPay, où le client choisit son opérateur.
 */
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createServerSupabase()
  const session = await lireSession(supabase)
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Payer engage l'organisation : seul son propriétaire le décide. Un lecteur
  // invité n'a pas à pouvoir déclencher un débit au nom de l'agence.
  if (session.role !== 'proprietaire') {
    return NextResponse.json(
      { error: "Seul le propriétaire de l'organisation peut régler l'abonnement." },
      { status: 403 },
    )
  }

  let montant: number
  try {
    montant = prixMensuel()
  } catch (e) {
    // Configuration absente : ce n'est pas une panne, et le message doit le dire.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Configuration manquante' },
      { status: 503 },
    )
  }

  // Avant d'en créer une nouvelle, on solde les sessions en attente. Deux
  // raisons : /checkout-sessions/ n'a aucune idempotence, donc un client qui
  // clique deux fois ouvrirait deux paiements ; et s'il a déjà payé sans que le
  // webhook soit passé, il ne doit surtout pas payer une seconde fois.
  try {
    await reconcilier()
  } catch {
    // Une réconciliation impossible ne doit pas empêcher de payer : au pire on
    // crée une session de trop, ce que le client peut abandonner.
  }

  const { data: profil } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', session.userId)
    .single()

  const { data: org } = await supabase
    .from('organisations')
    .select('nom')
    .eq('id', session.organisationId)
    .single()

  const base = process.env.APP_URL || 'https://casachams.com'

  try {
    const s = await creerSessionCheckout({
      montant,
      email: profil?.email ?? '',
      nom: profil?.full_name || org?.nom || 'Client CASA CHAMS',
      description: `CASA CHAMS — abonnement mensuel (${org?.nom ?? 'agence'})`,
      // Le client revient ici : la page relit la session auprès de SASPay et
      // crédite sans attendre le webhook, qui peut tarder ou se perdre.
      returnUrl: `${base}/abonnement?retour=1`,
      // Conservées pour la traçabilité comptable. Elles ne servent PAS à
      // identifier le payeur au retour : une transaction SASPay ne les porte
      // pas, c'est la session qu'on relit.
      metadata: {
        organisation_id: session.organisationId,
        organisation_nom: org?.nom ?? '',
      },
      // Une session qui traîne une journée n'a plus de sens : le client a
      // abandonné, et une session périmée est plus claire qu'une session
      // éternellement ouverte.
      expireLe: new Date(Date.now() + 24 * 3600_000),
    })

    // Enregistré AVANT de rendre l'URL : si le client paie et que nous n'avons
    // pas trace de la session, aucune réconciliation ne pourra le retrouver.
    await enregistrerSession({
      organisationId: session.organisationId,
      sessionId: s.id,
      montant,
      devise: DEVISE,
    })

    return NextResponse.json({ checkout_url: s.checkout_url, session_id: s.id, montant, devise: DEVISE })
  } catch (e) {
    console.error('[abonnement] création de session impossible :', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Création du paiement impossible' },
      { status: 502 },
    )
  }
}
