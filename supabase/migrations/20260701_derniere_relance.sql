-- Migration : Relances groupées (bouton « Relancer tous les impayés »)
-- À exécuter dans le SQL Editor de Supabase Dashboard

-- Mémorise la date de dernière relance envoyée à un locataire.
-- Sert de garde-fou anti-spam : on ne relance pas deux fois le même
-- locataire dans un intervalle de DELAI_RELANCE_JOURS (8 jours).
ALTER TABLE locataires ADD COLUMN IF NOT EXISTS derniere_relance TIMESTAMPTZ;
