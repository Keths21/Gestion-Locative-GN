-- Création de l'organisation à l'inscription.
--
-- La migration organisations_membres du 16/08 avait rempli `organisations` et
-- `membres` une fois, à partir des profils existants — mais rien n'a pris le
-- relais ensuite. Un utilisateur qui s'inscrit aujourd'hui obtient un profil,
-- franchit l'écran d'approbation, puis découvre une application vide : la RLS
-- ne lui montre rien faute d'appartenance, et toute création échoue sur
-- « Aucune organisation rattachée à cet utilisateur ».
--
-- Le défaut est resté invisible parce qu'aucun compte n'a été créé depuis. Il
-- est apparu en montant la base de recette, vierge, où il fallait bien un
-- premier utilisateur.
--
-- On étend handle_new_user plutôt que d'ajouter un second trigger : les deux
-- écritures doivent se faire dans cet ordre, et l'ordre entre deux triggers
-- AFTER INSERT sur la même table dépend de leurs noms — un lien trop fragile
-- pour ce qu'il garantit.
--
-- L'organisation reprend l'identifiant de l'utilisateur : c'est la convention
-- posée par la migration de reprise, sur laquelle s'appuie organisation_courante().
--
-- `parametres.nom_agence` n'est pas consulté ici, contrairement à la reprise :
-- à l'inscription, l'agence n'a pas encore été renseignée.
--
-- Les ON CONFLICT DO NOTHING rendent la fonction rejouable : réappliquer cette
-- migration, ou la faire tourner sur un utilisateur déjà pourvu, ne casse rien.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    CASE WHEN NEW.email = 'keita.elhadj@gmail.com' THEN 'admin' ELSE 'user' END,
    CASE WHEN NEW.email = 'keita.elhadj@gmail.com' THEN 'approved' ELSE 'pending' END
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organisations (id, nom)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NEW.email,
      'Mon agence'
    )
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.membres (organisation_id, user_id, role)
  VALUES (NEW.id, NEW.id, 'proprietaire')
  ON CONFLICT (organisation_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
