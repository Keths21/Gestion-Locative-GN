import type { PointGeoJSON, PolygoneGeoJSON, SourceTrace, StatutJuridique, StatutParcelle, TypeParcelle } from '@/types'
import { anneauVersPolygone, perimetreGeodesique, polygoneEstSimple, superficieGeodesique } from '@/lib/geo'
import {
  LIBELLES_JURIDIQUE,
  LIBELLES_STATUT_PARCELLE,
  LIBELLES_TYPE_PARCELLE,
} from '@/lib/constants'

/**
 * Lecture de fichiers de parcelles produits par des tiers.
 *
 * Un géomètre livre du GeoJSON ou du KML, un appareil de terrain du GPX, et
 * aucun des trois ne nomme ses colonnes comme nous. Ce module fait donc deux
 * choses que l'ancien import ne faisait pas : il reconnaît le GPX, et il tente
 * d'associer les attributs du fichier à nos champs plutôt que de ne retenir
 * que le nom et le tracé.
 *
 * Il est volontairement sans entrée-sortie : le même code sert à l'aperçu
 * dans le navigateur et à l'import côté serveur, ce qui garantit que ce qui
 * est montré est exactement ce qui sera écrit.
 */

export type FormatImport = 'geojson' | 'kml' | 'gpx' | 'inconnu'

export interface ParcelleImportee {
  nom: string
  geom: PolygoneGeoJSON | null
  point_geom: PointGeoJSON | null
  reference: string | null
  type: TypeParcelle
  statut: StatutParcelle
  statut_juridique: StatutJuridique
  description: string | null
  region: string | null
  prefecture: string | null
  commune: string | null
  quartier: string | null
  adresse: string | null
  superficie_declaree_m2: number | null
  prix_achat: number | null
  valeur_estimee: number | null
  date_acquisition: string | null
  proprietaire: string | null
  occupant: string | null
  contact_telephone: string | null
  source_trace: SourceTrace
  /** Calculée localement, pour l'aperçu. La valeur qui fera foi vient de PostGIS. */
  superficie_estimee_m2: number
  perimetre_estime_m: number
  /** Champs effectivement reconnus dans le fichier, hors nom et géométrie. */
  champsDetectes: string[]
  /** Anomalies non bloquantes : la parcelle sera importée malgré tout. */
  avertissements: string[]
}

export interface RapportImport {
  format: FormatImport
  parcelles: ParcelleImportee[]
  /** Entrées écartées, avec la raison — jamais de rejet silencieux. */
  ignores: { source: string; motif: string }[]
}

/* -------------------------------------------------------------------------- */
/*  Reconnaissance des champs                                                  */
/* -------------------------------------------------------------------------- */

