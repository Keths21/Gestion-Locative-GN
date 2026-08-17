-- ============================================================================
--  Lot 1 · étape 2/3 — Bascule de l'isolation vers l'organisation
--
--  Les quatre tables métier passent d'une isolation « auth.uid() = user_id »
--  à une isolation par appartenance à une organisation, avec distinction
--  lecture / écriture selon le rôle.
--
--  La colonne user_id est CONSERVÉE partout : elle devient la trace du
--  créateur. Cela évite de casser le code applicatif existant, qui la
--  renseigne et l'utilise encore dans ses filtres.
--
--  Visibilité inchangée après cette migration : chaque organisation ne
--  compte qu'un membre, donc chacun voit exactement ce qu'il voyait avant.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Colonnes
-- ----------------------------------------------------------------------------

ALTER TABLE public.biens      ADD COLUMN IF NOT EXISTS organisation_id UUID;
ALTER TABLE public.locataires ADD COLUMN IF NOT EXISTS organisation_id UUID;
ALTER TABLE public.paiements  ADD COLUMN IF NOT EXISTS organisation_id UUID;
ALTER TABLE public.parametres ADD COLUMN IF NOT EXISTS organisation_id UUID;

-- ----------------------------------------------------------------------------
--  2. Reprise
--     L'organisation initiale porte l'identifiant de son propriétaire
--     (cf. étape 1/3), la correspondance est donc directe.
--     Les paiements n'ont pas de user_id : on remonte par le locataire,
--     puis par le bien.
-- ----------------------------------------------------------------------------

UPDATE public.biens      SET organisation_id = user_id WHERE organisation_id IS NULL;
UPDATE public.locataires SET organisation_id = user_id WHERE organisation_id IS NULL;
UPDATE public.parametres SET organisation_id = user_id WHERE organisation_id IS NULL;

UPDATE public.paiements p
   SET organisation_id = COALESCE(
         (SELECT l.organisation_id FROM public.locataires l WHERE l.id = p.locataire_id),
         (SELECT b.organisation_id FROM public.biens b      WHERE b.id = p.bien_id))
 WHERE p.organisation_id IS NULL;

-- Garde-fou : la migration échoue plutôt que de laisser une ligne orpheline
-- qui deviendrait invisible pour tout le monde une fois la RLS basculée.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT (SELECT count(*) FROM public.biens      WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM public.locataires WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM public.paiements  WHERE organisation_id IS NULL)
       + (SELECT count(*) FROM public.parametres WHERE organisation_id IS NULL)
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'Reprise incomplète : % ligne(s) sans organisation_id.', n;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
--  3. Contraintes et index
-- ----------------------------------------------------------------------------

ALTER TABLE public.biens      ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.locataires ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.paiements  ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.parametres ALTER COLUMN organisation_id SET NOT NULL;

ALTER TABLE public.biens      DROP CONSTRAINT IF EXISTS biens_organisation_fk;
ALTER TABLE public.locataires DROP CONSTRAINT IF EXISTS locataires_organisation_fk;
ALTER TABLE public.paiements  DROP CONSTRAINT IF EXISTS paiements_organisation_fk;
ALTER TABLE public.parametres DROP CONSTRAINT IF EXISTS parametres_organisation_fk;

ALTER TABLE public.biens      ADD CONSTRAINT biens_organisation_fk
  FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.locataires ADD CONSTRAINT locataires_organisation_fk
  FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.paiements  ADD CONSTRAINT paiements_organisation_fk
  FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.parametres ADD CONSTRAINT parametres_organisation_fk
  FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS biens_org_idx      ON public.biens (organisation_id);
CREATE INDEX IF NOT EXISTS locataires_org_idx ON public.locataires (organisation_id);
CREATE INDEX IF NOT EXISTS paiements_org_idx  ON public.paiements (organisation_id);

-- Un seul jeu de paramètres d'agence par organisation. Sans cette contrainte,
-- l'arrivée d'un second membre ferait remonter deux lignes et casserait les
-- lectures en .single() du code existant.
CREATE UNIQUE INDEX IF NOT EXISTS parametres_org_unique ON public.parametres (organisation_id);

-- ----------------------------------------------------------------------------
--  4. Remplissage automatique à l'insertion
--     C'est ce qui permet à l'application actuelle de continuer à écrire
--     sans envoyer organisation_id.
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_org_biens      ON public.biens;
DROP TRIGGER IF EXISTS trg_org_locataires ON public.locataires;
DROP TRIGGER IF EXISTS trg_org_paiements  ON public.paiements;
DROP TRIGGER IF EXISTS trg_org_parametres ON public.parametres;

