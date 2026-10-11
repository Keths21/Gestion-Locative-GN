-- ============================================================================
--  Inscription : plus d'administrateur désigné par son adresse
--
--  Audit de sécurité du 11/10/2026. handle_new_user faisait de toute
--  inscription à l'adresse keita.elhadj@gmail.com un compte « admin » et
--  « approved », d'office. Tant que ce compte existe, personne ne peut s'inscrire
--  avec cette adresse ; mais qu'il soit supprimé un jour — ou qu'une base neuve
--  soit montée — et le premier à s'inscrire avec elle obtiendrait tous les
--  droits, sans approbation. L'adresse est en outre lisible de tous : le dépôt
--  est public.
--
--  Le rôle d'administrateur ne se décide plus à l'inscription. Toute inscription
--  naît « user » et « pending ». Sur une base neuve, on désigne l'administrateur
--  à la main, une fois son compte créé :
--
--    UPDATE public.profiles SET role = 'admin', status = 'approved'
--     WHERE email = '…';
--
--  Les comptes existants ne sont pas touchés : l'administrateur en place le
--  reste.
--
--  Le reste de la fonction est inchangé. Recette et production en portaient
--  deux écritures — mêmes instructions, commentaires différents ; elles
--  repartent de celle-ci.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_invite BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, 'user', 'pending')
  ON CONFLICT (id) DO NOTHING;

  -- Rattachement des invitations laissées à son adresse.
  UPDATE public.collaborateurs
     SET user_id = NEW.id
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
