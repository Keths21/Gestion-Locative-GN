-- Lot D — journal de chantier : photos, notes et signalements géolocalisés.
-- Contenu appliqué en base le 19/08/2026 (voir l'historique des migrations
-- Supabase). Ce fichier tient lieu de référence versionnée.
--
-- Deux choix structurants :
--
-- 1. Bucket `chantiers` distinct de `parcelles`. Ses policies doivent
--    connaître la seconde voie d'accès : un architecte invité n'est pas
--    membre de l'organisation, et resterait sinon incapable de voir les
--    photos du chantier auquel on l'a pourtant convié.
--    Chemin : {organisation_id}/{chantier_id}/{uuid}.{ext}
--
-- 2. Regroupement spatial par ST_ClusterDBSCAN plutôt qu'un étiquetage
--    manuel : les prises faites au même endroit à des dates différentes
--    forment la séquence avant / pendant / après. Personne ne pense à
--    étiqueter ses photos sur un chantier.

-- SQL rapatrié depuis l'historique Supabase le 31/08/2026. Ce fichier ne
-- contenait que les commentaires ci-dessus : les quatre objets qu'il décrit
-- n'existaient nulle part dans le dépôt.

CREATE TABLE IF NOT EXISTS public.journal_chantier (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  phase_id     UUID REFERENCES public.phases_chantier(id) ON DELETE SET NULL,
  type         TEXT NOT NULL DEFAULT 'photo'
               CHECK (type IN ('photo', 'note', 'signalement')),
  texte        TEXT,
  -- Signalements uniquement : un « bloquant » arrête le chantier, une
  -- « information » ne fait que documenter. Les confondre noierait l'urgent.
  gravite      TEXT CHECK (gravite IN ('info', 'attention', 'bloquant')),
  statut       TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'resolu')),
  resolu_le    TIMESTAMPTZ,
  point_geom   extensions.geometry(Point, 4326),
  point_json   JSONB,
  -- Chemin dans le bucket chantiers, pour les photos et documents.
  document     TEXT,
  mime         TEXT,
  taille_octets BIGINT,
  cree_par     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_chantier_idx   ON public.journal_chantier (chantier_id, cree_le DESC);
CREATE INDEX IF NOT EXISTS journal_chantier_gix   ON public.journal_chantier USING GIST (point_geom);
CREATE INDEX IF NOT EXISTS journal_chantier_ouvert
  ON public.journal_chantier (chantier_id) WHERE type = 'signalement' AND statut = 'ouvert';

CREATE OR REPLACE FUNCTION public.maj_journal_chantier()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, extensions AS $$
BEGIN
  NEW.point_json := CASE WHEN NEW.point_geom IS NULL
                         THEN NULL ELSE ST_AsGeoJSON(NEW.point_geom)::jsonb END;
  IF TG_OP = 'UPDATE' THEN NEW.modifie_le := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maj_journal ON public.journal_chantier;
CREATE TRIGGER trg_maj_journal BEFORE INSERT OR UPDATE ON public.journal_chantier
  FOR EACH ROW EXECUTE FUNCTION public.maj_journal_chantier();

ALTER TABLE public.journal_chantier ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture du journal" ON public.journal_chantier;
DROP POLICY IF EXISTS "Gestion du journal" ON public.journal_chantier;
CREATE POLICY "Lecture du journal" ON public.journal_chantier
  FOR SELECT USING (public.acces_chantier_lecture(chantier_id));
CREATE POLICY "Gestion du journal" ON public.journal_chantier
  FOR ALL USING (public.acces_chantier_ecriture(chantier_id))
          WITH CHECK (public.acces_chantier_ecriture(chantier_id));

-- Bucket distinct de `parcelles` : ses policies doivent connaître la seconde
-- voie d'accès, celle de l'invité au chantier.
-- Chemin : {organisation_id}/{chantier_id}/{uuid}.{ext}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chantiers', 'chantiers', false, 15728640,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = false;

CREATE OR REPLACE FUNCTION public.acces_chantier_chemin(segment TEXT, contribuer BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v UUID;
BEGIN
  BEGIN v := segment::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  RETURN public.acces_chantier_explicite(v, contribuer);
END;
$$;

DROP POLICY IF EXISTS "Lecture des fichiers de chantier"    ON storage.objects;
DROP POLICY IF EXISTS "Depot des fichiers de chantier"      ON storage.objects;
DROP POLICY IF EXISTS "Remplacement fichiers de chantier"   ON storage.objects;
DROP POLICY IF EXISTS "Suppression fichiers de chantier"    ON storage.objects;

CREATE POLICY "Lecture des fichiers de chantier" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chantiers'
    AND (public.est_membre_chemin((storage.foldername(name))[1])
         OR public.acces_chantier_chemin((storage.foldername(name))[2]))
  );

