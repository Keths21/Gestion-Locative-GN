-- Rattachement d'un collaborateur invité, à son inscription.
--
-- Le piège : handle_new_user créait une organisation pour CHAQUE nouveau
-- compte. Un collaborateur invité aurait donc reçu sa propre agence vide, et
-- organisation_courante() la lui aurait servie de préférence à celle qui l'a
-- convié — il se serait connecté pour ne rien voir.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invite BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email,
    CASE WHEN NEW.email = 'keita.elhadj@gmail.com' THEN 'admin' ELSE 'user' END,
    CASE WHEN NEW.email = 'keita.elhadj@gmail.com' THEN 'approved' ELSE 'pending' END
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.collaborateurs SET user_id = NEW.id
   WHERE user_id IS NULL AND lower(email) = lower(NEW.email);

  SELECT EXISTS (
    SELECT 1 FROM public.collaborateurs
     WHERE user_id = NEW.id
       AND (droit_locatif <> 'aucun' OR droit_foncier <> 'aucun' OR droit_chantiers <> 'aucun')
  ) INTO v_invite;

  -- Un invité n'est pas propriétaire : il travaille dans l'agence d'un autre.
  IF NOT v_invite THEN
    INSERT INTO public.organisations (id, nom)
    VALUES (NEW.id, COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email, 'Mon agence'))
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.membres (organisation_id, user_id, role)
    VALUES (NEW.id, NEW.id, 'proprietaire')
    ON CONFLICT (organisation_id, user_id) DO NOTHING;
    INSERT INTO public.abonnements (organisation_id, acces_jusqu_au)
    VALUES (NEW.id, now() + (public.jours_essai() || ' days')::interval)
    ON CONFLICT (organisation_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Rattrapage pour un compte créé AVANT son invitation, appelé à la connexion.
-- Sans lui, inviter quelqu'un de déjà inscrit ne produirait rien.
CREATE OR REPLACE FUNCTION public.lier_invitations_collaborateur()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT; v_n INTEGER;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN 0; END IF;
  UPDATE public.collaborateurs SET user_id = auth.uid()
   WHERE user_id IS NULL AND lower(email) = v_email;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lier_invitations_collaborateur() TO authenticated;

-- Le type de retour change : Postgres impose de supprimer d'abord.
DROP FUNCTION IF EXISTS public.etat_acces();

-- Tout ce que le proxy doit savoir, en un seul aller-retour : il s'exécute à
-- chaque requête, un second appel aurait doublé le coût de chaque page.
CREATE FUNCTION public.etat_acces()
RETURNS TABLE (
  role             TEXT,
  statut_compte    TEXT,
  organisation_id  UUID,
  acces_jusqu_au   TIMESTAMPTZ,
  abonnement_actif BOOLEAN,
  a_deja_paye      BOOLEAN,
  est_proprietaire BOOLEAN,
  droit_locatif    TEXT,
  droit_foncier    TEXT,
  droit_chantiers  TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH org AS (SELECT public.organisation_courante() AS id)
  SELECT p.role, p.status, org.id, a.acces_jusqu_au,
         COALESCE(a.acces_jusqu_au > now(), false),
         COALESCE(a.a_deja_paye, false),
         COALESCE(public.est_proprietaire(org.id), false),
         COALESCE(public.droit_domaine(org.id, 'locatif'),   'aucun'),
         COALESCE(public.droit_domaine(org.id, 'foncier'),   'aucun'),
         COALESCE(public.droit_domaine(org.id, 'chantiers'), 'aucun')
    FROM public.profiles p
    CROSS JOIN org
    LEFT JOIN public.abonnements a ON a.organisation_id = org.id
   WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.etat_acces() TO anon, authenticated;

-- Les droits de l'appelant, pour l'interface.
CREATE OR REPLACE FUNCTION public.mes_droits()
RETURNS TABLE (organisation_id UUID, est_proprietaire BOOLEAN,
               locatif TEXT, foncier TEXT, chantiers TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, public.est_proprietaire(o.id),
         public.droit_domaine(o.id, 'locatif'),
         public.droit_domaine(o.id, 'foncier'),
         public.droit_domaine(o.id, 'chantiers')
    FROM public.organisations o WHERE o.id = public.organisation_courante();
$$;

GRANT EXECUTE ON FUNCTION public.mes_droits() TO anon, authenticated;
