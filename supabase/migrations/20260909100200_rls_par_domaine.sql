-- Réécriture des policies par domaine.
--
-- Les sept tables filles des chantiers — postes, dépenses, phases, jalons,
-- journal, interventions, échéances — passent toutes par
-- acces_chantier_lecture/ecriture. Modifier ces deux fonctions suffit :
-- réécrire leurs quatorze policies aurait multiplié les occasions d'en oublier
-- une.

-- ── LOCATIF ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Membres lisent les biens"        ON public.biens;
DROP POLICY IF EXISTS "Redacteurs creent des biens"     ON public.biens;
DROP POLICY IF EXISTS "Redacteurs modifient les biens"  ON public.biens;
DROP POLICY IF EXISTS "Redacteurs suppriment les biens" ON public.biens;
CREATE POLICY "Lecture des biens" ON public.biens
  FOR SELECT USING (public.peut_lire_dom(organisation_id, 'locatif'));
CREATE POLICY "Creation de biens" ON public.biens
  FOR INSERT WITH CHECK (public.peut_ecrire_dom(organisation_id, 'locatif'));
CREATE POLICY "Modification des biens" ON public.biens
  FOR UPDATE USING (public.peut_ecrire_dom(organisation_id, 'locatif'))
          WITH CHECK (public.peut_ecrire_dom(organisation_id, 'locatif'));
CREATE POLICY "Suppression des biens" ON public.biens
  FOR DELETE USING (public.peut_ecrire_dom(organisation_id, 'locatif'));

DROP POLICY IF EXISTS "Membres lisent les locataires"        ON public.locataires;
DROP POLICY IF EXISTS "Redacteurs creent des locataires"     ON public.locataires;
DROP POLICY IF EXISTS "Redacteurs modifient les locataires"  ON public.locataires;
DROP POLICY IF EXISTS "Redacteurs suppriment les locataires" ON public.locataires;
CREATE POLICY "Lecture des locataires" ON public.locataires
  FOR SELECT USING (public.peut_lire_dom(organisation_id, 'locatif'));
CREATE POLICY "Creation de locataires" ON public.locataires
  FOR INSERT WITH CHECK (public.peut_ecrire_dom(organisation_id, 'locatif'));
CREATE POLICY "Modification des locataires" ON public.locataires
  FOR UPDATE USING (public.peut_ecrire_dom(organisation_id, 'locatif'))
          WITH CHECK (public.peut_ecrire_dom(organisation_id, 'locatif'));
CREATE POLICY "Suppression des locataires" ON public.locataires
  FOR DELETE USING (public.peut_ecrire_dom(organisation_id, 'locatif'));

DROP POLICY IF EXISTS "Membres lisent les paiements"        ON public.paiements;
DROP POLICY IF EXISTS "Redacteurs creent des paiements"     ON public.paiements;
DROP POLICY IF EXISTS "Redacteurs modifient les paiements"  ON public.paiements;
DROP POLICY IF EXISTS "Redacteurs suppriment les paiements" ON public.paiements;
CREATE POLICY "Lecture des paiements" ON public.paiements
  FOR SELECT USING (public.peut_lire_dom(organisation_id, 'locatif'));
CREATE POLICY "Creation de paiements" ON public.paiements
  FOR INSERT WITH CHECK (public.peut_ecrire_dom(organisation_id, 'locatif'));
CREATE POLICY "Modification des paiements" ON public.paiements
  FOR UPDATE USING (public.peut_ecrire_dom(organisation_id, 'locatif'))
          WITH CHECK (public.peut_ecrire_dom(organisation_id, 'locatif'));
CREATE POLICY "Suppression des paiements" ON public.paiements
  FOR DELETE USING (public.peut_ecrire_dom(organisation_id, 'locatif'));

-- ── FONCIER ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Membres lisent les parcelles"        ON public.parcelles;
DROP POLICY IF EXISTS "Redacteurs creent des parcelles"     ON public.parcelles;
DROP POLICY IF EXISTS "Redacteurs modifient les parcelles"  ON public.parcelles;
DROP POLICY IF EXISTS "Redacteurs suppriment les parcelles" ON public.parcelles;
CREATE POLICY "Lecture des parcelles" ON public.parcelles
  FOR SELECT USING (public.peut_lire_dom(organisation_id, 'foncier'));
CREATE POLICY "Creation de parcelles" ON public.parcelles
  FOR INSERT WITH CHECK (public.peut_ecrire_dom(organisation_id, 'foncier'));
CREATE POLICY "Modification des parcelles" ON public.parcelles
  FOR UPDATE USING (public.peut_ecrire_dom(organisation_id, 'foncier'))
          WITH CHECK (public.peut_ecrire_dom(organisation_id, 'foncier'));
