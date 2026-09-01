-- Nettoyage des organisations restées sans membre.
--
-- `organisations` n'a aucune clé étrangère vers auth.users. Supprimer un compte
-- emporte donc son profil et son appartenance par cascade, mais laisse son
-- organisation derrière : plus personne n'en est membre, est_membre() renvoie
-- false pour tout le monde, et ce qu'elle contient devient invisible et
-- irrécupérable par l'application.
--
-- La tentation serait d'effacer l'organisation dès son dernier membre parti.
-- Ce serait une faute : dix tables la référencent en ON DELETE CASCADE — biens,
-- locataires, paiements, parcelles, chantiers… Supprimer un compte depuis le
-- tableau de bord Supabase effacerait alors l'historique complet d'un client,
-- sans un mot. Le remède serait pire que le mal.
--
-- On ne supprime donc QUE les organisations réellement vides. Celles qui portent
-- encore des données survivent, et relèvent d'une décision humaine : réattribuer
-- la propriété, ou exporter avant d'effacer. organisations_orphelines() les
-- donne à voir.

CREATE OR REPLACE FUNCTION public.organisation_est_vide(org UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.biens              WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.locataires         WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.paiements          WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.parametres         WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.parcelles          WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.parcelle_documents WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.journal_parcelles  WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.chantiers          WHERE organisation_id = org)
     AND NOT EXISTS (SELECT 1 FROM public.intervenants       WHERE organisation_id = org);
$$;

CREATE OR REPLACE FUNCTION public.nettoyer_organisation_sans_membre()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.membres WHERE organisation_id = OLD.organisation_id) THEN
    RETURN NULL;
  END IF;

  IF NOT public.organisation_est_vide(OLD.organisation_id) THEN
    -- Trace plutôt que destruction : quelqu'un doit décider du sort de ces
    -- données, et personne ne peut plus les voir depuis l'application.
    RAISE WARNING 'Organisation % sans membre mais porteuse de données : conservée. Voir organisations_orphelines().',
      OLD.organisation_id;
    RETURN NULL;
  END IF;

  DELETE FROM public.organisations WHERE id = OLD.organisation_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_nettoyer_organisation ON public.membres;

-- Trigger de contrainte, DIFFÉRÉ à la validation de la transaction.
--
-- C'est le point délicat : quand un compte est supprimé, plusieurs cascades
-- partent en même temps et leur ordre n'est pas garanti. Un trigger AFTER
-- ordinaire pourrait s'exécuter avant que les biens de l'organisation n'aient
-- disparu, conclure qu'elle porte encore des données, et la conserver à tort.
-- Différé, il ne s'exécute qu'une fois toutes les cascades achevées.
--
-- C'est aussi ce qui rend l'essai trompeur : dans une même transaction, un
-- SELECT posé juste après le DELETE voit encore l'organisation. Il faut
-- vérifier APRÈS validation.
CREATE CONSTRAINT TRIGGER trg_nettoyer_organisation
  AFTER DELETE ON public.membres
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.nettoyer_organisation_sans_membre();

-- Inventaire des organisations sans membre qui portent encore des données.
-- Fonction de maintenance : elle n'est appelée par aucune policy, et n'a rien à
-- faire dans l'API publique.
CREATE OR REPLACE FUNCTION public.organisations_orphelines()
RETURNS TABLE (id UUID, nom TEXT, cree_le TIMESTAMPTZ,
               biens BIGINT, locataires BIGINT, paiements BIGINT,
               parcelles BIGINT, chantiers BIGINT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.nom, o.cree_le,
         (SELECT count(*) FROM public.biens      b WHERE b.organisation_id = o.id),
         (SELECT count(*) FROM public.locataires l WHERE l.organisation_id = o.id),
         (SELECT count(*) FROM public.paiements  p WHERE p.organisation_id = o.id),
         (SELECT count(*) FROM public.parcelles  a WHERE a.organisation_id = o.id),
         (SELECT count(*) FROM public.chantiers  c WHERE c.organisation_id = o.id)
    FROM public.organisations o
   WHERE NOT EXISTS (SELECT 1 FROM public.membres m WHERE m.organisation_id = o.id)
   ORDER BY o.cree_le;
$$;

-- Ces deux-là ne sont appelées par aucune policy : les retirer de l'API
-- publique ne peut rien casser. La nuance compte — c'est en révoquant sans
-- distinction que la migration du 16/08 avait rendu l'application inutilisable.
REVOKE EXECUTE ON FUNCTION public.organisations_orphelines() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.organisation_est_vide(uuid) FROM anon, authenticated;
