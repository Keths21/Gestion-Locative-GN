-- ============================================================================
--  Correctif — auto-référence dans les policies de `chantiers`
--
--  Symptôme : toute création de chantier échouait sur
--  « new row violates row-level security policy for table chantiers », y
--  compris en fournissant organisation_id explicitement.
--
--  Cause : la policy de lecture appelait acces_chantier_lecture(id), qui va
--  chercher l'organisation DANS `chantiers`. Or PostgreSQL applique aussi la
--  policy SELECT lors d'un INSERT ... RETURNING ; la fonction étant STABLE,
--  son instantané ne contient pas encore la ligne en cours d'insertion, et
--  elle renvoie false.
--
--  La table `biens` échappait au problème : sa policy lit organisation_id
--  directement sur la ligne, sans se relire elle-même.
--
--  Correctif : séparer les deux voies. L'appartenance se lit sur la ligne
--  courante ; l'accès explicite n'interroge que `acces_chantier`. Plus
--  aucune auto-référence.
--
--  Les tables filles (postes, dépenses, phases, jalons) conservent
--  acces_chantier_lecture/ecriture : elles lisent `chantiers`, une AUTRE
--  table, dont la ligne existe déjà au moment de la vérification.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.acces_chantier_explicite(c UUID, contribuer BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acces_chantier a
     WHERE a.chantier_id = c
       AND a.user_id = auth.uid()
       AND (NOT contribuer OR a.role = 'contributeur')
       AND (a.expire_le IS NULL OR a.expire_le > now())
  );
$$;

DROP POLICY IF EXISTS "Lecture des chantiers"    ON public.chantiers;
DROP POLICY IF EXISTS "Modification de chantier" ON public.chantiers;

CREATE POLICY "Lecture des chantiers" ON public.chantiers
  FOR SELECT USING (
    public.est_membre(organisation_id)
    OR public.acces_chantier_explicite(id)
  );

CREATE POLICY "Modification de chantier" ON public.chantiers
  FOR UPDATE USING (
    public.peut_ecrire(organisation_id)
    OR public.acces_chantier_explicite(id, true)
  )
  WITH CHECK (
    public.peut_ecrire(organisation_id)
    OR public.acces_chantier_explicite(id, true)
  );
