-- La contrainte posée sur mode_location fige la liste des modes en base : toute
-- valeur nouvelle demanderait une migration. La validation reste faite côté
-- application, par Zod (lib/schemas.ts).
--
-- Rapatrié depuis l'historique Supabase le 31/08/2026 : appliqué en base le
-- 06/04/2026, il n'avait jamais été versionné.

ALTER TABLE biens DROP CONSTRAINT IF EXISTS biens_mode_location_check;
