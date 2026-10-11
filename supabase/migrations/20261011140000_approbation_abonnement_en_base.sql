-- ============================================================================
--  Approbation des comptes et abonnement, contrôlés par la base elle-même
--
--  Audit de sécurité du 11/10/2026. Jusqu'ici, deux règles d'usage n'étaient
--  tenues que par le proxy Next :
--
--   - un compte en attente ou refusé n'accède à rien ;
--   - une agence dont l'abonnement a expiré ne travaille plus.
--
--  Or le navigateur parle directement à Supabase. handle_new_user crée une
--  agence à chaque inscription, AVANT approbation, et en fait l'inscrit
--  propriétaire : la RLS le laissait donc lire et écrire dans cette agence,
--  et déposer des fichiers, à qui savait appeler l'API sans l'interface. De
--  même pour une agence expirée. Les données d'autrui n'ont jamais été
--  exposées — c'est l'usage qui échappait à vos règles.
--
--  Décision du 11/10/2026 : un abonnement expiré passe l'agence en LECTURE
--  SEULE — ses données restent consultables, jamais prises en otage — et un
--  compte non approuvé n'a accès à rien. L'administrateur n'est jamais bloqué
--  par l'abonnement, comme dans le proxy.
--
--  Presque toutes les policies passent par cinq fonctions : droit_domaine,
--  est_membre, est_proprietaire, peut_ecrire, acces_chantier_explicite. On les
--  fait passer par deux nouvelles questions plutôt que de réécrire trente
--  policies :
--
--   compte_actif()        le compte de l'appelant est-il approuvé ?
--   ecriture_ouverte(org) l'abonnement de l'agence est-il à jour — ou
--                         l'appelant est-il administrateur ?
--
--  Le vocabulaire se précise au passage : est_proprietaire dit qui POSSÈDE,
--  peut_ecrire dit qui peut ÉCRIRE. Les quelques policies qui écrivaient sous
--  est_proprietaire passent à peut_ecrire.
--
--  Le même passage règle un second défaut : les fichiers stockés ignoraient
--  les droits par domaine. Un collaborateur limité au locatif listait et
--  téléchargeait les pièces des parcelles et des chantiers ; et à l'inverse,
--  un collaborateur en écriture sur le foncier ne pouvait pas déposer la
--  photo que la table parcelle_documents l'autorisait pourtant à enregistrer.
--
--  Pour l'interface, rien ne change : le proxy renvoie toujours une agence
--  expirée vers la page de règlement. La base garantit désormais la même règle
--  quel que soit le chemin.
-- ============================================================================

-- --- Les deux questions ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compte_actif()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.ecriture_ouverte(org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.abonnements
     WHERE organisation_id = org AND acces_jusqu_au > now()
  );
$$;

-- --- Les cinq fonctions des policies -----------------------------------------

