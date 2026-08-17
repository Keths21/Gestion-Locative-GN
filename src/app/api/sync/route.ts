import { createServerSupabase, lireSession, peutEcrire } from '@/lib/supabase-server'
import { enregistrerParcelle, journaliser, listerParcelles, supprimerParcelle } from '@/lib/parcelles'
import { lotSyncSchema, parcelleSchema } from '@/lib/schemas'
import { polygoneEstSimple } from '@/lib/geo'
import { erreur, gerer, ok } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Synchronisation bidirectionnelle.
 *
 *  1. Le client envoie la file de mutations accumulées hors-ligne.
 *  2. Le serveur les applique une par une et renvoie le sort de chacune.
 *  3. Le serveur renvoie ensuite tout ce qui a changé depuis `depuis`,
 *     suppressions comprises, pour que le client rattrape son retard.
 *
 * Résolution de conflit : dernière écriture gagnante. Une mutation refusée
 * revient avec son motif, pour être signalée à l'utilisateur plutôt que
 * perdue en silence.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase()
    const session = await lireSession(supabase)
    if (!session) return erreur('Non authentifié', 401)

    const { mutations, depuis } = lotSyncSchema.parse(await req.json())

    const resultats: {
      id: string
      parcelle_id: string
      etat: 'applique' | 'refuse'
      motif?: string
    }[] = []

    if (!peutEcrire(session)) {
      for (const m of mutations) {
        resultats.push({
          id: m.id,
          parcelle_id: m.parcelle_id,
          etat: 'refuse',
          motif: 'Rôle lecteur : modification interdite.',
        })
      }
    } else {
      for (const m of mutations) {
        try {
          if (m.operation === 'suppression') {
            await supprimerParcelle(supabase, m.parcelle_id)
            await journaliser(supabase, m.parcelle_id, 'suppression', { via: 'sync' })
          } else {
            const entree = parcelleSchema.parse({ ...m.charge, id: m.parcelle_id })
            // Contrôle côté serveur en plus de ST_IsValid : un tracé
            // « papillon » passe la validation PostGIS de justesse mais donne
            // une superficie absurde.
            if (entree.geom && !polygoneEstSimple(entree.geom)) {
              throw new Error('Tracé auto-sécant')
            }
            await enregistrerParcelle(supabase, entree)
            await journaliser(supabase, m.parcelle_id, m.operation, { via: 'sync' })
          }
          resultats.push({ id: m.id, parcelle_id: m.parcelle_id, etat: 'applique' })
        } catch (e) {
          resultats.push({
            id: m.id,
            parcelle_id: m.parcelle_id,
            etat: 'refuse',
            motif: e instanceof Error ? e.message : 'Erreur inconnue',
          })
        }
      }
    }

    const changements = await listerParcelles(supabase, {
      depuis: depuis ?? null,
      inclureSupprimes: true,
    })

    return ok({
      resultats,
      changements,
      serveur_le: new Date().toISOString(),
    })
  } catch (e) {
    return gerer(e)
  }
}
