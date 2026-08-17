-- ============================================================================
--  Lot 1 · étape 1/3 — Socle multi-organisation
--
--  Introduit la notion d'organisation partagée, préalable au module de
--  cartographie foncière et au travail à plusieurs sur un même portefeuille.
--
--  Principe de sûreté : une organisation est créée par utilisateur existant,
--  avec l'identifiant de l'utilisateur comme identifiant d'organisation. La
--  reprise est donc déterministe et rejouable, et la visibilité des données
--  reste rigoureusement identique à l'existant (chacun reste seul membre de
--  son organisation tant que personne n'est invité).
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organisations (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom     TEXT NOT NULL,
  pays    TEXT NOT NULL DEFAULT 'Guinée',
  devise  TEXT NOT NULL DEFAULT 'GNF',
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.membres (
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'lecteur'
                  CHECK (role IN ('proprietaire', 'editeur', 'lecteur')),
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, user_id)
);

CREATE INDEX IF NOT EXISTS membres_user_idx ON public.membres (user_id);

-- ----------------------------------------------------------------------------
--  Fonctions d'appartenance
--
--  SECURITY DEFINER est indispensable : une policy posée sur `membres` qui
--  interrogerait `membres` en SECURITY INVOKER déclencherait une récursion
--  infinie de RLS. Ces fonctions ne lisent que l'appartenance de l'appelant
--  (filtre sur auth.uid()), elles n'exposent donc rien de plus que ce que
--  l'appelant a déjà le droit de voir.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.est_membre(org UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.membres
     WHERE organisation_id = org AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.peut_ecrire(org UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.membres
     WHERE organisation_id = org AND user_id = auth.uid()
       AND role IN ('proprietaire', 'editeur')
  );
$$;

CREATE OR REPLACE FUNCTION public.est_proprietaire(org UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.membres
     WHERE organisation_id = org AND user_id = auth.uid()
       AND role = 'proprietaire'
  );
$$;

-- Organisation retenue par défaut quand le client ne la précise pas.
-- Tant qu'un utilisateur n'appartient qu'à une organisation, elle est
-- univoque ; dès qu'il en aura plusieurs, le client devra la transmettre.
CREATE OR REPLACE FUNCTION public.organisation_courante()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organisation_id FROM public.membres
   WHERE user_id = auth.uid()
   ORDER BY cree_le, organisation_id
   LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
--  Remplissage automatique de organisation_id
--
--  Ce déclencheur est ce qui permet à l'application existante de continuer à
--  écrire sans la moindre modification de code : elle n'envoie pas encore
--  organisation_id, la base le déduit de l'appartenance de l'appelant.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remplir_organisation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    NEW.organisation_id := public.organisation_courante();
  END IF;
  IF NEW.organisation_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation rattachée à cet utilisateur.';
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
--  Reprise : une organisation par utilisateur existant
-- ----------------------------------------------------------------------------

INSERT INTO public.organisations (id, nom)
SELECT pr.id,
       COALESCE(NULLIF(TRIM(pa.nom_agence), ''),
                NULLIF(TRIM(pr.full_name), ''),
                pr.email,
                'Mon agence')
  FROM public.profiles pr
  LEFT JOIN public.parametres pa ON pa.user_id = pr.id
 ON CONFLICT (id) DO NOTHING;

INSERT INTO public.membres (organisation_id, user_id, role)
SELECT pr.id, pr.id, 'proprietaire'
  FROM public.profiles pr
 ON CONFLICT (organisation_id, user_id) DO NOTHING;

-- ----------------------------------------------------------------------------
--  RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membres       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membres lisent leur organisation"      ON public.organisations;
DROP POLICY IF EXISTS "Proprietaires modifient organisation"  ON public.organisations;
DROP POLICY IF EXISTS "Membres lisent la liste des membres"   ON public.membres;
DROP POLICY IF EXISTS "Proprietaires gerent les membres"      ON public.membres;

CREATE POLICY "Membres lisent leur organisation" ON public.organisations
  FOR SELECT USING (public.est_membre(id));

CREATE POLICY "Proprietaires modifient organisation" ON public.organisations
  FOR UPDATE USING (public.est_proprietaire(id))
          WITH CHECK (public.est_proprietaire(id));

CREATE POLICY "Membres lisent la liste des membres" ON public.membres
  FOR SELECT USING (public.est_membre(organisation_id));

CREATE POLICY "Proprietaires gerent les membres" ON public.membres
  FOR ALL USING (public.est_proprietaire(organisation_id))
          WITH CHECK (public.est_proprietaire(organisation_id));
