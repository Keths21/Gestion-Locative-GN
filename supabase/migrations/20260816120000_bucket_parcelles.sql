-- ============================================================================
--  Lot 4 — Stockage des documents et photos de parcelles
--
--  Chemin des objets : {organisation_id}/{parcelle_id}/{uuid}.{ext}
--
--  Le premier segment est l'organisation, et non l'utilisateur comme prévu
--  initialement : depuis la bascule du lot 1, l'isolation se fait par
--  appartenance. Avec un préfixe par utilisateur, un collègue de la même
--  agence ne pourrait pas ouvrir une photo prise par un autre, ce qui viderait
--  le travail à plusieurs de son sens.
--
--  Les contraintes de taille et de format sont portées par le bucket lui-même :
--  elles s'appliquent donc même si le client envoie directement, sans passer
--  par une route applicative.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'parcelles',
  'parcelles',
  false,
  15728640,  -- 15 Mo : une photo de téléphone récent tient largement dedans
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public             = false;

-- ----------------------------------------------------------------------------
--  Appartenance à partir d'un segment de chemin
--
--  storage.foldername() renvoie du texte. Un cast direct en uuid ferait échouer
--  toute la policy si un objet se retrouvait rangé hors convention ; ces deux
--  fonctions renvoient false dans ce cas, ce qui est le comportement sûr.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.est_membre_chemin(segment TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v UUID;
BEGIN
  BEGIN
    v := segment::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN public.est_membre(v);
END;
$$;

CREATE OR REPLACE FUNCTION public.peut_ecrire_chemin(segment TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v UUID;
BEGIN
  BEGIN
    v := segment::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN public.peut_ecrire(v);
END;
$$;

-- ----------------------------------------------------------------------------
--  Policies sur les objets du bucket
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Membres lisent les fichiers de parcelles"      ON storage.objects;
DROP POLICY IF EXISTS "Redacteurs deposent des fichiers de parcelles" ON storage.objects;
DROP POLICY IF EXISTS "Redacteurs remplacent les fichiers"            ON storage.objects;
DROP POLICY IF EXISTS "Redacteurs suppriment les fichiers"            ON storage.objects;

CREATE POLICY "Membres lisent les fichiers de parcelles" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'parcelles'
    AND public.est_membre_chemin((storage.foldername(name))[1])
  );

CREATE POLICY "Redacteurs deposent des fichiers de parcelles" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'parcelles'
    AND public.peut_ecrire_chemin((storage.foldername(name))[1])
  );

CREATE POLICY "Redacteurs remplacent les fichiers" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'parcelles'
    AND public.peut_ecrire_chemin((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'parcelles'
    AND public.peut_ecrire_chemin((storage.foldername(name))[1])
  );

CREATE POLICY "Redacteurs suppriment les fichiers" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'parcelles'
    AND public.peut_ecrire_chemin((storage.foldername(name))[1])
  );
