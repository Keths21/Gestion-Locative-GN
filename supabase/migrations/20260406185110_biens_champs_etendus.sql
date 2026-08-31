-- Champs étendus des biens : caractéristiques, charges incluses, et le second
-- mode de location (nuitée) à côté du mois.
--
-- Rapatrié depuis l'historique Supabase le 31/08/2026 : appliqué en base le
-- 06/04/2026, il n'avait jamais été versionné.

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS mode_location text NOT NULL DEFAULT 'appartement' CHECK (mode_location IN ('appartement', 'airbnb')),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS nombre_pieces integer,
  ADD COLUMN IF NOT EXISTS etage integer,
  ADD COLUMN IF NOT EXISTS meuble boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_disponibilite date,
  ADD COLUMN IF NOT EXISTS parking boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ascenseur boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gardien boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS eau_incluse boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS electricite_incluse boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS internet_inclus boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS climatisation boolean DEFAULT false,
  -- Location au mois
  ADD COLUMN IF NOT EXISTS duree_min_mois integer,
  ADD COLUMN IF NOT EXISTS depot_garantie_mois integer,
  -- Location à la nuitée
  ADD COLUMN IF NOT EXISTS prix_nuit numeric,
  ADD COLUMN IF NOT EXISTS duree_min_nuits integer,
  ADD COLUMN IF NOT EXISTS max_voyageurs integer,
  ADD COLUMN IF NOT EXISTS heure_checkin text,
  ADD COLUMN IF NOT EXISTS heure_checkout text,
  ADD COLUMN IF NOT EXISTS regles_maison text;