CREATE POLICY "Suppression des parcelles" ON public.parcelles
  FOR DELETE USING (public.peut_ecrire_dom(organisation_id, 'foncier'));

DROP POLICY IF EXISTS "Membres lisent les documents"    ON public.parcelle_documents;
DROP POLICY IF EXISTS "Redacteurs gerent les documents" ON public.parcelle_documents;
CREATE POLICY "Lecture des documents de parcelle" ON public.parcelle_documents
  FOR SELECT USING (public.peut_lire_dom(organisation_id, 'foncier'));
CREATE POLICY "Gestion des documents de parcelle" ON public.parcelle_documents
  FOR ALL USING (public.peut_ecrire_dom(organisation_id, 'foncier'))
          WITH CHECK (public.peut_ecrire_dom(organisation_id, 'foncier'));

DROP POLICY IF EXISTS "Membres lisent le journal"   ON public.journal_parcelles;
DROP POLICY IF EXISTS "Membres ecrivent au journal" ON public.journal_parcelles;
CREATE POLICY "Lecture du journal des parcelles" ON public.journal_parcelles
  FOR SELECT USING (public.peut_lire_dom(organisation_id, 'foncier'));
CREATE POLICY "Ecriture au journal des parcelles" ON public.journal_parcelles
  FOR INSERT WITH CHECK (public.peut_lire_dom(organisation_id, 'foncier'));

-- ── CHANTIERS ──────────────────────────────────────────────────────────────
-- La seconde voie d'accès — l'invité à un chantier précis — est préservée : un
-- architecte convié n'est pas un collaborateur de l'agence, et son accès ne
-- dépend d'aucun domaine.
CREATE OR REPLACE FUNCTION public.acces_chantier_lecture(c UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chantiers ch
                  WHERE ch.id = c AND public.peut_lire_dom(ch.organisation_id, 'chantiers'))
      OR public.acces_chantier_explicite(c);
$$;

CREATE OR REPLACE FUNCTION public.acces_chantier_ecriture(c UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chantiers ch
                  WHERE ch.id = c AND public.peut_ecrire_dom(ch.organisation_id, 'chantiers'))
      OR public.acces_chantier_explicite(c, true);
$$;

DROP POLICY IF EXISTS "Lecture des chantiers"    ON public.chantiers;
DROP POLICY IF EXISTS "Creation de chantier"     ON public.chantiers;
DROP POLICY IF EXISTS "Modification de chantier" ON public.chantiers;
DROP POLICY IF EXISTS "Suppression de chantier"  ON public.chantiers;

-- Ces quatre lisent `organisation_id` sur la ligne courante plutôt que de
-- relire `chantiers` : une policy posée SUR une table ne doit pas l'interroger,
-- sinon un INSERT ... RETURNING échoue — correctif du 19/08, à ne pas défaire.
CREATE POLICY "Lecture des chantiers" ON public.chantiers
  FOR SELECT USING (public.peut_lire_dom(organisation_id, 'chantiers')
                    OR public.acces_chantier_explicite(id));
CREATE POLICY "Creation de chantier" ON public.chantiers
  FOR INSERT WITH CHECK (public.peut_ecrire_dom(organisation_id, 'chantiers'));
CREATE POLICY "Modification de chantier" ON public.chantiers
  FOR UPDATE USING (public.peut_ecrire_dom(organisation_id, 'chantiers')
                    OR public.acces_chantier_explicite(id, true))
          WITH CHECK (public.peut_ecrire_dom(organisation_id, 'chantiers')
                    OR public.acces_chantier_explicite(id, true));
CREATE POLICY "Suppression de chantier" ON public.chantiers
  FOR DELETE USING (public.peut_ecrire_dom(organisation_id, 'chantiers'));

DROP POLICY IF EXISTS "Lecture des intervenants" ON public.intervenants;
DROP POLICY IF EXISTS "Gestion des intervenants" ON public.intervenants;
CREATE POLICY "Lecture des intervenants" ON public.intervenants
  FOR SELECT USING (
    public.peut_lire_dom(organisation_id, 'chantiers')
    OR EXISTS (SELECT 1 FROM public.interventions i
                WHERE i.intervenant_id = intervenants.id
                  AND public.acces_chantier_explicite(i.chantier_id))
  );
CREATE POLICY "Gestion des intervenants" ON public.intervenants
  FOR ALL USING (public.peut_ecrire_dom(organisation_id, 'chantiers'))
          WITH CHECK (public.peut_ecrire_dom(organisation_id, 'chantiers'));