CREATE POLICY "Depot des fichiers de chantier" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chantiers'
    AND (public.peut_ecrire_chemin((storage.foldername(name))[1])
         OR public.acces_chantier_chemin((storage.foldername(name))[2], true))
  );

CREATE POLICY "Remplacement fichiers de chantier" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'chantiers'
    AND (public.peut_ecrire_chemin((storage.foldername(name))[1])
         OR public.acces_chantier_chemin((storage.foldername(name))[2], true))
  )
  WITH CHECK (
    bucket_id = 'chantiers'
    AND (public.peut_ecrire_chemin((storage.foldername(name))[1])
         OR public.acces_chantier_chemin((storage.foldername(name))[2], true))
  );

CREATE POLICY "Suppression fichiers de chantier" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chantiers'
    AND (public.peut_ecrire_chemin((storage.foldername(name))[1])
         OR public.acces_chantier_chemin((storage.foldername(name))[2], true))
  );

-- PostgREST ne sait pas écrire une colonne geometry.
CREATE OR REPLACE FUNCTION public.ajouter_entree_journal(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, extensions AS $$
DECLARE
  v_id   UUID := COALESCE((p->>'id')::uuid, gen_random_uuid());
  v_geom extensions.geometry(Point, 4326);
  v_out  JSONB;
BEGIN
  IF p ? 'lon' AND p ? 'lat' AND p->>'lon' IS NOT NULL AND p->>'lat' IS NOT NULL THEN
    v_geom := ST_SetSRID(ST_MakePoint((p->>'lon')::float8, (p->>'lat')::float8), 4326);
  END IF;

  INSERT INTO public.journal_chantier AS jc
    (id, chantier_id, phase_id, type, texte, gravite, statut, point_geom,
     document, mime, taille_octets, cree_par)
  VALUES
    (v_id, (p->>'chantier_id')::uuid, (p->>'phase_id')::uuid,
     COALESCE(p->>'type', 'photo'), p->>'texte', p->>'gravite',
     COALESCE(p->>'statut', 'ouvert'), v_geom,
     p->>'document', p->>'mime', (p->>'taille_octets')::bigint, auth.uid())
  ON CONFLICT (id) DO UPDATE SET
    phase_id = EXCLUDED.phase_id, type = EXCLUDED.type, texte = EXCLUDED.texte,
    gravite = EXCLUDED.gravite, statut = EXCLUDED.statut,
    point_geom = COALESCE(EXCLUDED.point_geom, jc.point_geom),
    document = COALESCE(EXCLUDED.document, jc.document);

  SELECT to_jsonb(x) INTO v_out FROM (
    SELECT id, chantier_id, phase_id, type, texte, gravite, statut, resolu_le,
           point_json AS point_geom, document, mime, taille_octets, cree_par, cree_le
      FROM public.journal_chantier WHERE id = v_id) x;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'Entrée refusée : chantier inaccessible.';
  END IF;
  RETURN v_out;
END;
$$;

-- Regroupement spatial « avant / pendant / après » : les prises faites au même
-- endroit forment un groupe, quel que soit l'intervalle de temps.
CREATE OR REPLACE FUNCTION public.journal_par_emplacement(c UUID, rayon_m FLOAT8 DEFAULT 12)
RETURNS TABLE (groupe INTEGER, id UUID, type TEXT, texte TEXT, document TEXT,
               mime TEXT, cree_le TIMESTAMPTZ, lat FLOAT8, lon FLOAT8)
LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  SELECT g.groupe, g.id, g.type, g.texte, g.document, g.mime, g.cree_le,
         ST_Y(g.point_geom)::float8, ST_X(g.point_geom)::float8
    FROM (
      SELECT jc.*,
             -- eps en degrés : à la latitude de Conakry, 1e-4° ≈ 11 m.
             ST_ClusterDBSCAN(point_geom, eps := rayon_m / 111320.0, minpoints := 1)
               OVER () AS groupe
        FROM public.journal_chantier jc
       WHERE jc.chantier_id = c AND jc.point_geom IS NOT NULL
    ) g
   ORDER BY g.groupe, g.cree_le;
$$;
