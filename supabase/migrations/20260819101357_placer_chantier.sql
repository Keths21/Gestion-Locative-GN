-- Pose du repère géographique d'un chantier.
--
-- Rapatrié depuis l'historique Supabase le 31/08/2026 : appliqué en base le
-- 19/08/2026, il n'avait jamais été versionné.

-- PostgREST ne sait pas écrire une colonne geometry : le repère du chantier
-- se pose par cette fonction, en SECURITY INVOKER pour que la RLS s'applique.
CREATE OR REPLACE FUNCTION public.placer_chantier(c UUID, lon FLOAT8, lat FLOAT8)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, extensions AS $$
DECLARE n INTEGER;
BEGIN
  IF lon IS NULL OR lat IS NULL OR abs(lat) > 90 OR abs(lon) > 180 THEN
    RAISE EXCEPTION 'Coordonnées hors bornes : lon=%, lat=%', lon, lat;
  END IF;

  UPDATE public.chantiers
     SET point_geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326)
   WHERE id = c;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;
