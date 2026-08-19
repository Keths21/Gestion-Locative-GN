-- ============================================================================
--  Module Travaux & Chantier · Lot A — socle et modèle d'accès
--
--  Deux décisions du 19/08/2026 structurent ce schéma :
--
--  1. Un chantier peut exister SANS bien ni parcelle. Il porte donc sa propre
--     localisation et son propre repère : sans cela, les photos et
--     signalements géolocalisés du journal n'auraient aucun ancrage. Les liens
--     vers `biens` et `parcelles` sont nullables et modifiables — la séquence
--     réelle étant : construire, obtenir le titre, enregistrer la parcelle,
--     puis relier.
--
--  2. Le partage d'accès à un chantier est intégré dès le socle. La RLS ne
--     peut donc plus se limiter à l'appartenance à l'organisation : il faut
--     une double voie — membre de l'organisation, OU accès explicite et non
--     expiré à ce chantier précis.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Chantiers
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chantiers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,

  -- Rattachements facultatifs, et modifiables à tout moment.
  bien_id            UUID REFERENCES public.biens(id) ON DELETE SET NULL,
  parcelle_id        UUID REFERENCES public.parcelles(id) ON DELETE SET NULL,

  nom                TEXT NOT NULL,
  reference          TEXT,
  nature             TEXT NOT NULL DEFAULT 'construction'
                     CHECK (nature IN ('construction', 'renovation', 'extension', 'amenagement')),
  statut             TEXT NOT NULL DEFAULT 'prevu'
                     CHECK (statut IN ('prevu', 'en_cours', 'suspendu', 'livre', 'abandonne')),
  description        TEXT,

  -- Localisation propre : un chantier autonome ne peut l'emprunter à personne.
  pays               TEXT DEFAULT 'Guinée',
  region             TEXT,
  prefecture         TEXT,
  commune            TEXT,
  quartier           TEXT,
  adresse            TEXT,
  point_geom         extensions.geometry(Point, 4326),
  point_json         JSONB,

  -- Cadre financier. La réserve d'imprévus est distincte du budget : c'est
  -- elle qui répond à « combien puis-je encore absorber sans rallonge ? ».
  budget_initial     NUMERIC(18, 2),
  reserve_imprevus   NUMERIC(18, 2) DEFAULT 0,
  devise             TEXT DEFAULT 'GNF',

  date_debut_prevue  DATE,
  date_fin_prevue    DATE,
  date_debut_reelle  DATE,
  date_fin_reelle    DATE,

  cree_par           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cree_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  supprime_le        TIMESTAMPTZ,
  version            INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS chantiers_org_idx      ON public.chantiers (organisation_id);
CREATE INDEX IF NOT EXISTS chantiers_bien_idx     ON public.chantiers (bien_id);
CREATE INDEX IF NOT EXISTS chantiers_parcelle_idx ON public.chantiers (parcelle_id);
CREATE INDEX IF NOT EXISTS chantiers_statut_idx   ON public.chantiers (organisation_id, statut);
CREATE INDEX IF NOT EXISTS chantiers_point_gix    ON public.chantiers USING GIST (point_geom);

