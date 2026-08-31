-- Un bien loué à la nuitée n'a pas de loyer mensuel : la colonne cesse d'être
-- obligatoire, sans quoi le second mode de location introduit juste avant
-- serait insaisissable.
--
-- Rapatrié depuis l'historique Supabase le 31/08/2026 : appliqué en base le
-- 06/04/2026, il n'avait jamais été versionné.

ALTER TABLE biens ALTER COLUMN loyer_base DROP NOT NULL;
