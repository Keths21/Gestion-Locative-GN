-- Tout ce que le proxy doit savoir, en un seul aller-retour.
--
-- Il s'exécute à chaque requête : y ajouter un appel, c'est l'ajouter à chaque
-- page de chaque utilisateur. Le proxy lisait déjà `profiles` ; il lit désormais
-- le rôle, le statut du compte ET l'abonnement d'un coup, sans coût
-- supplémentaire.
CREATE OR REPLACE FUNCTION public.etat_acces()
RETURNS TABLE (
  role             TEXT,
  statut_compte    TEXT,
  organisation_id  UUID,
  acces_jusqu_au   TIMESTAMPTZ,
  abonnement_actif BOOLEAN,
  a_deja_paye      BOOLEAN
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.role,
         p.status,
         a.organisation_id,
         a.acces_jusqu_au,
         -- Dérivé de la date, jamais stocké : un booléen figé serait faux dès
         -- la seconde suivante.
         COALESCE(a.acces_jusqu_au > now(), false),
         COALESCE(a.a_deja_paye, false)
    FROM public.profiles p
    -- LEFT JOIN : un compte sans organisation doit rester lisible par le proxy,
    -- sinon il perdrait aussi son rôle et son statut, et se retrouverait
    -- déconnecté sans explication.
    LEFT JOIN public.membres m ON m.user_id = p.id
    LEFT JOIN public.abonnements a ON a.organisation_id = m.organisation_id
   WHERE p.id = auth.uid()
   ORDER BY m.cree_le
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.etat_acces() TO anon, authenticated;

-- Une organisation qui a déjà réglé quelque chose n'est pas vide : son
-- historique de paiement est une pièce comptable, pas une donnée d'usage.
--
-- Oubli introduit en ajoutant les tables d'abonnement après avoir écrit cette
-- fonction : sans ce complément, une organisation n'ayant que des règlements
-- passait pour vide et se faisait effacer, emportant sa comptabilité.
--
-- `abonnements` n'y figure PAS volontairement — chaque organisation en a un dès
-- sa création, il ne dit donc rien de son activité.
CREATE OR REPLACE FUNCTION public.organisation_est_vide(org UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.biens                WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.locataires           WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.paiements            WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.parametres           WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.parcelles            WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.parcelle_documents   WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.journal_parcelles    WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.chantiers            WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.intervenants         WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.paiements_abonnement WHERE organisation_id = org);
$$;