CREATE TRIGGER trg_org_biens      BEFORE INSERT ON public.biens
  FOR EACH ROW EXECUTE FUNCTION public.remplir_organisation();
CREATE TRIGGER trg_org_locataires BEFORE INSERT ON public.locataires
  FOR EACH ROW EXECUTE FUNCTION public.remplir_organisation();
CREATE TRIGGER trg_org_paiements  BEFORE INSERT ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.remplir_organisation();
CREATE TRIGGER trg_org_parametres BEFORE INSERT ON public.parametres
  FOR EACH ROW EXECUTE FUNCTION public.remplir_organisation();

-- ----------------------------------------------------------------------------
--  5. Policies
--     Lecture ouverte à tout membre, écriture réservée aux rôles
--     propriétaire et éditeur. Le rôle lecteur devient donc réellement
--     un accès en consultation.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users manage own biens"      ON public.biens;
DROP POLICY IF EXISTS "Users manage own locataires" ON public.locataires;
DROP POLICY IF EXISTS "Users manage own paiements"  ON public.paiements;
DROP POLICY IF EXISTS "Users manage own parametres" ON public.parametres;

DROP POLICY IF EXISTS "Membres lisent les biens"       ON public.biens;
DROP POLICY IF EXISTS "Redacteurs creent des biens"    ON public.biens;
DROP POLICY IF EXISTS "Redacteurs modifient les biens" ON public.biens;
DROP POLICY IF EXISTS "Redacteurs suppriment les biens" ON public.biens;

CREATE POLICY "Membres lisent les biens" ON public.biens
  FOR SELECT USING (public.est_membre(organisation_id));
CREATE POLICY "Redacteurs creent des biens" ON public.biens
  FOR INSERT WITH CHECK (public.peut_ecrire(organisation_id));
CREATE POLICY "Redacteurs modifient les biens" ON public.biens
  FOR UPDATE USING (public.peut_ecrire(organisation_id))
          WITH CHECK (public.peut_ecrire(organisation_id));
CREATE POLICY "Redacteurs suppriment les biens" ON public.biens
  FOR DELETE USING (public.peut_ecrire(organisation_id));

DROP POLICY IF EXISTS "Membres lisent les locataires"        ON public.locataires;
DROP POLICY IF EXISTS "Redacteurs creent des locataires"     ON public.locataires;
DROP POLICY IF EXISTS "Redacteurs modifient les locataires"  ON public.locataires;
DROP POLICY IF EXISTS "Redacteurs suppriment les locataires" ON public.locataires;

CREATE POLICY "Membres lisent les locataires" ON public.locataires
  FOR SELECT USING (public.est_membre(organisation_id));
CREATE POLICY "Redacteurs creent des locataires" ON public.locataires
  FOR INSERT WITH CHECK (public.peut_ecrire(organisation_id));
CREATE POLICY "Redacteurs modifient les locataires" ON public.locataires
  FOR UPDATE USING (public.peut_ecrire(organisation_id))
          WITH CHECK (public.peut_ecrire(organisation_id));
CREATE POLICY "Redacteurs suppriment les locataires" ON public.locataires
  FOR DELETE USING (public.peut_ecrire(organisation_id));

DROP POLICY IF EXISTS "Membres lisent les paiements"        ON public.paiements;
DROP POLICY IF EXISTS "Redacteurs creent des paiements"     ON public.paiements;
DROP POLICY IF EXISTS "Redacteurs modifient les paiements"  ON public.paiements;
DROP POLICY IF EXISTS "Redacteurs suppriment les paiements" ON public.paiements;

CREATE POLICY "Membres lisent les paiements" ON public.paiements
  FOR SELECT USING (public.est_membre(organisation_id));
CREATE POLICY "Redacteurs creent des paiements" ON public.paiements
  FOR INSERT WITH CHECK (public.peut_ecrire(organisation_id));
CREATE POLICY "Redacteurs modifient les paiements" ON public.paiements
  FOR UPDATE USING (public.peut_ecrire(organisation_id))
          WITH CHECK (public.peut_ecrire(organisation_id));
CREATE POLICY "Redacteurs suppriment les paiements" ON public.paiements
  FOR DELETE USING (public.peut_ecrire(organisation_id));

DROP POLICY IF EXISTS "Membres lisent les parametres"      ON public.parametres;
DROP POLICY IF EXISTS "Proprietaires gerent les parametres" ON public.parametres;

CREATE POLICY "Membres lisent les parametres" ON public.parametres
  FOR SELECT USING (public.est_membre(organisation_id));
CREATE POLICY "Proprietaires gerent les parametres" ON public.parametres
  FOR ALL USING (public.peut_ecrire(organisation_id))
          WITH CHECK (public.peut_ecrire(organisation_id));
