-- Droit de l'appelant sur un domaine : 'aucun' | 'lecture' | 'ecriture'.
-- Le propriétaire a tout : c'est son agence, et lui retirer un domaine
-- l'enfermerait dehors sans personne pour l'y faire rentrer.
CREATE OR REPLACE FUNCTION public.droit_domaine(org UUID, domaine TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v TEXT;
BEGIN
  IF public.est_proprietaire(org) THEN RETURN 'ecriture'; END IF;
  SELECT CASE domaine
           WHEN 'locatif'   THEN c.droit_locatif
           WHEN 'foncier'   THEN c.droit_foncier
           WHEN 'chantiers' THEN c.droit_chantiers
         END
    INTO v FROM public.collaborateurs c
   WHERE c.organisation_id = org AND c.user_id = auth.uid();
  RETURN COALESCE(v, 'aucun');
END;
$$;

CREATE OR REPLACE FUNCTION public.peut_lire_dom(org UUID, domaine TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.droit_domaine(org, domaine) <> 'aucun';
$$;

CREATE OR REPLACE FUNCTION public.peut_ecrire_dom(org UUID, domaine TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.droit_domaine(org, domaine) = 'ecriture';
$$;

-- `est_membre` s'élargit aux collaborateurs : elle garde les policies qui ne
-- relèvent d'aucun domaine — nom de l'agence, en-tête de quittance, abonnement.
-- Une ligne à zéro droit est un accès révoqué qu'on n'a pas encore supprimé.
CREATE OR REPLACE FUNCTION public.est_membre(org UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.membres WHERE organisation_id = org AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.collaborateurs c
                  WHERE c.organisation_id = org AND c.user_id = auth.uid()
                    AND (c.droit_locatif <> 'aucun' OR c.droit_foncier <> 'aucun' OR c.droit_chantiers <> 'aucun'));
$$;

-- `peut_ecrire` sans domaine se restreint au propriétaire : accorder une
-- écriture indifférenciée contournerait tout le découpage.
CREATE OR REPLACE FUNCTION public.peut_ecrire(org UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.est_proprietaire(org);
$$;

-- L'organisation d'un collaborateur est celle qui l'a invité : il n'a pas de
-- ligne dans `membres`. Sans cet élargissement il verrait une application vide.
CREATE OR REPLACE FUNCTION public.organisation_courante()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organisation_id FROM (
    SELECT organisation_id, cree_le, 0 AS rang FROM public.membres WHERE user_id = auth.uid()
    UNION ALL
    SELECT organisation_id, cree_le, 1 FROM public.collaborateurs
     WHERE user_id = auth.uid()
       AND (droit_locatif <> 'aucun' OR droit_foncier <> 'aucun' OR droit_chantiers <> 'aucun')
  ) t
   -- Le rang privilégie sa propre agence : on ne bascule personne dans
   -- l'organisation d'autrui par le seul effet d'une date.
   ORDER BY rang, cree_le, organisation_id
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.droit_domaine(uuid, text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peut_lire_dom(uuid, text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peut_ecrire_dom(uuid, text) TO anon, authenticated;
