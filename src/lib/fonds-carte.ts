/**
 * Fonds de carte.
 *
 * ⚠️ LOT 0 — DÉCISION EN ATTENTE
 * Les tuiles Esri ci-dessous sont celles héritées de l'application
 * CartographieBiens. Elles conviennent au développement mais **pas à une mise
 * en production commerciale** : leurs conditions d'utilisation ne couvrent ni
 * l'usage dans un SaaS payant, ni le téléchargement en masse pour le cache
 * hors-ligne prévu au lot 5.
 *
 * Quand le fournisseur sous licence sera retenu (MapTiler, Mapbox ou licence
 * Esri négociée), seuls ce fichier et la liste d'hôtes du service worker
 * seront à modifier.
 */

export const FONDS = {
  satellite: {
    nom: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics',
    zoomMax: 19,
  },
  reperes: {
    nom: 'Repères et noms',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    zoomMax: 19,
  },
  plan: {
    nom: 'Plan',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© Contributeurs OpenStreetMap',
    zoomMax: 19,
  },
} as const

export type CleFond = keyof typeof FONDS

/** Conakry — centre de carte par défaut. */
export const VUE_DEFAUT: [number, number] = [9.6412, -13.5784]
