-- Abonnement premium, payé par SASPay.
--
-- SASPay ne fait PAS de prélèvement récurrent : il n'expose que des paiements
-- ponctuels (`/checkout-sessions/`). Ce n'est donc pas un abonnement au sens
-- Stripe, mais un DROIT D'ACCÈS PRÉPAYÉ que le client renouvelle lui-même.
--
-- D'où le choix central de ce schéma : `acces_jusqu_au` est la seule source de
-- vérité. Tout le reste — statut affiché, relances, blocage — s'en déduit. Un
-- booléen « est_premium » aurait été plus simple et faux : il ne dit pas quand
-- l'accès s'arrête, et deux sources de vérité finissent toujours par diverger.

-- L'abonnement appartient à l'ORGANISATION, pas à l'utilisateur : les données
-- sont cloisonnées par organisation, et une agence dont deux employés paieraient
-- chacun de leur côté n'aurait aucun sens.
CREATE TABLE IF NOT EXISTS public.abonnements (
  organisation_id  UUID PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,

  -- Fin de l'accès. NULL n'arrive jamais : l'essai la pose à la création.
  acces_jusqu_au   TIMESTAMPTZ NOT NULL,

  -- Distingue un essai jamais payé d'un abonnement échu — même blocage, mais
  -- pas le même message, ni la même relance commerciale.
  a_deja_paye      BOOLEAN NOT NULL DEFAULT false,

  derniere_relance_le TIMESTAMPTZ,
  cree_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abonnements_acces_idx ON public.abonnements (acces_jusqu_au);

-- Journal des transactions SASPay. Table séparée de `abonnements` à dessein :
-- l'une porte l'état courant, l'autre l'historique comptable. Les mêler
-- rendrait impossible de répondre à « qu'a-t-il payé, et quand ».
CREATE TABLE IF NOT EXISTS public.paiements_abonnement (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,

  -- Identifiant de la session de paiement SASPay. UNIQUE, et c'est ce qui rend
  -- l'ensemble sûr : /checkout-sessions/ n'a AUCUNE idempotence (deux appels
  -- créent deux sessions), et les webhooks sont réémis jusqu'à cinq fois. Sans
  -- cette contrainte, une relance de webhook offrirait un mois de plus.
  session_id       TEXT NOT NULL UNIQUE,
  reference        TEXT,

  montant          NUMERIC(18,2) NOT NULL,
  devise           TEXT NOT NULL DEFAULT 'GNF',

  statut           TEXT NOT NULL DEFAULT 'en_attente'
                   CHECK (statut IN ('en_attente', 'reussi', 'echoue', 'annule')),

  -- Ce que ce paiement a ouvert. Renseigné à l'encaissement, pas à la création :
  -- une session abandonnée n'a acheté aucune période.
  periode_debut    TIMESTAMPTZ,
  periode_fin      TIMESTAMPTZ,

  -- Montants renvoyés par le webhook : `charged` est ce que le payeur débourse,
  -- `net_amount` ce qui vous revient. Les confondre fausse la comptabilité dès
  -- que les frais sont en ADD_ON.
  montant_debite   NUMERIC(18,2),
  montant_net      NUMERIC(18,2),
  frais            NUMERIC(18,2),

  -- Charge brute du webhook, conservée telle quelle : quand un paiement est
  -- contesté, c'est la seule pièce qui fasse foi.
  charge_brute     JSONB,

  cree_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
  paye_le          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS paiements_abonnement_org_idx
  ON public.paiements_abonnement (organisation_id, cree_le DESC);

DROP TRIGGER IF EXISTS trg_maj_abonnements ON public.abonnements;
CREATE TRIGGER trg_maj_abonnements BEFORE UPDATE ON public.abonnements
  FOR EACH ROW EXECUTE FUNCTION public.maj_modifie_le();

-- --- RLS -------------------------------------------------------------------
-- Lecture par les membres, écriture par personne : seul le webhook, qui passe
-- par la clé de service, modifie un abonnement. Laisser un client écrire sur
-- sa propre date d'accès reviendrait à lui vendre le produit.
ALTER TABLE public.abonnements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements_abonnement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membres lisent leur abonnement" ON public.abonnements;
CREATE POLICY "Membres lisent leur abonnement" ON public.abonnements
  FOR SELECT USING (public.est_membre(organisation_id));

DROP POLICY IF EXISTS "Membres lisent leurs paiements d abonnement" ON public.paiements_abonnement;
CREATE POLICY "Membres lisent leurs paiements d abonnement" ON public.paiements_abonnement
  FOR SELECT USING (public.est_membre(organisation_id));