-- Appartenance : réservée aux comptes approuvés. Reste vraie après expiration
-- — c'est elle qui permet de lire son organisation, ses paramètres et la page
-- d'abonnement.
CREATE OR REPLACE FUNCTION public.est_membre(org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.compte_actif() AND (
    EXISTS (
      SELECT 1 FROM public.membres
       WHERE organisation_id = org AND user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.collaborateurs c
       WHERE c.organisation_id = org AND c.user_id = auth.uid()
         AND (c.droit_locatif <> 'aucun' OR c.droit_foncier <> 'aucun' OR c.droit_chantiers <> 'aucun')
    )
  );
$$;

-- Possession : qui détient l'agence. Pas une permission d'écrire — voir
-- peut_ecrire. Un compte non approuvé ne possède rien.
CREATE OR REPLACE FUNCTION public.est_proprietaire(org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.compte_actif() AND EXISTS (
    SELECT 1 FROM public.membres
     WHERE organisation_id = org AND user_id = auth.uid()
       AND role = 'proprietaire'
  );
$$;

CREATE OR REPLACE FUNCTION public.peut_ecrire(org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.est_proprietaire(org) AND public.ecriture_ouverte(org);
$$;

-- Droit par domaine. Abonnement expiré : l'écriture se réduit à la lecture.
CREATE OR REPLACE FUNCTION public.droit_domaine(org uuid, domaine text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v TEXT;
BEGIN
  IF NOT public.compte_actif() THEN RETURN 'aucun'; END IF;

  IF public.est_proprietaire(org) THEN
    v := 'ecriture';
  ELSE
    SELECT CASE domaine
             WHEN 'locatif'   THEN c.droit_locatif
             WHEN 'foncier'   THEN c.droit_foncier
             WHEN 'chantiers' THEN c.droit_chantiers
           END
      INTO v
      FROM public.collaborateurs c
     WHERE c.organisation_id = org AND c.user_id = auth.uid();
  END IF;

  v := COALESCE(v, 'aucun');
  IF v = 'ecriture' AND NOT public.ecriture_ouverte(org) THEN
    v := 'lecture';
  END IF;
  RETURN v;
END;
$$;

-- Accès partagé à un chantier : même règle pour qui l'a reçu d'une autre
-- agence — compte approuvé, et contribution soumise à l'abonnement de
-- l'agence qui porte le chantier.
CREATE OR REPLACE FUNCTION public.acces_chantier_explicite(c uuid, contribuer boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.compte_actif()
     AND EXISTS (
       SELECT 1 FROM public.acces_chantier a
        WHERE a.chantier_id = c
          AND a.user_id = auth.uid()
          AND (NOT contribuer OR a.role = 'contributeur')
          AND (a.expire_le IS NULL OR a.expire_le > now())
     )
     AND (NOT contribuer OR public.ecriture_ouverte(
       (SELECT ch.organisation_id FROM public.chantiers ch WHERE ch.id = c)
     ));
$$;

-- --- Policies qui écrivaient sous est_proprietaire ---------------------------

ALTER POLICY "Proprietaires modifient organisation" ON public.organisations
  USING (public.peut_ecrire(id)) WITH CHECK (public.peut_ecrire(id));

-- La lecture des membres passe par « Membres lisent la liste des membres ».
ALTER POLICY "Proprietaires gerent les membres" ON public.membres
  USING (public.peut_ecrire(organisation_id)) WITH CHECK (public.peut_ecrire(organisation_id));

-- Le propriétaire d'une agence expirée doit encore VOIR ses collaborateurs :
-- la lecture devient une policy à part, l'écriture suit peut_ecrire.
DROP POLICY IF EXISTS "Proprietaire lit les collaborateurs" ON public.collaborateurs;
CREATE POLICY "Proprietaire lit les collaborateurs" ON public.collaborateurs
  FOR SELECT USING (public.est_proprietaire(organisation_id));
ALTER POLICY "Proprietaire gere les collaborateurs" ON public.collaborateurs
  USING (public.peut_ecrire(organisation_id)) WITH CHECK (public.peut_ecrire(organisation_id));

-- Le journal n'est écrit qu'après une écriture sur une parcelle : il en suit
-- le droit, et un lecteur ne peut plus y forger d'entrées.
ALTER POLICY "Ecriture au journal des parcelles" ON public.journal_parcelles
  WITH CHECK (public.peut_ecrire_dom(organisation_id, 'foncier'));

-- --- Fichiers : droits par domaine -------------------------------------------
--
-- Chemins : {organisation}/{…} pour les parcelles,
-- {organisation}/{chantier}/{…} pour les chantiers.

CREATE OR REPLACE FUNCTION public.peut_lire_dom_chemin(segment text, domaine text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v UUID;
BEGIN
  BEGIN v := segment::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  RETURN public.peut_lire_dom(v, domaine);
END;
$$;

CREATE OR REPLACE FUNCTION public.peut_ecrire_dom_chemin(segment text, domaine text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v UUID;
BEGIN
  BEGIN v := segment::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  RETURN public.peut_ecrire_dom(v, domaine);
END;
$$;

DROP POLICY IF EXISTS "Membres lisent les fichiers de parcelles"      ON storage.objects;
DROP POLICY IF EXISTS "Redacteurs deposent des fichiers de parcelles" ON storage.objects;
DROP POLICY IF EXISTS "Redacteurs remplacent les fichiers"            ON storage.objects;
DROP POLICY IF EXISTS "Redacteurs suppriment les fichiers"            ON storage.objects;

CREATE POLICY "Membres lisent les fichiers de parcelles" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'parcelles' AND public.peut_lire_dom_chemin((storage.foldername(name))[1], 'foncier')
  );
CREATE POLICY "Redacteurs deposent des fichiers de parcelles" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'parcelles' AND public.peut_ecrire_dom_chemin((storage.foldername(name))[1], 'foncier')
  );
CREATE POLICY "Redacteurs remplacent les fichiers" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'parcelles' AND public.peut_ecrire_dom_chemin((storage.foldername(name))[1], 'foncier')
  ) WITH CHECK (
    bucket_id = 'parcelles' AND public.peut_ecrire_dom_chemin((storage.foldername(name))[1], 'foncier')
  );
CREATE POLICY "Redacteurs suppriment les fichiers" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'parcelles' AND public.peut_ecrire_dom_chemin((storage.foldername(name))[1], 'foncier')
  );

DROP POLICY IF EXISTS "Lecture des fichiers de chantier"    ON storage.objects;
DROP POLICY IF EXISTS "Depot des fichiers de chantier"      ON storage.objects;
DROP POLICY IF EXISTS "Remplacement fichiers de chantier"   ON storage.objects;
DROP POLICY IF EXISTS "Suppression fichiers de chantier"    ON storage.objects;

CREATE POLICY "Lecture des fichiers de chantier" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chantiers' AND (
      public.peut_lire_dom_chemin((storage.foldername(name))[1], 'chantiers')
      OR public.acces_chantier_chemin((storage.foldername(name))[2])
    )
  );
CREATE POLICY "Depot des fichiers de chantier" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chantiers' AND (
      public.peut_ecrire_dom_chemin((storage.foldername(name))[1], 'chantiers')
      OR public.acces_chantier_chemin((storage.foldername(name))[2], true)
    )
  );
CREATE POLICY "Remplacement fichiers de chantier" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'chantiers' AND (
      public.peut_ecrire_dom_chemin((storage.foldername(name))[1], 'chantiers')
      OR public.acces_chantier_chemin((storage.foldername(name))[2], true)
    )
  ) WITH CHECK (
    bucket_id = 'chantiers' AND (
      public.peut_ecrire_dom_chemin((storage.foldername(name))[1], 'chantiers')
      OR public.acces_chantier_chemin((storage.foldername(name))[2], true)
    )
  );
CREATE POLICY "Suppression fichiers de chantier" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chantiers' AND (
      public.peut_ecrire_dom_chemin((storage.foldername(name))[1], 'chantiers')
      OR public.acces_chantier_chemin((storage.foldername(name))[2], true)
    )
  );

-- Les deux fonctions de chemin sans domaine ne servent plus : elles sortent
-- de l'API plutôt que d'y rester exposées.
DROP FUNCTION IF EXISTS public.est_membre_chemin(text);
DROP FUNCTION IF EXISTS public.peut_ecrire_chemin(text);

-- Les nouvelles fonctions héritent des privilèges par défaut posés le
-- 11/10/2026 (authenticated et service_role, ni PUBLIC ni anon) : les policies
-- les appellent avec les droits de l'utilisateur connecté.
