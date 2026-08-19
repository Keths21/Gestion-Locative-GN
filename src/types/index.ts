// ---------------------------------------------------------------------------
// Multi-organisation (migration 20260816090000)
// ---------------------------------------------------------------------------

export type RoleMembre = 'proprietaire' | 'editeur' | 'lecteur'

export type Organisation = {
  id: string
  nom: string
  pays: string
  devise: string
  cree_le: string
}

export type Membre = {
  organisation_id: string
  user_id: string
  role: RoleMembre
  cree_le: string
}

export type Bien = {
  id: string
  user_id: string
  organisation_id: string
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
  organisation_id: string
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
  organisation_id: string
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

// ---------------------------------------------------------------------------
// Cartographie foncière (migration 20260816090200)
//
// Les champs géométriques arrivent en GeoJSON via la vue `v_parcelles` : la
// colonne `geom` de la table reste du PostGIS, jamais lue directement par le
// client. Les coordonnées sont en [lon, lat], ordre GeoJSON.
// ---------------------------------------------------------------------------

export type TypeParcelle =
  | 'terrain_nu' | 'terrain_bati' | 'agricole'
  | 'commercial' | 'industriel' | 'mixte' | 'autre'

export type StatutParcelle =
  | 'possede' | 'en_vente' | 'vendu' | 'loue' | 'reserve' | 'prospect'

export type StatutJuridique =
  | 'titre_foncier' | 'permis_habiter' | 'attestation_vente'
  | 'bail' | 'droit_coutumier' | 'litige' | 'inconnu'

export type SourceTrace = 'manuel' | 'gps_marche' | 'coordonnees' | 'import'

/** Anneau extérieur d'un polygone, en [lon, lat]. */
export type Anneau = [number, number][]

export type PolygoneGeoJSON = { type: 'Polygon'; coordinates: Anneau[] }
export type PointGeoJSON = { type: 'Point'; coordinates: [number, number] }

export type Parcelle = {
  id: string
  organisation_id: string
  /** Rattachement facultatif à un bien locatif. */
  bien_id: string | null

  nom: string
  reference: string | null
  type: TypeParcelle
  statut: StatutParcelle
  statut_juridique: StatutJuridique
  description: string | null

  pays: string | null
  region: string | null
  prefecture: string | null
  commune: string | null
  quartier: string | null
  adresse: string | null

  geom: PolygoneGeoJSON | null
  point_geom: PointGeoJSON | null

  /** Calculées en base par trigger, jamais renseignées par le client. */
  superficie_m2: number | null
  perimetre_m: number | null
  /** Superficie inscrite au titre, pour comparaison avec le tracé réel. */
  superficie_declaree_m2: number | null

  prix_achat: number | null
  valeur_estimee: number | null
  devise: string | null
  date_acquisition: string | null

  proprietaire: string | null
  occupant: string | null
  contact_telephone: string | null

  couleur: string
  tags: string[]
  source_trace: SourceTrace
  /** Précision GPS moyenne du relevé, en mètres. */
  precision_m: number | null

  cree_par: string | null
  cree_le: string
  modifie_le: string
  /** Suppression logique : indispensable à la synchronisation hors-ligne. */
  supprime_le: string | null
  version: number

  bien?: Bien
}

export type ParcelleDocument = {
  id: string
  parcelle_id: string
  organisation_id: string
  nom: string
  categorie: 'photo' | 'titre' | 'plan' | 'contrat' | 'facture' | 'autre'
  chemin: string
  mime: string | null
  taille_octets: number | null
  lat: number | null
  lon: number | null
  cree_par: string | null
  cree_le: string
}

// ---------------------------------------------------------------------------
// Travaux & Chantier (migration 20260819100000)
//
// Un chantier peut exister sans bien ni parcelle : il porte alors sa propre
// localisation. Les rattachements sont nullables et modifiables — on construit
// souvent avant d'avoir enregistré le foncier.
// ---------------------------------------------------------------------------

export type NatureChantier = 'construction' | 'renovation' | 'extension' | 'amenagement'

export type StatutChantier = 'prevu' | 'en_cours' | 'suspendu' | 'livre' | 'abandonne'

export type RoleAccesChantier = 'lecteur' | 'contributeur'

export type Chantier = {
  id: string
  organisation_id: string
  /** Rattachements facultatifs, modifiables à tout moment. */
  bien_id: string | null
  parcelle_id: string | null

  nom: string
  reference: string | null
  nature: NatureChantier
  statut: StatutChantier
  description: string | null

  pays: string | null
  region: string | null
  prefecture: string | null
  commune: string | null
  quartier: string | null
  adresse: string | null
  /** Repère propre au chantier : sans lui, le journal géolocalisé n'a pas d'ancrage. */
  point_geom: PointGeoJSON | null

  budget_initial: number | null
  /** Distincte du budget : répond à « combien puis-je encore absorber ? ». */
  reserve_imprevus: number | null
  devise: string | null

  date_debut_prevue: string | null
  date_fin_prevue: string | null
  date_debut_reelle: string | null
  date_fin_reelle: string | null

  cree_par: string | null
  cree_le: string
  modifie_le: string
  supprime_le: string | null
  version: number

  bien?: Bien
  parcelle?: Parcelle
}

/** Accès accordé à un tiers — architecte, maître d'œuvre, co-propriétaire. */
export type AccesChantier = {
  id: string
  chantier_id: string
  email: string
  /** Renseigné à la première connexion de l'invité. */
  user_id: string | null
  role: RoleAccesChantier
  /** null = sans limite. Un accès daté s'éteint sans geste d'administration. */
  expire_le: string | null
  invite_par: string | null
  cree_le: string
}
