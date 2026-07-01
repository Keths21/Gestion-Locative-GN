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
