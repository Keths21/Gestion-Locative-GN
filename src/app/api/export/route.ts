import { createServerSupabase, lireSession } from '@/lib/supabase-server'
import { listerParcelles } from '@/lib/parcelles'
import { echapperXml } from '@/lib/geo'
import { erreur, fichier, gerer } from '@/lib/api'
import type { Parcelle } from '@/types'
import {
  LIBELLES_JURIDIQUE,
  LIBELLES_STATUT_PARCELLE,
  LIBELLES_TYPE_PARCELLE,
} from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Export du portefeuille foncier en GeoJSON, KML ou CSV. */
export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabase()
    const session = await lireSession(supabase)
    if (!session) return erreur('Non authentifié', 401)

    const u = new URL(req.url)
    const format = (u.searchParams.get('format') ?? 'geojson').toLowerCase()
    const parcelles = await listerParcelles(supabase, {
      recherche: u.searchParams.get('q') ?? undefined,
    })
    const horodatage = new Date().toISOString().slice(0, 10)

    if (format === 'geojson') {
      const fc = {
        type: 'FeatureCollection',
        features: parcelles
          .filter((p) => p.geom || p.point_geom)
          .map((p) => ({
            type: 'Feature',
            id: p.id,
            geometry: p.geom ?? p.point_geom,
            properties: proprietes(p),
          })),
      }
      return fichier(
        JSON.stringify(fc, null, 2),
        `parcelles-${horodatage}.geojson`,
        'application/geo+json'
      )
    }

    if (format === 'kml') {
      return fichier(
        versKml(parcelles),
        `parcelles-${horodatage}.kml`,
        'application/vnd.google-earth.kml+xml'
      )
    }

    if (format === 'csv') {
      // BOM en tête : sans lui Excel lit le fichier en latin-1 et massacre
      // les accents.
      return fichier('﻿' + versCsv(parcelles), `parcelles-${horodatage}.csv`, 'text/csv; charset=utf-8')
    }

    return erreur('Format inconnu. Utilisez geojson, kml ou csv.', 400)
  } catch (e) {
    return gerer(e)
  }
}

function proprietes(p: Parcelle) {
  return {
    nom: p.nom,
    reference: p.reference,
    type: LIBELLES_TYPE_PARCELLE[p.type],
    statut: LIBELLES_STATUT_PARCELLE[p.statut],
    statut_juridique: LIBELLES_JURIDIQUE[p.statut_juridique],
    superficie_m2: p.superficie_m2 ? Math.round(p.superficie_m2) : null,
    superficie_ha: p.superficie_m2 ? Number((p.superficie_m2 / 10000).toFixed(4)) : null,
    perimetre_m: p.perimetre_m ? Math.round(p.perimetre_m) : null,
    superficie_declaree_m2: p.superficie_declaree_m2,
    proprietaire: p.proprietaire,
    occupant: p.occupant,
    pays: p.pays,
    region: p.region,
    prefecture: p.prefecture,
    commune: p.commune,
    quartier: p.quartier,
    adresse: p.adresse,
    prix_achat: p.prix_achat,
    valeur_estimee: p.valeur_estimee,
    devise: p.devise,
    date_acquisition: p.date_acquisition,
    description: p.description,
    tags: (p.tags ?? []).join(', '),
  }
}

function versKml(parcelles: Parcelle[]): string {
  const styles = [...new Set(parcelles.map((p) => p.couleur))]
    .map((c) => {
      // KML attend la couleur en aabbggrr, l'inverse de l'hexadécimal web.
      const hex = c.replace('#', '')
      const abgr = `7f${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`
      const ligne = `ff${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`
      return `    <Style id="s${hex}">
      <LineStyle><color>${ligne}</color><width>2</width></LineStyle>
      <PolyStyle><color>${abgr}</color></PolyStyle>
    </Style>`
    })
    .join('\n')

  const placemarks = parcelles
    .map((p) => {
      const geo = p.geom
        ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${p.geom.coordinates[0]
            .map(([lon, lat]) => `${lon},${lat},0`)
            .join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
        : p.point_geom
          ? `<Point><coordinates>${p.point_geom.coordinates[0]},${p.point_geom.coordinates[1]},0</coordinates></Point>`
          : null
      if (!geo) return ''

      const props = proprietes(p)
      const description = Object.entries(props)
        .filter(([, v]) => v !== null && v !== '' && v !== undefined)
        .map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v}`)
        .join('\n')

      return `    <Placemark>
      <name>${echapperXml(p.nom)}</name>
      <description>${echapperXml(description)}</description>
      <styleUrl>#s${p.couleur.replace('#', '')}</styleUrl>
      ${geo}
    </Placemark>`
    })
    .filter(Boolean)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Parcelles foncières</name>
${styles}
${placemarks}
  </Document>
</kml>`
}

function versCsv(parcelles: Parcelle[]): string {
  const colonnes = [
    'nom',
    'reference',
    'type',
    'statut',
    'statut_juridique',
    'superficie_m2',
    'superficie_ha',
    'perimetre_m',
    'superficie_declaree_m2',
    'proprietaire',
    'occupant',
    'pays',
    'region',
    'prefecture',
    'commune',
    'quartier',
    'adresse',
    'prix_achat',
    'valeur_estimee',
    'devise',
    'date_acquisition',
    'latitude',
    'longitude',
    'tags',
    'description',
  ]

  const lignes = parcelles.map((p) => {
    const props = proprietes(p) as Record<string, unknown>
    const centre = p.point_geom?.coordinates
    props.latitude = centre ? centre[1].toFixed(6) : ''
    props.longitude = centre ? centre[0].toFixed(6) : ''
    return colonnes
      .map((c) => {
        const v = props[c]
        if (v === null || v === undefined) return ''
        const s = String(v)
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      })
      .join(';')
  })

  return [colonnes.join(';'), ...lignes].join('\n')
}
