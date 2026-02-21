export type Bien = {
  id: string
  user_id: string
  nom: string
  adresse: string
  ville: string
  type: 'appartement' | 'maison' | 'bureau' | 'commerce' | 'terrain'
  surface: number
  loyer_base: number
  charges: number
  statut: 'loué' | 'vacant' | 'travaux'
  created_at: string
}

export type Locataire = {
  id: string
  user_id: string
  bien_id: string
  nom: string
  prenom: string
  email: string
  telephone: string
  date_entree: string
  date_sortie?: string
  depot_garantie: number
  created_at: string
  bien?: Bien
}

export type Paiement = {
  id: string
  locataire_id: string
  bien_id: string
  montant: number
  date_paiement: string
  mois_concerne: string
  statut: 'payé' | 'en_attente' | 'impayé'
  created_at: string
  locataire?: Locataire
  bien?: Bien
}

export type Document = {
  id: string
  user_id: string
  locataire_id: string
  bien_id: string
  type: 'bail' | 'quittance' | 'etat_des_lieux' | 'relance'
  url: string
  created_at: string
}
