-- Collaborateurs et droits par domaine.
--
-- Pourquoi des DOMAINES et non des pages : plusieurs pages lisent les mêmes
-- tables — Tableau de bord, Relances et Documents interrogent toutes
-- `locataires` et `paiements`. Autoriser l'une en refusant l'autre ne serait
-- qu'un masquage de menu, la donnée restant lisible par un appel direct à
-- l'API. Une permission qui ne descend pas jusqu'à la RLS n'est pas une
-- permission, c'est une décoration.
--
--   locatif   → biens, locataires, paiements   (+ dashboard, relances, documents)
--   foncier   → parcelles et dépendances       (+ carte)
--   chantiers → chantiers et tables filles
--
-- Les paramètres restent au seul propriétaire : c'est là qu'on gère les
-- collaborateurs, et un collaborateur qui s'y rendrait s'accorderait lui-même
-- des droits.

CREATE TABLE IF NOT EXISTS public.collaborateurs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  -- L'adresse porte l'invitation ; `user_id` reste nul jusqu'à la première
  -- connexion. Même procédé que `acces_chantier`, éprouvé depuis août.
  email            TEXT NOT NULL,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  droit_locatif    TEXT NOT NULL DEFAULT 'aucun' CHECK (droit_locatif   IN ('aucun','lecture','ecriture')),
  droit_foncier    TEXT NOT NULL DEFAULT 'aucun' CHECK (droit_foncier   IN ('aucun','lecture','ecriture')),
  droit_chantiers  TEXT NOT NULL DEFAULT 'aucun' CHECK (droit_chantiers IN ('aucun','lecture','ecriture')),
  invite_par       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cree_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- lower() : Marie@… et marie@… désignent la même personne, et un doublon
-- donnerait deux jeux de droits contradictoires.
CREATE UNIQUE INDEX IF NOT EXISTS collaborateurs_org_email_unique
  ON public.collaborateurs (organisation_id, lower(email));
CREATE INDEX IF NOT EXISTS collaborateurs_user_idx ON public.collaborateurs (user_id);

DROP TRIGGER IF EXISTS trg_maj_collaborateurs ON public.collaborateurs;
CREATE TRIGGER trg_maj_collaborateurs BEFORE UPDATE ON public.collaborateurs
  FOR EACH ROW EXECUTE FUNCTION public.maj_modifie_le();

ALTER TABLE public.collaborateurs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Proprietaire gere les collaborateurs" ON public.collaborateurs;
CREATE POLICY "Proprietaire gere les collaborateurs" ON public.collaborateurs
  FOR ALL USING (public.est_proprietaire(organisation_id))
          WITH CHECK (public.est_proprietaire(organisation_id));

-- Le collaborateur voit sa propre ligne, et rien de plus : savoir qui d'autre
-- a accès à l'agence ne le regarde pas.
DROP POLICY IF EXISTS "Collaborateur lit sa propre ligne" ON public.collaborateurs;
CREATE POLICY "Collaborateur lit sa propre ligne" ON public.collaborateurs
  FOR SELECT USING (user_id = auth.uid());