-- ----------------------------------------------------------------------------
--  Accès explicite à un chantier
--
--  Destiné au maître d'œuvre, à l'architecte ou au co-propriétaire : un accès
--  restreint à UN chantier, sans appartenance à l'organisation, et daté.
--
--  L'invitation se fait par adresse e-mail, car l'intéressé n'a pas forcément
--  encore de compte. `user_id` est renseigné à la première connexion.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.acces_chantier (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'lecteur'
               CHECK (role IN ('lecteur', 'contributeur')),
  -- NULL = sans limite de durée. Un accès daté s'éteint seul, sans qu'on ait
  -- à penser à le révoquer : c'est le comportement sûr par défaut.
  expire_le    TIMESTAMPTZ,
  invite_par   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS acces_chantier_unique
  ON public.acces_chantier (chantier_id, lower(email));
CREATE INDEX IF NOT EXISTS acces_chantier_user_idx ON public.acces_chantier (user_id);

-- ----------------------------------------------------------------------------
--  Fonctions d'accès
--
--  SECURITY DEFINER, comme les fonctions d'appartenance : une policy posée sur
--  `chantiers` qui interrogerait `chantiers` en invoker partirait en récursion
--  infinie de RLS.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.acces_chantier_lecture(c UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    -- Voie 1 : membre de l'organisation propriétaire du chantier
    SELECT 1 FROM public.chantiers ch
     WHERE ch.id = c AND public.est_membre(ch.organisation_id)
  ) OR EXISTS (
    -- Voie 2 : accès explicite, encore valide
    SELECT 1 FROM public.acces_chantier a
     WHERE a.chantier_id = c
       AND a.user_id = auth.uid()
       AND (a.expire_le IS NULL OR a.expire_le > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.acces_chantier_ecriture(c UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chantiers ch
     WHERE ch.id = c AND public.peut_ecrire(ch.organisation_id)
  ) OR EXISTS (
    SELECT 1 FROM public.acces_chantier a
     WHERE a.chantier_id = c
       AND a.user_id = auth.uid()
       AND a.role = 'contributeur'
       AND (a.expire_le IS NULL OR a.expire_le > now())
  );
$$;

-- Rattache les invitations en attente au compte qui vient de se connecter.
-- Appelée par l'application ; sans elle, une invitation émise avant la
-- création du compte resterait lettre morte.
CREATE OR REPLACE FUNCTION public.lier_invitations_chantier()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT;
  v_n     INTEGER;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN 0; END IF;

  UPDATE public.acces_chantier
     SET user_id = auth.uid()
   WHERE user_id IS NULL AND lower(email) = v_email;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ----------------------------------------------------------------------------
--  Déclencheurs
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.maj_chantier()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, extensions AS $$
BEGIN
  NEW.point_json := CASE WHEN NEW.point_geom IS NULL
                         THEN NULL ELSE ST_AsGeoJSON(NEW.point_geom)::jsonb END;

  IF TG_OP = 'UPDATE' THEN
    NEW.modifie_le := now();
    IF NEW.version = OLD.version THEN
      NEW.version := OLD.version + 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maj_chantier ON public.chantiers;
CREATE TRIGGER trg_maj_chantier BEFORE INSERT OR UPDATE ON public.chantiers
  FOR EACH ROW EXECUTE FUNCTION public.maj_chantier();

DROP TRIGGER IF EXISTS trg_org_chantiers ON public.chantiers;
CREATE TRIGGER trg_org_chantiers BEFORE INSERT ON public.chantiers
  FOR EACH ROW EXECUTE FUNCTION public.remplir_organisation();

-- ----------------------------------------------------------------------------
--  RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.chantiers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acces_chantier ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture des chantiers"     ON public.chantiers;
DROP POLICY IF EXISTS "Creation de chantier"      ON public.chantiers;
DROP POLICY IF EXISTS "Modification de chantier"  ON public.chantiers;
DROP POLICY IF EXISTS "Suppression de chantier"   ON public.chantiers;

CREATE POLICY "Lecture des chantiers" ON public.chantiers
  FOR SELECT USING (public.acces_chantier_lecture(id));

-- La création reste réservée à l'organisation : un invité ne crée pas de
-- chantier, il contribue à celui auquel on l'a convié.
CREATE POLICY "Creation de chantier" ON public.chantiers
  FOR INSERT WITH CHECK (public.peut_ecrire(organisation_id));

CREATE POLICY "Modification de chantier" ON public.chantiers
  FOR UPDATE USING (public.acces_chantier_ecriture(id))
          WITH CHECK (public.acces_chantier_ecriture(id));

CREATE POLICY "Suppression de chantier" ON public.chantiers
  FOR DELETE USING (public.peut_ecrire(organisation_id));

DROP POLICY IF EXISTS "Lecture des acces"  ON public.acces_chantier;
DROP POLICY IF EXISTS "Gestion des acces"  ON public.acces_chantier;

-- Un invité voit sa propre invitation ; l'organisation voit toutes celles
-- qu'elle a émises.
CREATE POLICY "Lecture des acces" ON public.acces_chantier
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.chantiers ch
                WHERE ch.id = chantier_id AND public.est_membre(ch.organisation_id))
  );

CREATE POLICY "Gestion des acces" ON public.acces_chantier
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.chantiers ch
             WHERE ch.id = chantier_id AND public.peut_ecrire(ch.organisation_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.chantiers ch
             WHERE ch.id = chantier_id AND public.peut_ecrire(ch.organisation_id))
  );

-- ----------------------------------------------------------------------------
--  Rapprochement géographique
--
--  À l'enregistrement d'une parcelle, proposer les chantiers voisins plutôt
--  que de laisser créer un doublon.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chantiers_proches(lon FLOAT8, lat FLOAT8, rayon_m FLOAT8 DEFAULT 200)
RETURNS TABLE (id UUID, nom TEXT, distance_m FLOAT8)
LANGUAGE SQL STABLE SECURITY INVOKER
SET search_path = public, extensions AS $$
  SELECT c.id, c.nom,
         ST_Distance(c.point_geom::geography,
                     ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography)
    FROM public.chantiers c
   WHERE c.supprime_le IS NULL
     AND c.point_geom IS NOT NULL
     AND ST_DWithin(c.point_geom::geography,
                    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography, rayon_m)
   ORDER BY 3;
$$;

-- ----------------------------------------------------------------------------
--  Vue de lecture : GeoJSON plutôt que WKB, comme pour les parcelles
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_chantiers;
CREATE VIEW public.v_chantiers WITH (security_invoker = true) AS
SELECT id, organisation_id, bien_id, parcelle_id, nom, reference, nature, statut, description,
       pays, region, prefecture, commune, quartier, adresse,
       point_json AS point_geom,
       budget_initial::float8   AS budget_initial,
       reserve_imprevus::float8 AS reserve_imprevus,
       devise, date_debut_prevue, date_fin_prevue, date_debut_reelle, date_fin_reelle,
       cree_par, cree_le, modifie_le, supprime_le, version
  FROM public.chantiers;
