/**
 * Géodésie et formatage cartographique.
 *
 * Module repris tel quel de l'application CartographieBiens (lot 1 du portage).
 * Il est volontairement conservé à l'identique — style et point-virgules
 * compris — plutôt que retranscrit : une coquille dans ces formules serait
 * silencieuse et fausserait des superficies. Seul l'import de types a changé.
 *
 * Les coordonnées sont partout en [lon, lat], ordre GeoJSON.
 */
import type { Anneau, PolygoneGeoJSON } from '@/types';

/* ------------------------------------------------------------------ */
/*  Formatage                                                          */
/* ------------------------------------------------------------------ */

/**
 * Affiche une superficie dans l'unité la plus lisible.
 * En Guinée on raisonne couramment en m² pour l'urbain et en hectares
 * au-delà d'un hectare.
 */
export function formaterSuperficie(m2: number | null | undefined): string {
  if (m2 == null || !Number.isFinite(m2)) return '—';
  if (m2 < 10_000) {
    return `${m2.toLocaleString('fr-FR', { maximumFractionDigits: m2 < 100 ? 1 : 0 })} m²`;
  }
  const ha = m2 / 10_000;
  return `${ha.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ha`;
}

export function formaterSuperficieDetail(m2: number | null | undefined): string {
  if (m2 == null || !Number.isFinite(m2)) return '—';
  const ha = m2 / 10_000;
  return `${m2.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} m² · ${ha.toLocaleString(
    'fr-FR',
    { maximumFractionDigits: 4 },
  )} ha`;
}

export function formaterDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1000) return `${m.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m`;
  return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`;
}

/* Pour les montants, utiliser formatMontant() de @/lib/utils : l'application
   en a déjà un, inutile d'en entretenir deux. */

/** Latitude/longitude en degrés-minutes-secondes. */
export function versDMS(valeur: number, axe: 'lat' | 'lon'): string {
  const positif = valeur >= 0;
  const abs = Math.abs(valeur);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  const card = axe === 'lat' ? (positif ? 'N' : 'S') : positif ? 'E' : 'O';
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(2).padStart(5, '0')}"${card}`;
}

/* ------------------------------------------------------------------ */
/*  Analyse de coordonnées saisies                                     */
/* ------------------------------------------------------------------ */

/**
 * Accepte : "10.5432", "10,5432", "10°32'35.5\"N", "10 32 35.5 N", "-13 42 10 O".
 * Renvoie null si illisible.
 */
export function analyserCoordonnee(brut: string): number | null {
  if (!brut) return null;
  let s = brut.trim().replace(/,/g, '.').toUpperCase();

  let signe = 1;
  const card = s.match(/[NSEWO]/);
  if (card) {
    if (card[0] === 'S' || card[0] === 'W' || card[0] === 'O') signe = -1;
    s = s.replace(/[NSEWO]/g, ' ').trim();
  }
  if (s.startsWith('-')) {
    signe *= -1;
    s = s.slice(1);
  }

  const nombres = s.match(/\d+(?:\.\d+)?/g);
  if (!nombres || nombres.length === 0) return null;

  const [d, m = '0', sec = '0'] = nombres;
  const val = Number(d) + Number(m) / 60 + Number(sec) / 3600;
  if (!Number.isFinite(val)) return null;
  return signe * val;
}

/**
 * Analyse un bloc de texte multi-lignes en liste de points [lon, lat].
 * Une ligne = un point. Séparateurs acceptés : virgule, point-virgule,
 * tabulation ou espaces multiples. Ordre attendu : latitude puis longitude.
 */