/** « Superficie déclarée (m²) » et « superficie_declaree_m2 » doivent se rejoindre. */
function normaliserCle(cle: string): string {
  return cle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const ALIAS: Record<string, string[]> = {
  nom: ['nom', 'name', 'titre', 'libelle', 'label', 'designation', 'parcelle', 'intitule'],
  reference: ['reference', 'ref', 'numero', 'num', 'titrefoncier', 'tf', 'lot', 'cadastre', 'matricule'],
  proprietaire: ['proprietaire', 'owner', 'proprio', 'titulaire', 'attributaire'],
  occupant: ['occupant', 'exploitant', 'locataire', 'usager'],
  contact_telephone: ['telephone', 'tel', 'phone', 'contact', 'mobile', 'numerotelephone'],
  region: ['region', 'province'],
  prefecture: ['prefecture', 'departement', 'district'],
  commune: ['commune', 'ville', 'city', 'municipalite', 'souprefecture'],
  quartier: ['quartier', 'secteur', 'zone', 'village', 'localite'],
  adresse: ['adresse', 'address', 'lieu', 'localisation', 'situation'],
  description: ['description', 'desc', 'commentaire', 'comment', 'cmt', 'notes', 'note', 'remarque', 'observation'],
  superficie_declaree_m2: ['superficiedeclaree', 'superficie', 'surface', 'area', 'contenance', 'areem2', 'superficiem2'],
  prix_achat: ['prixachat', 'prix', 'montant', 'cout', 'price'],
  valeur_estimee: ['valeurestimee', 'valeur', 'estimation', 'value'],
  date_acquisition: ['dateacquisition', 'dateachat', 'dateacquis'],
  type: ['type', 'nature', 'categorie'],
  statut: ['statut', 'status', 'etat'],
  statut_juridique: ['statutjuridique', 'juridique', 'situationjuridique', 'regime', 'droit'],
}

function chercher(props: Record<string, unknown>, champ: string): unknown {
  const alias = ALIAS[champ] ?? [champ]
  for (const [cle, valeur] of Object.entries(props)) {
    if (valeur === null || valeur === undefined || valeur === '') continue
    if (alias.includes(normaliserCle(cle))) return valeur
  }
  return undefined
}

function texte(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s.slice(0, 2000)
}

/**
 * Accepte « 1 234,56 », « 1234.56 m² », « 0,5 ha », « 2ha ».
 * Les hectares sont convertis : un relevé de géomètre les mélange souvent
 * aux mètres carrés dans le même fichier.
 */
function nombre(v: unknown, surfaceEnHectaresPossible = false): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null

  const brut = String(v).trim()
  const hectares = surfaceEnHectaresPossible && /\bha\b|hectare/i.test(brut)

  const nettoye = brut
    .replace(/[^\d,.\-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.')

  const n = Number(nettoye)
  if (!Number.isFinite(n)) return null
  return hectares ? n * 10000 : n
}

function date(v: unknown): string | null {
  const s = texte(v)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // Formats JJ/MM/AAAA et JJ-MM-AAAA, courants dans les tableurs français
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

/** Accepte le code interne comme le libellé affiché, accents et casse indifférents. */
function versEnum<T extends string>(
  v: unknown,
  libelles: Record<string, string>,
  defaut: T
): { valeur: T; reconnu: boolean } {
  const s = texte(v)
  if (!s) return { valeur: defaut, reconnu: false }
  const cible = normaliserCle(s)

  for (const code of Object.keys(libelles)) {
    if (normaliserCle(code) === cible) return { valeur: code as T, reconnu: true }
  }
  for (const [code, libelle] of Object.entries(libelles)) {
    if (normaliserCle(libelle) === cible) return { valeur: code as T, reconnu: true }
  }
  return { valeur: defaut, reconnu: false }
}

/* -------------------------------------------------------------------------- */
/*  Construction d'une parcelle                                                */
/* -------------------------------------------------------------------------- */

function construire(
  nomParDefaut: string,
  geom: PolygoneGeoJSON | null,
  point: PointGeoJSON | null,
  props: Record<string, unknown>,
  source: SourceTrace
): ParcelleImportee {
  const champsDetectes: string[] = []
  const avertissements: string[] = []

  // Point de passage unique de toute géométrie importée : c'est ici, et
  // nulle part ailleurs, qu'on vérifie l'ordre des coordonnées.
  if (geom?.coordinates?.[0]) {
    const r = redresserCoordonnees(geom.coordinates[0])
    if (r.motif) {
      geom = { type: 'Polygon', coordinates: [r.coords] }
      avertissements.push(r.motif)
    }
  }
  if (point?.coordinates) {
    const r = redresserCoordonnees([point.coordinates])
    if (r.motif) {
      point = { type: 'Point', coordinates: r.coords[0] }
      avertissements.push(r.motif)
    }
  }

  /** Retient la valeur et note le champ comme reconnu, pour l'aperçu. */
  const prendre = <V extends string | number | null>(valeur: V, etiquette: string): V => {
    if (valeur !== null) champsDetectes.push(etiquette)
    return valeur
  }

  const nom = texte(chercher(props, 'nom')) ?? nomParDefaut

  const t = versEnum<TypeParcelle>(chercher(props, 'type'), LIBELLES_TYPE_PARCELLE, 'terrain_nu')
  if (t.reconnu) champsDetectes.push('type')

  const st = versEnum<StatutParcelle>(chercher(props, 'statut'), LIBELLES_STATUT_PARCELLE, 'possede')
  if (st.reconnu) champsDetectes.push('statut')

  const j = versEnum<StatutJuridique>(chercher(props, 'statut_juridique'), LIBELLES_JURIDIQUE, 'inconnu')
  if (j.reconnu) champsDetectes.push('situation juridique')

  const superficieDeclaree = nombre(chercher(props, 'superficie_declaree_m2'), true)

  if (geom && !polygoneEstSimple(geom)) {
    avertissements.push('tracé auto-sécant : la superficie sera fausse')
  }

  const superficie = geom ? superficieGeodesique(geom) : 0

  if (geom && superficieDeclaree && superficie > 0) {
    const ecart = Math.abs((superficie - superficieDeclaree) / superficieDeclaree) * 100
    if (ecart > 10) {
      avertissements.push(
        `${ecart.toFixed(0)} % d'écart entre le tracé et la superficie déclarée`
      )
    }
  }

  return {
    nom,
    geom,
    point_geom: geom ? null : point,
    reference: prendre(texte(chercher(props, 'reference')), 'référence') as string | null,
    type: t.valeur,
    statut: st.valeur,
    statut_juridique: j.valeur,
    description: texte(chercher(props, 'description')),
    region: prendre(texte(chercher(props, 'region')), 'région') as string | null,
    prefecture: prendre(texte(chercher(props, 'prefecture')), 'préfecture') as string | null,
    commune: prendre(texte(chercher(props, 'commune')), 'commune') as string | null,
    quartier: prendre(texte(chercher(props, 'quartier')), 'quartier') as string | null,
    adresse: prendre(texte(chercher(props, 'adresse')), 'adresse') as string | null,
    superficie_declaree_m2: prendre(superficieDeclaree, 'superficie déclarée') as number | null,
    prix_achat: prendre(nombre(chercher(props, 'prix_achat')), "prix d'achat") as number | null,
    valeur_estimee: prendre(nombre(chercher(props, 'valeur_estimee')), 'valeur estimée') as number | null,
    date_acquisition: prendre(date(chercher(props, 'date_acquisition')), 'date') as string | null,
    proprietaire: prendre(texte(chercher(props, 'proprietaire')), 'propriétaire') as string | null,
    occupant: prendre(texte(chercher(props, 'occupant')), 'occupant') as string | null,
    contact_telephone: prendre(texte(chercher(props, 'contact_telephone')), 'téléphone') as string | null,
    source_trace: source,
    superficie_estimee_m2: superficie,
    perimetre_estime_m: geom ? perimetreGeodesique(geom) : 0,
    champsDetectes: [...new Set(champsDetectes)],
    avertissements,
  }
}

/* -------------------------------------------------------------------------- */
/*  Ordre des coordonnées                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Emprise attendue des données. Le GeoJSON impose l'ordre [lon, lat], mais
 * beaucoup d'outils écrivent [lat, lon] : un fichier inversé place la parcelle
 * à des milliers de kilomètres, sans que rien ne le signale.
 *
 * À élargir le jour où le portefeuille sortira de Guinée.
 */
export const EMPRISE_ATTENDUE = { lonMin: -15.5, lonMax: -7.5, latMin: 7.0, latMax: 12.8 }

function dansEmprise([lon, lat]: [number, number]): boolean {
  return (
    lon >= EMPRISE_ATTENDUE.lonMin &&
    lon <= EMPRISE_ATTENDUE.lonMax &&
    lat >= EMPRISE_ATTENDUE.latMin &&
    lat <= EMPRISE_ATTENDUE.latMax
  )
}

/**
 * Détecte et redresse un couple inversé.
 *
 * Deux signaux, du plus sûr au plus faible :
 *  1. une latitude au-delà de 90° est mathématiquement impossible ;
 *  2. aucun point dans l'emprise attendue alors que l'inversion les y place.
 *
 * La correction n'est jamais silencieuse : elle remonte dans l'aperçu, et
 * l'utilisateur voit ce qui a été redressé avant que quoi que ce soit ne soit
 * écrit.
 */
export function redresserCoordonnees(
  coords: [number, number][]
): { coords: [number, number][]; motif: string | null } {
  if (!coords.length) return { coords, motif: null }

  const inverser = (): [number, number][] => coords.map(([a, b]) => [b, a] as [number, number])

  if (coords.some(([, lat]) => Math.abs(lat) > 90)) {
    return { coords: inverser(), motif: 'latitude hors bornes : ordre lat/lon inversé, redressé' }
  }

  const dedans = coords.filter(dansEmprise).length
  if (dedans === 0) {
    const inverses = inverser()
    if (inverses.filter(dansEmprise).length === inverses.length) {
      return { coords: inverses, motif: 'coordonnées hors zone : ordre lat/lon inversé, redressé' }
    }
  }

  return { coords, motif: null }
}

function fermerAnneau(coords: [number, number][]): [number, number][] {
  if (coords.length < 3) return coords
  const [x0, y0] = coords[0]
  const [xn, yn] = coords[coords.length - 1]
  if (x0 !== xn || y0 !== yn) return [...coords, [x0, y0]]
  return coords
}

/* -------------------------------------------------------------------------- */
/*  GeoJSON                                                                    */
/* -------------------------------------------------------------------------- */

function lireGeoJson(texteFichier: string): RapportImport {
  const parcelles: ParcelleImportee[] = []
  const ignores: { source: string; motif: string }[] = []

  let data: Record<string, unknown>
  try {
    data = JSON.parse(texteFichier)
  } catch {
    return { format: 'geojson', parcelles: [], ignores: [{ source: 'fichier', motif: 'JSON illisible' }] }
  }

  const entites =
    data.type === 'FeatureCollection' && Array.isArray(data.features)
      ? (data.features as Record<string, unknown>[])
      : [data]

  entites.forEach((f, i) => {
    // Une entité GeoJSON porte sa géométrie dans `geometry` ; on accepte aussi
    // une géométrie nue, mais sans confondre les deux : sinon une entité sans
    // géométrie se voit reprocher d'être de type « Feature », ce qui n'aide
    // personne à corriger son fichier.
    const geometrieBrute = f.geometry === undefined ? f : f.geometry
    const g = (geometrieBrute ?? {}) as { type?: string; coordinates?: unknown }
    const props = (f.properties ?? {}) as Record<string, unknown>
    const defaut = texte(chercher((f.properties ?? {}) as Record<string, unknown>, 'nom')) ?? `Parcelle importée ${i + 1}`

    if (g?.type === 'Polygon') {
      parcelles.push(construire(defaut, g as PolygoneGeoJSON, null, props, 'import'))
    } else if (g?.type === 'MultiPolygon') {
      // Un multipolygone donne autant de parcelles qu'il a de composantes :
      // le schéma n'accepte qu'un polygone simple par ligne.
      ;(g.coordinates as number[][][][]).forEach((coords, k) => {
        parcelles.push(
          construire(
            `${texte(chercher(props, 'nom')) ?? defaut}${k > 0 ? ` (${k + 1})` : ''}`,
            { type: 'Polygon', coordinates: coords as [number, number][][] },
            null,
            props,
            'import'
          )
        )
      })
    } else if (g?.type === 'Point') {
      parcelles.push(
        construire(defaut, null, g as unknown as PointGeoJSON, props, 'import')
      )
    } else if (g?.type === 'LineString') {
      // Un géomètre livre parfois le contour comme une ligne : on la referme.
      const anneau = fermerAnneau(g.coordinates as [number, number][])
      const poly = anneauVersPolygone(anneau)
      if (poly) parcelles.push(construire(defaut, poly, null, props, 'import'))
      else ignores.push({ source: defaut, motif: 'ligne trop courte pour former un contour' })
    } else {
      ignores.push({
        source: defaut,
        motif: g?.type
          ? `géométrie non prise en charge (${g.type})`
          : 'aucune géométrie dans cette entité',
      })
    }
  })

  return { format: 'geojson', parcelles, ignores }
}

/* -------------------------------------------------------------------------- */
/*  KML                                                                        */
/* -------------------------------------------------------------------------- */

function coordonneesKml(bloc: string): [number, number][] {
  const brut = bloc.match(/<coordinates>([\s\S]*?)<\/coordinates>/)?.[1] ?? ''
  return brut
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[0], c[1]] as [number, number])
}

function lireKml(texteFichier: string): RapportImport {
  const parcelles: ParcelleImportee[] = []
  const ignores: { source: string; motif: string }[] = []
  const placemarks = texteFichier.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? []

  placemarks.forEach((pm, i) => {
    const nettoyer = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').trim()
    const nom = nettoyer(pm.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '') || `Parcelle importée ${i + 1}`
    const description = nettoyer(pm.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '')

    // Google Earth range les attributs dans ExtendedData : c'est là que se
    // trouvent référence, propriétaire et superficie quand ils existent.
    const props: Record<string, unknown> = { nom, description }
    for (const d of pm.match(/<(?:Data|SimpleData)[^>]*name="([^"]+)"[^>]*>[\s\S]*?<\/(?:Data|SimpleData)>/g) ?? []) {
      const cle = d.match(/name="([^"]+)"/)?.[1]
      const valeur = nettoyer(d.match(/<value>([\s\S]*?)<\/value>/)?.[1] ?? d.replace(/<[^>]+>/g, ''))
      if (cle && valeur) props[cle] = valeur
    }

    const anneaux = pm.match(/<outerBoundaryIs>[\s\S]*?<\/outerBoundaryIs>/g) ?? []
    if (anneaux.length) {
      for (const bloc of anneaux) {
        const coords = fermerAnneau(coordonneesKml(bloc))
        const poly = anneauVersPolygone(coords)
        if (poly) parcelles.push(construire(nom, poly, null, props, 'import'))
        else ignores.push({ source: nom, motif: 'contour incomplet' })
      }
      return
    }

    const pointBloc = pm.match(/<Point>[\s\S]*?<\/Point>/)?.[0]
    if (pointBloc) {
      const c = coordonneesKml(pointBloc)[0]
      if (c) {
        parcelles.push(construire(nom, null, { type: 'Point', coordinates: c }, props, 'import'))
        return
      }
    }

    ignores.push({ source: nom, motif: 'ni contour ni repère exploitable' })
  })

  return { format: 'kml', parcelles, ignores }
}

