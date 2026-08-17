export const STATUT_PAIEMENT = {
  PAYE: 'payé',
  EN_ATTENTE: 'en_attente',
  IMPAYE: 'impayé',
} as const

export type StatutPaiement = (typeof STATUT_PAIEMENT)[keyof typeof STATUT_PAIEMENT]

export const STATUT_BIEN = {
  OCCUPE: 'occupé',
  VACANT: 'vacant',
} as const

export const DEVISE_DEFAUT = 'GNF'
export const VILLE_DEFAUT = 'Conakry'
export const DELAI_RELANCE_JOURS = 8

// ---------------------------------------------------------------------------
// Cartographie foncière
// ---------------------------------------------------------------------------

import type { TypeParcelle, StatutParcelle, StatutJuridique, SourceTrace } from '@/types'

export const LIBELLES_TYPE_PARCELLE: Record<TypeParcelle, string> = {
  terrain_nu: 'Terrain nu',
  terrain_bati: 'Terrain bâti',
  agricole: 'Agricole',
  commercial: 'Commercial',
  industriel: 'Industriel',
  mixte: 'Mixte',
  autre: 'Autre',
}

export const LIBELLES_STATUT_PARCELLE: Record<StatutParcelle, string> = {
  possede: 'Possédé',
  en_vente: 'En vente',
  vendu: 'Vendu',
  loue: 'Loué',
  reserve: 'Réservé',
  prospect: 'Prospect',
}

export const LIBELLES_JURIDIQUE: Record<StatutJuridique, string> = {
  titre_foncier: 'Titre foncier',
  permis_habiter: "Permis d'habiter",
  attestation_vente: 'Attestation de vente',
  bail: 'Bail',
  droit_coutumier: 'Droit coutumier',
  litige: 'En litige',
  inconnu: 'Non renseigné',
}

export const LIBELLES_SOURCE_TRACE: Record<SourceTrace, string> = {
  manuel: 'Tracé à la main',
  gps_marche: 'Relevé GPS (marche)',
  coordonnees: 'Saisie de coordonnées',
  import: 'Import de fichier',
}

/** Palette proposée pour distinguer les parcelles sur la carte. */
export const COULEURS_PARCELLE = [
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
] as const