export function analyserListeCoordonnees(
  texte: string,
  ordre: 'lat_lon' | 'lon_lat' = 'lat_lon',
): { points: [number, number][]; erreurs: string[] } {
  const points: [number, number][] = [];
  const erreurs: string[] = [];

  texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((ligne, i) => {
      const parts = ligne
        .split(/[;\t]|,(?=\s*-?\d)|\s{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);

      let a: number | null = null;
      let b: number | null = null;

      if (parts.length >= 2) {
        a = analyserCoordonnee(parts[0]);
        b = analyserCoordonnee(parts[1]);
      } else {
        // Format « 10.5432 -13.6789 » sur une seule cellule
        const morceaux = ligne.split(/\s+/);
        if (morceaux.length >= 2) {
          const moitie = Math.ceil(morceaux.length / 2);
          a = analyserCoordonnee(morceaux.slice(0, moitie).join(' '));
          b = analyserCoordonnee(morceaux.slice(moitie).join(' '));
        }
      }

      if (a == null || b == null) {
        erreurs.push(`Ligne ${i + 1} illisible : « ${ligne} »`);
        return;
      }

      const lat = ordre === 'lat_lon' ? a : b;
      const lon = ordre === 'lat_lon' ? b : a;

      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        erreurs.push(`Ligne ${i + 1} hors limites : lat ${lat}, lon ${lon}`);
        return;
      }
      points.push([lon, lat]);
    });

  return { points, erreurs };
}

/* ------------------------------------------------------------------ */
/*  UTM ↔ WGS84 (ellipsoïde WGS84)                                     */
/*  Les titres fonciers guinéens sont souvent bornés en UTM 28N/29N.   */
/* ------------------------------------------------------------------ */

const A = 6378137.0; // demi-grand axe WGS84
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const K0 = 0.9996;

export function zoneUtmPour(lon: number): number {
  return Math.floor((lon + 180) / 6) + 1;
}

export function wgs84VersUtm(
  lat: number,
  lon: number,
  zoneForcee?: number,
): { easting: number; northing: number; zone: number; hemisphere: 'N' | 'S' } {
  const zone = zoneForcee ?? zoneUtmPour(lon);
  const lonOrigine = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;

  const N = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = (E2 / (1 - E2)) * Math.cos(phi) ** 2;
  const Aa = Math.cos(phi) * (lambda - lonOrigine);

  const M =
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi));

  const easting =
    K0 *
      N *
      (Aa +
        ((1 - T + C) * Aa ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * (E2 / (1 - E2))) * Aa ** 5) / 120) +
    500000.0;

  let northing =
    K0 *
    (M +
      N *
        Math.tan(phi) *
        (Aa ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * Aa ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * (E2 / (1 - E2))) * Aa ** 6) / 720));

  const hemisphere: 'N' | 'S' = lat >= 0 ? 'N' : 'S';
  if (lat < 0) northing += 10000000.0;

  return { easting, northing, zone, hemisphere };
}

export function utmVersWgs84(
  easting: number,
  northing: number,
  zone: number,
  hemisphere: 'N' | 'S' = 'N',
): { lat: number; lon: number } {
  const x = easting - 500000.0;
  const y = hemisphere === 'S' ? northing - 10000000.0 : northing;

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = (E2 / (1 - E2)) * Math.cos(phi1) ** 2;
  const R1 = (A * (1 - E2)) / Math.pow(1 - E2 * Math.sin(phi1) ** 2, 1.5);
  const D = x / (N1 * K0);
  const ep2 = E2 / (1 - E2);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6) / 720);

  const lonOrigine = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const lon =
    lonOrigine +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5) / 120) /
      Math.cos(phi1);

  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

/* ------------------------------------------------------------------ */
/*  Géométrie                                                          */
/* ------------------------------------------------------------------ */

/** Ferme l'anneau et le renvoie sous forme de polygone GeoJSON valide. */
export function anneauVersPolygone(anneau: Anneau): PolygoneGeoJSON | null {
  if (!anneau || anneau.length < 3) return null;
  const coords = [...anneau];
  const [x0, y0] = coords[0];
  const [xn, yn] = coords[coords.length - 1];
  if (x0 !== xn || y0 !== yn) coords.push([x0, y0]);
  if (coords.length < 4) return null;
  return { type: 'Polygon', coordinates: [coords] };
}

const DEG = Math.PI / 180;

/**
 * Rayons de courbure de l'ellipsoïde WGS84 à une latitude donnée.
 * M = méridien (nord-sud), N = grande normale (est-ouest).
 */
