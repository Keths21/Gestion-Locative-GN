/**
 * Fonds de carte.
 *
 * Fournisseur retenu : **Esri**. Le choix conserve l'imagerie déjà affichée,
 * donc aucun changement visuel pour les utilisateurs — on régularise l'usage
 * plutôt que d'introduire un nouveau rendu.
 *
 * Tant que `NEXT_PUBLIC_ARCGIS_API_KEY` est absente, l'application interroge
 * le point d'accès public d'ArcGIS Online. Cela fonctionne, mais ne couvre
 * ni l'usage commercial ni la mise en cache hors-ligne : c'est un état
 * transitoire, pas une configuration de production.
 *
 * L'URL comme la clé sont lues depuis l'environnement : quel que soit le
 * point d'accès fourni au contrat — service de tuiles classique ou service
 * de styles — il se branche sans toucher au code.
 */

const CLE_ARCGIS = process.env.NEXT_PUBLIC_ARCGIS_API_KEY ?? ''

/** Le contrat peut imposer un autre point d'accès que celui d'ArcGIS Online. */
const URL_SATELLITE =
  process.env.NEXT_PUBLIC_TUILES_SATELLITE ??
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const URL_REPERES =
  process.env.NEXT_PUBLIC_TUILES_REPERES ??
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

const URL_PLAN =
  process.env.NEXT_PUBLIC_TUILES_PLAN ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/** Ajoute le jeton aux seules URL Esri : OpenStreetMap n'en veut pas. */
function avecJeton(url: string): string {
  if (!CLE_ARCGIS || !/arcgis/i.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${CLE_ARCGIS}`
}

export const FONDS = {
  satellite: {
    nom: 'Satellite',
    url: avecJeton(URL_SATELLITE),
    attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics',
    zoomMax: 19,
  },
  reperes: {
    nom: 'Repères et noms',
    url: avecJeton(URL_REPERES),
    attribution: '© Esri',
    zoomMax: 19,
  },
  plan: {
    nom: 'Plan',
    url: URL_PLAN,
    attribution: '© Contributeurs OpenStreetMap',
    zoomMax: 19,
  },
} as const

export type CleFond = keyof typeof FONDS

/**
 * Le cache hors-ligne n'est légitime qu'une fois le contrat Esri en place :
 * le téléchargement en masse de tuiles est explicitement proscrit sur le
 * point d'accès public. Cette valeur commande l'outil de téléchargement de
 * zones — sans clé, il reste indisponible plutôt que d'exposer l'utilisateur
 * à une coupure de service.
 */
export const CACHE_TUILES_AUTORISE = Boolean(CLE_ARCGIS)

/** Hôtes servant des tuiles, à autoriser dans le service worker. */
export const HOTES_TUILES = [
  ...new Set(
    [FONDS.satellite.url, FONDS.reperes.url, FONDS.plan.url].map((u) => {
      try {
        return new URL(u).host
      } catch {
        return ''
      }
    })
  ),
].filter(Boolean)

/** Conakry — centre de carte par défaut. */
export const VUE_DEFAUT: [number, number] = [9.6412, -13.5784]
