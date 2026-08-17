-- ============================================================================
--  Lot 1 · étape 3/3 — PostGIS et table des parcelles
--
--  Table foncière autonome, reliée au locatif par un bien_id facultatif.
--  Aucune modification de la table `biens`.
--
--  Deux choix structurants :
--
--  1. `geom` (geometry) reste la source de vérité et porte l'index GIST ;
--     `geom_json` en est le miroir GeoJSON, entretenu par le même
--     déclencheur que les métriques. On préfère le déclencheur à une
--     colonne générée : cela évite de dépendre de la volatilité déclarée
--     de ST_AsGeoJSON, qui varie selon les versions de PostGIS.
--
--  2. La vue `v_parcelles` expose tout sauf les colonnes geometry brutes,
--     pour qu'un `select=*` depuis PostgREST renvoie du GeoJSON exploitable
--     et non du WKB hexadécimal. Elle est en security_invoker : la RLS de
--     la table sous-jacente s'applique intégralement.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
--  Parcelles
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.parcelles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,

  -- Rattachement facultatif à un bien locatif
  bien_id                UUID REFERENCES public.biens(id) ON DELETE SET NULL,

  -- Identification
  nom                    TEXT NOT NULL,
  reference              TEXT,
  type                   TEXT NOT NULL DEFAULT 'terrain_nu'
                         CHECK (type IN ('terrain_nu', 'terrain_bati', 'agricole',
                                         'commercial', 'industriel', 'mixte', 'autre')),
  statut                 TEXT NOT NULL DEFAULT 'possede'
                         CHECK (statut IN ('possede', 'en_vente', 'vendu', 'loue',
                                           'reserve', 'prospect')),
  statut_juridique       TEXT NOT NULL DEFAULT 'inconnu'
                         CHECK (statut_juridique IN ('titre_foncier', 'permis_habiter',
                                                     'attestation_vente', 'bail',
                                                     'droit_coutumier', 'litige', 'inconnu')),
  description            TEXT,

  -- Localisation administrative
  pays                   TEXT DEFAULT 'Guinée',
  region                 TEXT,
  prefecture             TEXT,
  commune                TEXT,
  quartier               TEXT,
  adresse                TEXT,

  -- Géométrie (WGS84)
  geom                   extensions.geometry(Polygon, 4326),
  point_geom             extensions.geometry(Point, 4326),
  geom_json              JSONB,
  point_json             JSONB,

  -- Métriques géodésiques, calculées en base
  superficie_m2          DOUBLE PRECISION,
  perimetre_m            DOUBLE PRECISION,
  superficie_declaree_m2 DOUBLE PRECISION,

  -- Données financières
  prix_achat             NUMERIC(18, 2),
  valeur_estimee         NUMERIC(18, 2),
  devise                 TEXT DEFAULT 'GNF',
  date_acquisition       DATE,

  -- Parties prenantes
  proprietaire           TEXT,
  occupant               TEXT,
  contact_telephone      TEXT,

  -- Présentation et traçabilité
  couleur                TEXT NOT NULL DEFAULT '#f59e0b',
  tags                   TEXT[] NOT NULL DEFAULT '{}',
  source_trace           TEXT NOT NULL DEFAULT 'manuel'
                         CHECK (source_trace IN ('manuel', 'gps_marche', 'coordonnees', 'import')),
  precision_m            DOUBLE PRECISION,

  cree_par               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cree_le                TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
  supprime_le            TIMESTAMPTZ,          -- suppression logique, nécessaire à la synchro
  version                INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS parcelles_org_idx     ON public.parcelles (organisation_id);
CREATE INDEX IF NOT EXISTS parcelles_modifie_idx ON public.parcelles (organisation_id, modifie_le DESC);
CREATE INDEX IF NOT EXISTS parcelles_bien_idx    ON public.parcelles (bien_id);
CREATE INDEX IF NOT EXISTS parcelles_geom_gix    ON public.parcelles USING GIST (geom);
CREATE INDEX IF NOT EXISTS parcelles_point_gix   ON public.parcelles USING GIST (point_geom);
CREATE INDEX IF NOT EXISTS parcelles_nom_idx     ON public.parcelles (organisation_id, lower(nom));
CREATE INDEX IF NOT EXISTS parcelles_tags_idx    ON public.parcelles USING GIN (tags);