/* -------------------------------------------------------------------------- */
/*  GPX — appareils de terrain                                                 */
/* -------------------------------------------------------------------------- */

function pointsGpx(bloc: string, balise: string): [number, number][] {
  const motif = new RegExp(`<${balise}[^>]*lat="([-\\d.]+)"[^>]*lon="([-\\d.]+)"`, 'g')
  const points: [number, number][] = []
  for (const m of bloc.matchAll(motif)) {
    const lat = Number(m[1])
    const lon = Number(m[2])
    if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lon, lat])
  }
  return points
}

function lireGpx(texteFichier: string): RapportImport {
  const parcelles: ParcelleImportee[] = []
  const ignores: { source: string; motif: string }[] = []

  const nomDe = (bloc: string, defaut: string) =>
    (bloc.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim() || defaut

  const propsDe = (bloc: string, nom: string) => ({
    nom,
    description:
      (bloc.match(/<desc>([\s\S]*?)<\/desc>/)?.[1] ?? bloc.match(/<cmt>([\s\S]*?)<\/cmt>/)?.[1] ?? '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .trim(),
  })

  // Traces et itinéraires : un tour de parcelle marché au GPS.
  const traces = [
    ...(texteFichier.match(/<trk>[\s\S]*?<\/trk>/g) ?? []).map((b) => ({ bloc: b, balise: 'trkpt' })),
    ...(texteFichier.match(/<rte>[\s\S]*?<\/rte>/g) ?? []).map((b) => ({ bloc: b, balise: 'rtept' })),
  ]

  traces.forEach(({ bloc, balise }, i) => {
    const nom = nomDe(bloc, `Relevé ${i + 1}`)
    const coords = fermerAnneau(pointsGpx(bloc, balise))
    const poly = anneauVersPolygone(coords)
    if (poly) {
      // Une trace GPX vient d'un tour de parcelle effectué à pied.
      parcelles.push(construire(nom, poly, null, propsDe(bloc, nom), 'gps_marche'))
    } else {
      ignores.push({ source: nom, motif: `trace de ${coords.length} point(s) : au moins 3 sont nécessaires` })
    }
  })

  // Points isolés : bornes ou repères.
  const reperes = texteFichier.match(/<wpt[\s\S]*?<\/wpt>/g) ?? []
  reperes.forEach((bloc, i) => {
    const nom = nomDe(bloc, `Repère ${i + 1}`)
    const c = pointsGpx(bloc, 'wpt')[0]
    if (c) parcelles.push(construire(nom, null, { type: 'Point', coordinates: c }, propsDe(bloc, nom), 'gps_marche'))
    else ignores.push({ source: nom, motif: 'coordonnées absentes' })
  })

  return { format: 'gpx', parcelles, ignores }
}

/* -------------------------------------------------------------------------- */
/*  Point d'entrée                                                             */
/* -------------------------------------------------------------------------- */

export function detecterFormat(nomFichier: string, contenu: string): FormatImport {
  const n = nomFichier.toLowerCase()
  if (n.endsWith('.gpx')) return 'gpx'
  if (n.endsWith('.kml')) return 'kml'
  if (n.endsWith('.geojson') || n.endsWith('.json')) return 'geojson'
  // Extension absente ou trompeuse : on regarde le contenu.
  const debut = contenu.slice(0, 2000)
  if (/<gpx[\s>]/i.test(debut)) return 'gpx'
  if (/<kml[\s>]|<Placemark[\s>]/i.test(debut)) return 'kml'
  if (/^\s*[{[]/.test(debut)) return 'geojson'
  return 'inconnu'
}

export function analyserFichier(nomFichier: string, contenu: string): RapportImport {
  const format = detecterFormat(nomFichier, contenu)
  switch (format) {
    case 'gpx':
      return lireGpx(contenu)
    case 'kml':
      return lireKml(contenu)
    case 'geojson':
      return lireGeoJson(contenu)
    default:
      return {
        format: 'inconnu',
        parcelles: [],
        ignores: [{ source: nomFichier, motif: 'format non reconnu (attendu : GeoJSON, KML ou GPX)' }],
      }
  }
}

export const LIBELLES_FORMAT: Record<FormatImport, string> = {
  geojson: 'GeoJSON',
  kml: 'KML',
  gpx: 'GPX',
  inconnu: 'inconnu',
}