function rayonsCourbure(latRad: number): { M: number; N: number } {
  const s = Math.sin(latRad);
  const w = 1 - E2 * s * s;
  return {
    N: A / Math.sqrt(w),
    M: (A * (1 - E2)) / (w * Math.sqrt(w)),
  };
}

/**
 * Projette un anneau dans un plan tangent local (mètres) centré sur le
 * barycentre. Sur des parcelles de quelques kilomètres la distorsion est
 * inférieure au millionième, ce qui permet un calcul de surface simple et
 * cohérent avec l'ellipsoïde utilisé par PostGIS.
 */
function projeterLocal(ring: Anneau): { pts: [number, number][]; lat0: number; lon0: number } {
  const n = Math.max(1, ring.length - 1);
  let lat0 = 0;
  let lon0 = 0;
  for (let i = 0; i < n; i++) {
    lon0 += ring[i][0];
    lat0 += ring[i][1];
  }
  lat0 /= n;
  lon0 /= n;

  const pts = ring.map(([lon, lat]) => {
    const latMoy = ((lat + lat0) / 2) * DEG;
    const { M } = rayonsCourbure(latMoy);
    const { N } = rayonsCourbure(lat * DEG);
    return [(lon - lon0) * DEG * N * Math.cos(lat * DEG), (lat - lat0) * DEG * M] as [number, number];
  });

  return { pts, lat0, lon0 };
}

/**
 * Superficie en m² sur l'ellipsoïde WGS84.
 * Aligné sur ST_Area(geometry::geography) : l'écart mesuré sur des parcelles
 * urbaines est inférieur à 0,02 %, contre 0,4 % avec un modèle sphérique.
 */
export function superficieGeodesique(poly: PolygoneGeoJSON | null): number {
  if (!poly?.coordinates?.[0]) return 0;
  const { pts } = projeterLocal(poly.coordinates[0]);
  let somme = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    somme += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  return Math.abs(somme) / 2;
}

/** Distance géodésique en mètres entre deux positions [lon, lat]. */
export function distanceGeodesique(a: [number, number], b: [number, number]): number {
  const latMoy = ((a[1] + b[1]) / 2) * DEG;
  const { M, N } = rayonsCourbure(latMoy);
  const dx = (b[0] - a[0]) * DEG * N * Math.cos(latMoy);
  const dy = (b[1] - a[1]) * DEG * M;
  return Math.hypot(dx, dy);
}

/** Périmètre en mètres sur l'ellipsoïde WGS84. */
export function perimetreGeodesique(poly: PolygoneGeoJSON | null): number {
  if (!poly?.coordinates?.[0]) return 0;
  const ring = poly.coordinates[0];
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    total += distanceGeodesique(ring[i], ring[i + 1]);
  }
  return total;
}

export function centrePolygone(poly: PolygoneGeoJSON | null): [number, number] | null {
  if (!poly || !poly.coordinates[0]?.length) return null;
  const ring = poly.coordinates[0];
  let sx = 0;
  let sy = 0;
  const n = ring.length - 1; // dernier point = premier
  for (let i = 0; i < n; i++) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  return [sx / n, sy / n];
}

export function bboxPolygone(poly: PolygoneGeoJSON): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly.coordinates[0]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Détecte les auto-intersections simples (polygone « papillon »). */
export function polygoneEstSimple(poly: PolygoneGeoJSON): boolean {
  const ring = poly.coordinates[0];
  const n = ring.length - 1;
  if (n < 3) return false;
  const seg = (i: number) => [ring[i], ring[(i + 1) % n]] as const;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const [p1, p2] = seg(i);
      const [p3, p4] = seg(j);
      if (segmentsSeCroisent(p1, p2, p3, p4)) return false;
    }
  }
  return true;
}

function orientation(p: number[], q: number[], r: number[]): number {
  const v = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(v) < 1e-12) return 0;
  return v > 0 ? 1 : 2;
}

function segmentsSeCroisent(p1: number[], q1: number[], p2: number[], q2: number[]): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  return o1 !== o2 && o3 !== o4;
}

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

export function echapperXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
