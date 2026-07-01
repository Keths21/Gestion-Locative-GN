-- Migration : Génération automatique des échéances de loyer
-- À exécuter dans le SQL Editor de Supabase Dashboard

-- Une échéance générée (loyer dû, pas encore réglé) n'a pas de date de paiement.
-- On rend donc date_paiement nullable : elle reste NULL tant que le loyer
-- n'est pas encaissé, et prend la date du jour au moment du règlement.
ALTER TABLE paiements ALTER COLUMN date_paiement DROP NOT NULL;

-- Index pour retrouver rapidement l'échéance d'un locataire pour un mois donné
-- (utilisé par la génération idempotente et la réconciliation des paiements).
CREATE INDEX IF NOT EXISTS idx_paiements_loc_mois
  ON paiements(locataire_id, mois_concerne);