-- ----------------------------------------------------------------------------
--  Documents rattachés
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.parcelle_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcelle_id      UUID NOT NULL REFERENCES public.parcelles(id) ON DELETE CASCADE,
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  nom              TEXT NOT NULL,
  categorie        TEXT NOT NULL DEFAULT 'photo'
                   CHECK (categorie IN ('photo', 'titre', 'plan', 'contrat', 'facture', 'autre')),
  chemin           TEXT NOT NULL,          -- clé dans le bucket Storage
  mime             TEXT,
  taille_octets    BIGINT,
  lat              DOUBLE PRECISION,       -- géotag éventuel de la photo
  lon              DOUBLE PRECISION,
  cree_par         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cree_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parcelle_documents_parcelle_idx ON public.parcelle_documents (parcelle_id);
CREATE INDEX IF NOT EXISTS parcelle_documents_org_idx      ON public.parcelle_documents (organisation_id);

-- ----------------------------------------------------------------------------
--  Journal (audit léger)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_parcelles (
  id               BIGSERIAL PRIMARY KEY,
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  parcelle_id      UUID,
  user_id          UUID,
  action           TEXT NOT NULL,
  details          JSONB,
  cree_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_parcelles_org_idx ON public.journal_parcelles (organisation_id, cree_le DESC);

-- ----------------------------------------------------------------------------
--  Recalcul des métriques géodésiques
--
--  ST_Area(geography) renvoie des mètres carrés réels, pas des degrés carrés.
--  ST_PointOnSurface garantit un repère à l'intérieur du polygone, ce que le
--  centroïde ne fait pas sur une parcelle concave ou en L.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.maj_metriques_parcelle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, extensions AS $$
BEGIN
  IF NEW.geom IS NOT NULL THEN
    NEW.superficie_m2 := ST_Area(NEW.geom::geography);
    NEW.perimetre_m   := ST_Perimeter(NEW.geom::geography);
    NEW.point_geom    := ST_PointOnSurface(NEW.geom);
    NEW.geom_json     := ST_AsGeoJSON(NEW.geom)::jsonb;
  ELSE
    NEW.superficie_m2 := NULL;
    NEW.perimetre_m   := NULL;
    NEW.geom_json     := NULL;
  END IF;

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

DROP TRIGGER IF EXISTS trg_maj_metriques_parcelle ON public.parcelles;
CREATE TRIGGER trg_maj_metriques_parcelle
  BEFORE INSERT OR UPDATE ON public.parcelles
  FOR EACH ROW EXECUTE FUNCTION public.maj_metriques_parcelle();

DROP TRIGGER IF EXISTS trg_org_parcelles ON public.parcelles;
CREATE TRIGGER trg_org_parcelles BEFORE INSERT ON public.parcelles
  FOR EACH ROW EXECUTE FUNCTION public.remplir_organisation();

DROP TRIGGER IF EXISTS trg_org_parcelle_documents ON public.parcelle_documents;
CREATE TRIGGER trg_org_parcelle_documents BEFORE INSERT ON public.parcelle_documents
  FOR EACH ROW EXECUTE FUNCTION public.remplir_organisation();

-- ----------------------------------------------------------------------------
--  RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.parcelles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_parcelles  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membres lisent les parcelles"        ON public.parcelles;
DROP POLICY IF EXISTS "Redacteurs creent des parcelles"     ON public.parcelles;
DROP POLICY IF EXISTS "Redacteurs modifient les parcelles"  ON public.parcelles;
DROP POLICY IF EXISTS "Redacteurs suppriment les parcelles" ON public.parcelles;

CREATE POLICY "Membres lisent les parcelles" ON public.parcelles
  FOR SELECT USING (public.est_membre(organisation_id));
CREATE POLICY "Redacteurs creent des parcelles" ON public.parcelles
  FOR INSERT WITH CHECK (public.peut_ecrire(organisation_id));
CREATE POLICY "Redacteurs modifient les parcelles" ON public.parcelles
  FOR UPDATE USING (public.peut_ecrire(organisation_id))
          WITH CHECK (public.peut_ecrire(organisation_id));
CREATE POLICY "Redacteurs suppriment les parcelles" ON public.parcelles
  FOR DELETE USING (public.peut_ecrire(organisation_id));

DROP POLICY IF EXISTS "Membres lisent les documents"    ON public.parcelle_documents;
DROP POLICY IF EXISTS "Redacteurs gerent les documents" ON public.parcelle_documents;

CREATE POLICY "Membres lisent les documents" ON public.parcelle_documents
  FOR SELECT USING (public.est_membre(organisation_id));
CREATE POLICY "Redacteurs gerent les documents" ON public.parcelle_documents
  FOR ALL USING (public.peut_ecrire(organisation_id))
          WITH CHECK (public.peut_ecrire(organisation_id));

DROP POLICY IF EXISTS "Membres lisent le journal" ON public.journal_parcelles;
DROP POLICY IF EXISTS "Membres ecrivent au journal" ON public.journal_parcelles;

CREATE POLICY "Membres lisent le journal" ON public.journal_parcelles
  FOR SELECT USING (public.est_membre(organisation_id));
CREATE POLICY "Membres ecrivent au journal" ON public.journal_parcelles
  FOR INSERT WITH CHECK (public.est_membre(organisation_id));

-- ----------------------------------------------------------------------------
--  Vue de lecture
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_parcelles;
CREATE VIEW public.v_parcelles WITH (security_invoker = true) AS
SELECT id, organisation_id, bien_id, nom, reference, type, statut, statut_juridique,
       description, pays, region, prefecture, commune, quartier, adresse,
       geom_json  AS geom,
       point_json AS point_geom,
       superficie_m2, perimetre_m, superficie_declaree_m2,
       prix_achat::float8    AS prix_achat,
       valeur_estimee::float8 AS valeur_estimee,
       devise, date_acquisition, proprietaire, occupant, contact_telephone,
       couleur, tags, source_trace, precision_m,
       cree_par, cree_le, modifie_le, supprime_le, version
  FROM public.parcelles;

-- ----------------------------------------------------------------------------
--  Écriture : upsert idempotent, transposé de enregistrerBien()
--
--  SECURITY INVOKER : la RLS s'applique. Idempotente sur l'identifiant, elle
--  sert donc aussi bien à la création hors-ligne (identifiant généré par le
--  client) qu'à la synchronisation et à la reprise de données du lot 6.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enregistrer_parcelle(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, extensions AS $$
DECLARE
  v_id     UUID := COALESCE((p->>'id')::uuid, gen_random_uuid());
  v_org    UUID := COALESCE((p->>'organisation_id')::uuid, public.organisation_courante());
  v_geom   extensions.geometry(Polygon, 4326);
  v_point  extensions.geometry(Point, 4326);
  v_tags   TEXT[];
  v_result JSONB;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation rattachée à cet utilisateur.';
  END IF;

  IF jsonb_typeof(p->'geom') = 'object' THEN
    v_geom := ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(p->>'geom'), 4326));
    IF NOT ST_IsValid(v_geom) THEN
      RAISE EXCEPTION 'Tracé invalide : %', ST_IsValidReason(v_geom);
    END IF;
  END IF;

  IF jsonb_typeof(p->'point_geom') = 'object' THEN
    v_point := ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(p->>'point_geom'), 4326));
  END IF;

  v_tags := COALESCE(
    (SELECT array_agg(t.value #>> '{}') FROM jsonb_array_elements(p->'tags') AS t
      WHERE jsonb_typeof(p->'tags') = 'array'),
    '{}'::text[]);

  INSERT INTO public.parcelles AS pa (
    id, organisation_id, cree_par, bien_id, nom, reference, type, statut, statut_juridique,
    description, pays, region, prefecture, commune, quartier, adresse,
    superficie_declaree_m2, prix_achat, valeur_estimee, devise, date_acquisition,
    proprietaire, occupant, contact_telephone, couleur, tags, source_trace, precision_m,
    geom, point_geom)
  VALUES (
    v_id, v_org, auth.uid(), (p->>'bien_id')::uuid,
    COALESCE(NULLIF(TRIM(p->>'nom'), ''), 'Parcelle sans nom'),
    p->>'reference',
    COALESCE(p->>'type', 'terrain_nu'),
    COALESCE(p->>'statut', 'possede'),
    COALESCE(p->>'statut_juridique', 'inconnu'),
    p->>'description',
    COALESCE(p->>'pays', 'Guinée'),
    p->>'region', p->>'prefecture', p->>'commune', p->>'quartier', p->>'adresse',
    (p->>'superficie_declaree_m2')::float8,
    (p->>'prix_achat')::numeric,
    (p->>'valeur_estimee')::numeric,
    COALESCE(p->>'devise', 'GNF'),
    (p->>'date_acquisition')::date,
    p->>'proprietaire', p->>'occupant', p->>'contact_telephone',
    COALESCE(p->>'couleur', '#f59e0b'),
    v_tags,
    COALESCE(p->>'source_trace', 'manuel'),
    (p->>'precision_m')::float8,
    v_geom, v_point)
  ON CONFLICT (id) DO UPDATE SET
    bien_id                = EXCLUDED.bien_id,
    nom                    = EXCLUDED.nom,
    reference              = EXCLUDED.reference,
    type                   = EXCLUDED.type,
    statut                 = EXCLUDED.statut,
    statut_juridique       = EXCLUDED.statut_juridique,
    description            = EXCLUDED.description,
    pays                   = EXCLUDED.pays,
    region                 = EXCLUDED.region,
    prefecture             = EXCLUDED.prefecture,
    commune                = EXCLUDED.commune,
    quartier               = EXCLUDED.quartier,
    adresse                = EXCLUDED.adresse,
    superficie_declaree_m2 = EXCLUDED.superficie_declaree_m2,
    prix_achat             = EXCLUDED.prix_achat,
    valeur_estimee         = EXCLUDED.valeur_estimee,
    devise                 = EXCLUDED.devise,
    date_acquisition       = EXCLUDED.date_acquisition,
    proprietaire           = EXCLUDED.proprietaire,
    occupant               = EXCLUDED.occupant,
    contact_telephone      = EXCLUDED.contact_telephone,
    couleur                = EXCLUDED.couleur,
    tags                   = EXCLUDED.tags,
    source_trace           = EXCLUDED.source_trace,
    precision_m            = EXCLUDED.precision_m,
    geom                   = EXCLUDED.geom,
    point_geom             = EXCLUDED.point_geom,
    supprime_le            = NULL;

  SELECT to_jsonb(v) INTO v_result FROM public.v_parcelles v WHERE v.id = v_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Enregistrement refusé : parcelle inaccessible pour cet utilisateur.';
  END IF;

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
--  Lecture analytique
--  Ces deux fonctions sont en SECURITY INVOKER : la RLS restreint d'elle-même
--  le périmètre aux organisations de l'appelant, aucun filtre explicite n'est
--  nécessaire ni souhaitable.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.statistiques_parcelles()
RETURNS JSONB LANGUAGE SQL STABLE SECURITY INVOKER
SET search_path = public, extensions AS $$
  SELECT jsonb_build_object(
    'nombre',              (SELECT count(*) FROM public.parcelles WHERE supprime_le IS NULL),
    'superficie_totale_m2',(SELECT COALESCE(sum(superficie_m2), 0) FROM public.parcelles WHERE supprime_le IS NULL),
    'valeur_totale',       (SELECT COALESCE(sum(COALESCE(valeur_estimee, prix_achat)), 0)::float8 FROM public.parcelles WHERE supprime_le IS NULL),
    'sans_trace',          (SELECT count(*) FROM public.parcelles WHERE supprime_le IS NULL AND geom IS NULL),
    'par_statut',          (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
                              SELECT statut, count(*) AS nombre, COALESCE(sum(superficie_m2), 0) AS superficie_m2
                                FROM public.parcelles WHERE supprime_le IS NULL
                               GROUP BY statut ORDER BY count(*) DESC) x),
    'par_type',            (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
                              SELECT type, count(*) AS nombre, COALESCE(sum(superficie_m2), 0) AS superficie_m2
                                FROM public.parcelles WHERE supprime_le IS NULL
                               GROUP BY type ORDER BY count(*) DESC) x));
$$;

-- Parcelles qui se superposent : révélateur de litige foncier.
CREATE OR REPLACE FUNCTION public.chevauchements_parcelles()
RETURNS TABLE (a_id UUID, a_nom TEXT, b_id UUID, b_nom TEXT, surface_m2 DOUBLE PRECISION)
LANGUAGE SQL STABLE SECURITY INVOKER
SET search_path = public, extensions AS $$
  SELECT a.id, a.nom, b.id, b.nom,
         ST_Area(ST_Intersection(a.geom, b.geom)::geography)
    FROM public.parcelles a
    JOIN public.parcelles b
      ON a.id < b.id
     AND a.organisation_id = b.organisation_id
     AND ST_Intersects(a.geom, b.geom)
   WHERE a.supprime_le IS NULL
     AND b.supprime_le IS NULL
     AND ST_Area(ST_Intersection(a.geom, b.geom)::geography) > 1
   ORDER BY 5 DESC;
$$;
