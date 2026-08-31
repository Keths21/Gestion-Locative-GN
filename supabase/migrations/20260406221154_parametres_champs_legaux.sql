-- Mentions légales de l'agence, reprises sur les quittances et les baux.
-- RCCM et NIF sont les identifiants d'entreprise guinéens.
--
-- Rapatrié depuis l'historique Supabase le 31/08/2026 : appliqué en base le
-- 06/04/2026, il n'avait jamais été versionné.

ALTER TABLE parametres
  ADD COLUMN IF NOT EXISTS site_web text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS rccm text,
  ADD COLUMN IF NOT EXISTS nif text;
