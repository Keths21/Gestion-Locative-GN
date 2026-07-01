export type Bien = {
  id: string
  user_id: string
  nom: string
  adresse: string
  ville: string
  type: 'studio' | 'appartement' | 'maison' | 'villa' | 'bureau' | 'commerce' | 'terrain'
  mode_location: 'appartement' | 'airbnb'
  surface?: number
  statut: 'loué' | 'vacant' | 'travaux'
  description?: string
  nombre_pieces?: number
  etage?: number
  meuble?: boolean
  date_disponibilite?: string
  parking?: boolean
  ascenseur?: boolean
  gardien?: boolean
  eau_incluse?: boolean
  electricite_incluse?: boolean
  internet_inclus?: boolean
  climatisation?: boolean
  // Appartement (mensuel)
  loyer_base?: number
  charges?: number
  duree_min_mois?: number
  depot_garantie_mois?: number
  // Airbnb (journalier)
  prix_nuit?: number
  duree_min_nuits?: number
  max_voyageurs?: number
  heure_checkin?: string
  heure_checkout?: string
  regles_maison?: string
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
  derniere_relance?: string | null
  created_at: string
  bien?: Bien
}

export type Paiement = {
  id: string
  locataire_id: string
  bien_id: string
  montant: number
  date_paiement: string | null
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
