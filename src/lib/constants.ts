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
