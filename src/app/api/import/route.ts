import { createServerSupabase, lireSession, peutEcrire } from '@/lib/supabase-server'
import { enregistrerParcelle, journaliser } from '@/lib/parcelles'
import { parcelleSchema } from '@/lib/schemas'
import { analyserFichier } from '@/lib/import-parcelles'
import { erreur, gerer, ok } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TAILLE_MAX = 10 * 1024 * 1024

/**
 * Import GeoJSON, KML ou GPX.
 *
 * L'analyse est déléguée à lib/import-parcelles, le même module que celui qui
 * alimente l'aperçu dans l'interface : ce qui est montré à l'écran avant
 * confirmation est donc exactement ce que produit cette route. Cette voie
 * reste utile pour un import en ligne de commande ou depuis un script.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase()
    const session = await lireSession(supabase)
    if (!session) return erreur('Non authentifié', 401)
    if (!peutEcrire(session)) return erreur('Rôle lecteur : import interdit.', 403)

    const form = await req.formData()
    const recu = form.get('fichier')
    if (!(recu instanceof File)) return erreur('Aucun fichier reçu.', 400)
    if (recu.size > TAILLE_MAX) return erreur('Fichier trop volumineux (10 Mo maximum).', 413)

    const rapport = analyserFichier(recu.name, await recu.text())
    if (!rapport.parcelles.length) {
      return erreur('Aucune parcelle exploitable dans ce fichier.', 422)
    }

    const crees: string[] = []
    const ignores = rapport.ignores.map((i) => `${i.source} : ${i.motif}`)

    for (const p of rapport.parcelles) {
      try {
        const parcelle = await enregistrerParcelle(
          supabase,
          parcelleSchema.parse({
            nom: p.nom,
            reference: p.reference,
            type: p.type,
            statut: p.statut,
            statut_juridique: p.statut_juridique,
            description: p.description,
            region: p.region,
            prefecture: p.prefecture,
            commune: p.commune,
            quartier: p.quartier,
            adresse: p.adresse,
            geom: p.geom,
            point_geom: p.point_geom,
            superficie_declaree_m2: p.superficie_declaree_m2,
            prix_achat: p.prix_achat,
            valeur_estimee: p.valeur_estimee,
            date_acquisition: p.date_acquisition,
            proprietaire: p.proprietaire,
            occupant: p.occupant,
            contact_telephone: p.contact_telephone,
            source_trace: p.source_trace,
          })
        )
        crees.push(parcelle.id)
      } catch (err) {
        ignores.push(`${p.nom} : ${err instanceof Error ? err.message : 'erreur'}`)
      }
    }

    await journaliser(supabase, null, 'import', {
      fichier: recu.name,
      format: rapport.format,
      crees: crees.length,
    })

    return ok({ format: rapport.format, crees: crees.length, ignores })
  } catch (e) {
    return gerer(e)
  }
}
