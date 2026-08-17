import { createServerSupabase, lireSession, peutEcrire } from '@/lib/supabase-server'
import { enregistrerParcelle, journaliser } from '@/lib/parcelles'
import { parcelleSchema } from '@/lib/schemas'
import { polygoneEstSimple } from '@/lib/geo'
import { erreur, gerer, ok } from '@/lib/api'
import type { PolygoneGeoJSON } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TAILLE_MAX = 10 * 1024 * 1024

/** Import GeoJSON ou KML : chaque polygone devient une parcelle. */
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

    const texte = await recu.text()
    const entrees = recu.name.toLowerCase().endsWith('.kml')
      ? depuisKml(texte)
      : depuisGeoJson(texte)

    if (!entrees.length) return erreur('Aucun polygone exploitable dans ce fichier.', 422)

    const crees: string[] = []
    const ignores: string[] = []

    for (const e of entrees) {
      if (!polygoneEstSimple(e.geom)) {
        ignores.push(`${e.nom} : tracé auto-sécant`)
        continue
      }
      try {
        const parcelle = await enregistrerParcelle(
          supabase,
          parcelleSchema.parse({
            nom: e.nom,
            source_trace: 'import',
            geom: e.geom,
            description: e.description ?? null,
          })
        )
        crees.push(parcelle.id)
      } catch (err) {
        ignores.push(`${e.nom} : ${err instanceof Error ? err.message : 'erreur'}`)
      }
    }

    await journaliser(supabase, null, 'import', { fichier: recu.name, crees: crees.length })
    return ok({ crees: crees.length, ignores })
  } catch (e) {
    return gerer(e)
  }
}

interface EntreeImport {
  nom: string
  description?: string | null
  geom: PolygoneGeoJSON
}

function depuisGeoJson(texte: string): EntreeImport[] {
  const data = JSON.parse(texte)
  const features = data.type === 'FeatureCollection' ? data.features : [data]
  const sortie: EntreeImport[] = []

  for (const [i, f] of (features as Record<string, never>[]).entries()) {
    const g = (f.geometry ?? f) as { type?: string; coordinates?: unknown }
    const props = (f.properties ?? {}) as Record<string, unknown>
    const nom = String(props.nom ?? props.name ?? props.Name ?? `Parcelle importée ${i + 1}`)

    if (g.type === 'Polygon') {
      sortie.push({
        nom,
        description: (props.description as string) ?? null,
        geom: g as PolygoneGeoJSON,
      })
    } else if (g.type === 'MultiPolygon') {
      // Un multipolygone donne autant de parcelles qu'il a de composantes :
      // le schéma n'accepte qu'un polygone simple par ligne.
      ;(g.coordinates as number[][][][]).forEach((coords, j) => {
        sortie.push({
          nom: `${nom}${j > 0 ? ` (${j + 1})` : ''}`,
          description: (props.description as string) ?? null,
          geom: { type: 'Polygon', coordinates: coords as [number, number][][] },
        })
      })
    }
  }
  return sortie
}

function depuisKml(texte: string): EntreeImport[] {
  const sortie: EntreeImport[] = []
  const placemarks = texte.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? []

  placemarks.forEach((pm, i) => {
    const nom = (pm.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? `Parcelle importée ${i + 1}`)
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .trim()
    const description = (pm.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '')
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .trim()

    const anneaux = pm.match(/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g) ?? []
    for (const bloc of anneaux) {
      const brut = bloc.match(/<coordinates>([\s\S]*?)<\/coordinates>/)?.[1] ?? ''
      const coords = brut
        .trim()
        .split(/\s+/)
        .map((t) => t.split(',').map(Number))
        .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
        .map((c) => [c[0], c[1]] as [number, number])

      if (coords.length >= 3) {
        const [x0, y0] = coords[0]
        const [xn, yn] = coords[coords.length - 1]
        if (x0 !== xn || y0 !== yn) coords.push([x0, y0])
        sortie.push({ nom, description, geom: { type: 'Polygon', coordinates: [coords] } })
      }
    }
  })

  return sortie
}
