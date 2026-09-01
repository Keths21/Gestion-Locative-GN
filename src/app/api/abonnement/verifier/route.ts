import { NextResponse } from 'next/server'
import { createServerSupabase, lireSession } from '@/lib/supabase-server'
import { reconcilier } from '@/lib/abonnement-serveur'

/**
 * Relit les sessions en attente de l'appelant et crédite celles qui sont réglées.
 *
 * Appelée par la page d'abonnement au retour depuis SASPay. Le webhook fait le
 * même travail de son côté, et c'est voulu : SASPay redirige le client dès qu'il
 * quitte sa page, sans garantie que la transaction soit confirmée, et son
 * webhook peut arriver avant, après, ou se perdre. Deux chemins valent mieux
 * qu'un — l'idempotence de crediter_abonnement les rend inoffensifs ensemble.
 */
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createServerSupabase()
  const session = await lireSession(supabase)
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  try {
    // reconcilier() balaie les sessions récentes toutes organisations
    // confondues. C'est sans risque : elle ne fait que confirmer auprès de
    // SASPay ce qui a réellement été payé, et crédite l'organisation inscrite
    // sur la session — jamais celle de l'appelant.
    const r = await reconcilier()
    return NextResponse.json(r)
  } catch (e) {
    console.error('[abonnement] vérification impossible :', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Vérification impossible' },
      { status: 503 },
    )
  }
}
