import { z } from 'zod'

export const locataireSchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email().optional().nullable(),
  telephone: z.string().optional().nullable(),
})

export const paiementSchema = z.object({
  // montant peut arriver en string depuis la base (numeric) → on coerce
  montant: z.coerce.number().positive(),
  mois_concerne: z.string().min(1),
  // Un impayé (échéance non réglée) n'a pas de date de paiement
  date_paiement: z.string().min(1).optional().nullable(),
})

export const bienSchema = z.object({
  nom: z.string().min(1),
  adresse: z.string().optional().nullable(),
  loyer_base: z.number().nonnegative().optional(),
  charges: z.number().nonnegative().optional(),
})

export const agenceSchema = z.object({
  nom_agence: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  telephone: z.string().optional().nullable(),
  adresse: z.string().optional().nullable(),
  ville: z.string().optional().nullable(),
})

// Schemas complets par route
export const relanceBodySchema = z.object({
  locataire: locataireSchema,
  paiements: z.array(paiementSchema).min(1),
  agence: agenceSchema.optional().nullable(),
})

export const quittanceBodySchema = z.object({
  locataire: locataireSchema,
  paiement: paiementSchema,
  bien: bienSchema.optional().nullable(),
  agence: agenceSchema.optional().nullable(),
})

export type RelanceBody = z.infer<typeof relanceBodySchema>
export type QuittanceBody = z.infer<typeof quittanceBodySchema>

// ---------------------------------------------------------------------------
// Cartographie foncière
// Repris de lib/validation.ts de l'application CartographieBiens, moins les
// schémas d'authentification devenus inutiles (Supabase Auth s'en charge).
// ---------------------------------------------------------------------------

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])

export const polygoneSchema = z.object({
  type: z.literal('Polygon'),
  // Un anneau fermé compte au minimum 4 sommets : 3 distincts + le retour au premier.
  coordinates: z.array(z.array(position).min(4)).min(1),
})

export const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: position,
})

const texteOptionnel = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => (v === '' ? null : v))

export const parcelleSchema = z.object({
  id: z.string().uuid().optional(),
  bien_id: z.string().uuid().nullish(),
  nom: z.string().trim().min(1, 'Le nom est obligatoire.').max(200),
  reference: texteOptionnel,
  type: z
    .enum(['terrain_nu', 'terrain_bati', 'agricole', 'commercial', 'industriel', 'mixte', 'autre'])
    .default('terrain_nu'),
  statut: z
    .enum(['possede', 'en_vente', 'vendu', 'loue', 'reserve', 'prospect'])
    .default('possede'),
  statut_juridique: z
    .enum([
      'titre_foncier',
      'permis_habiter',
      'attestation_vente',
      'bail',
      'droit_coutumier',
      'litige',
      'inconnu',
    ])
    .default('inconnu'),
  description: texteOptionnel,

  pays: texteOptionnel,
  region: texteOptionnel,
  prefecture: texteOptionnel,
  commune: texteOptionnel,
  quartier: texteOptionnel,
  adresse: texteOptionnel,

  geom: polygoneSchema.nullish(),
  point_geom: pointSchema.nullish(),

  superficie_declaree_m2: z.number().nonnegative().nullish(),
  prix_achat: z.number().nonnegative().nullish(),
  valeur_estimee: z.number().nonnegative().nullish(),
  devise: z.string().trim().max(8).nullish(),
  date_acquisition: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
    .nullish()
    .or(z.literal('').transform(() => null)),

  proprietaire: texteOptionnel,
  occupant: texteOptionnel,
  contact_telephone: texteOptionnel,

  couleur: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue')
    .default('#f59e0b'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  source_trace: z.enum(['manuel', 'gps_marche', 'coordonnees', 'import']).default('manuel'),
  precision_m: z.number().nonnegative().nullish(),
})

export type EntreeParcelle = z.infer<typeof parcelleSchema>

/** Une mutation accumulée hors-ligne, telle que la file cliente l'envoie. */
export const mutationSchema = z.object({
  id: z.string(),
  parcelle_id: z.string().uuid(),
  operation: z.enum(['creation', 'modification', 'suppression']),
  charge: z.record(z.string(), z.unknown()),
  cree_le: z.number(),
})

export const lotSyncSchema = z.object({
  mutations: z.array(mutationSchema).max(200),
  depuis: z.string().nullish(),
})

export type Mutation = z.infer<typeof mutationSchema>
