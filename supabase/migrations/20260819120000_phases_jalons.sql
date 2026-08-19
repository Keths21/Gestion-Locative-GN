-- ============================================================================
--  Module Travaux & Chantier · Lot C — planning, jalons et avancement
--
--  L'avancement global est pondéré par le budget de chaque phase, non par
--  leur nombre. Compter les phases afficherait 50 % après viabilisation et
--  terrassement, quand l'essentiel du coût reste devant : un chiffre
--  rassurant et faux, sur lequel on prend pourtant des décisions.
--
--  Quand aucune phase n'a de montant, la pondération retombe sur une moyenne
--  simple — et la synthèse le DIT, plutôt que de laisser croire à une
--  précision qu'elle n'a pas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.phases_chantier (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id        UUID NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  nom                TEXT NOT NULL,
  ordre              INTEGER NOT NULL DEFAULT 0,
  -- Part du budget attribuée à cette phase : c'est elle qui la pondère.
  montant_prevu      NUMERIC(18, 2) NOT NULL DEFAULT 0,
  avancement_pct     INTEGER NOT NULL DEFAULT 0 CHECK (avancement_pct BETWEEN 0 AND 100),
  date_prevue_debut  DATE,
  date_prevue_fin    DATE,
  date_reelle_debut  DATE,
  date_reelle_fin    DATE,
  cree_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phases_chantier_idx ON public.phases_chantier (chantier_id, ordre);

CREATE TABLE IF NOT EXISTS public.jalons_chantier (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id         UUID NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  phase_id            UUID REFERENCES public.phases_chantier(id) ON DELETE SET NULL,
  nom                 TEXT NOT NULL,
  description         TEXT,
  date_prevue         DATE,
  -- Validation : horodatée et signée. C'est ce qui fait foi pour libérer
  -- un paiement, on ne peut donc pas se contenter d'un booléen.
  date_validation     TIMESTAMPTZ,
  valide_par          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Montant à débloquer quand le jalon est validé. Le lot F en fera une
  -- échéance ; ici on se contente de constater qu'il devient exigible.
  montant_a_liberer   NUMERIC(18, 2),
  paiement_libere_le  TIMESTAMPTZ,
  ordre               INTEGER NOT NULL DEFAULT 0,
  cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jalons_chantier_idx ON public.jalons_chantier (chantier_id, ordre);
CREATE INDEX IF NOT EXISTS jalons_phase_idx    ON public.jalons_chantier (phase_id);

DROP TRIGGER IF EXISTS trg_maj_phases ON public.phases_chantier;
CREATE TRIGGER trg_maj_phases BEFORE UPDATE ON public.phases_chantier
  FOR EACH ROW EXECUTE FUNCTION public.maj_modifie_le();

DROP TRIGGER IF EXISTS trg_maj_jalons ON public.jalons_chantier;
CREATE TRIGGER trg_maj_jalons BEFORE UPDATE ON public.jalons_chantier
  FOR EACH ROW EXECUTE FUNCTION public.maj_modifie_le();

-- ----------------------------------------------------------------------------
--  RLS : dérivée de l'accès au chantier, comme le budget
-- ----------------------------------------------------------------------------

ALTER TABLE public.phases_chantier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalons_chantier ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture des phases" ON public.phases_chantier;
DROP POLICY IF EXISTS "Gestion des phases" ON public.phases_chantier;
CREATE POLICY "Lecture des phases" ON public.phases_chantier
  FOR SELECT USING (public.acces_chantier_lecture(chantier_id));
CREATE POLICY "Gestion des phases" ON public.phases_chantier
  FOR ALL USING (public.acces_chantier_ecriture(chantier_id))
          WITH CHECK (public.acces_chantier_ecriture(chantier_id));

DROP POLICY IF EXISTS "Lecture des jalons" ON public.jalons_chantier;
DROP POLICY IF EXISTS "Gestion des jalons" ON public.jalons_chantier;
CREATE POLICY "Lecture des jalons" ON public.jalons_chantier
  FOR SELECT USING (public.acces_chantier_lecture(chantier_id));
CREATE POLICY "Gestion des jalons" ON public.jalons_chantier
  FOR ALL USING (public.acces_chantier_ecriture(chantier_id))
          WITH CHECK (public.acces_chantier_ecriture(chantier_id));

-- ----------------------------------------------------------------------------
--  Phases standard
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.creer_phases_standard(c UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO public.phases_chantier (chantier_id, nom, ordre) VALUES
    (c, 'Viabilisation',      1),
    (c, 'Terrassement',       2),
    (c, 'Fondations',         3),
    (c, 'Élévation',          4),
    (c, 'Hors d''eau',        5),
    (c, 'Second œuvre',       6),
    (c, 'Finitions',          7),
    (c, 'Livraison',          8);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ----------------------------------------------------------------------------
--  Validation d'un jalon
--
--  Rend le paiement associé exigible. Idempotente : revalider un jalon déjà
--  validé ne redéclenche rien — un double clic ne doit pas libérer deux fois.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.valider_jalon(j UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_row public.jalons_chantier;
BEGIN
  SELECT * INTO v_row FROM public.jalons_chantier WHERE id = j;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jalon introuvable ou inaccessible.';
  END IF;

  IF v_row.date_validation IS NOT NULL THEN
    RETURN jsonb_build_object('deja_valide', true, 'montant_libere', 0);
  END IF;

  UPDATE public.jalons_chantier
     SET date_validation    = now(),
         valide_par         = auth.uid(),
         paiement_libere_le = CASE WHEN montant_a_liberer IS NOT NULL THEN now() END
   WHERE id = j;

  RETURN jsonb_build_object(
    'deja_valide', false,
    'montant_libere', COALESCE(v_row.montant_a_liberer, 0)
  );
END;
$$;

-- ----------------------------------------------------------------------------
--  Synthèse d'avancement
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.synthese_avancement_chantier(c UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public AS $$
WITH p AS (
  SELECT id, nom, ordre, avancement_pct,
         montant_prevu::float8 AS montant,
         date_prevue_debut, date_prevue_fin, date_reelle_debut, date_reelle_fin
    FROM public.phases_chantier WHERE chantier_id = c
),
poids AS (SELECT COALESCE(SUM(montant), 0) AS total FROM p),
j AS (
  SELECT phase_id, id, nom, date_prevue, date_validation,
         montant_a_liberer::float8 AS montant, ordre
    FROM public.jalons_chantier WHERE chantier_id = c
)
SELECT jsonb_build_object(
  -- Pondéré par le budget si les phases en portent un ; moyenne simple sinon.
  'avancement_global', CASE
      WHEN (SELECT total FROM poids) > 0
        THEN round((SELECT SUM(avancement_pct * montant) / (SELECT total FROM poids) FROM p)::numeric, 1)
      WHEN (SELECT count(*) FROM p) > 0
        THEN round((SELECT AVG(avancement_pct) FROM p)::numeric, 1)
      ELSE 0 END,
  -- Dire laquelle a servi : un pourcentage sans sa méthode invite à le
  -- surinterpréter.
  'ponderation', CASE WHEN (SELECT total FROM poids) > 0 THEN 'budget' ELSE 'egale' END,
  'phases_total',    (SELECT count(*) FROM p),
  'jalons_total',    (SELECT count(*) FROM j),
  'jalons_valides',  (SELECT count(*) FROM j WHERE date_validation IS NOT NULL),
  'montant_libere',  (SELECT COALESCE(SUM(montant), 0) FROM j WHERE date_validation IS NOT NULL),
  'montant_a_venir', (SELECT COALESCE(SUM(montant), 0) FROM j WHERE date_validation IS NULL),
  -- Jalons dont la date prévue est passée sans validation : le vrai signal
  -- de retard, plus parlant qu'un pourcentage.
  'jalons_en_retard', (SELECT count(*) FROM j
                        WHERE date_validation IS NULL
                          AND date_prevue IS NOT NULL
                          AND date_prevue < current_date),
  'phases', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nom', p.nom, 'ordre', p.ordre,
      'avancement_pct', p.avancement_pct,
      'montant_prevu', p.montant,
      'poids_pct', CASE WHEN (SELECT total FROM poids) > 0
                        THEN round((p.montant * 100 / (SELECT total FROM poids))::numeric, 1)
                        ELSE NULL END,
      'date_prevue_debut', p.date_prevue_debut,
      'date_prevue_fin', p.date_prevue_fin,
      'date_reelle_debut', p.date_reelle_debut,
      'date_reelle_fin', p.date_reelle_fin,
      'jalons', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', j.id, 'nom', j.nom, 'date_prevue', j.date_prevue,
          'date_validation', j.date_validation, 'montant_a_liberer', j.montant,
          'en_retard', (j.date_validation IS NULL AND j.date_prevue IS NOT NULL
                        AND j.date_prevue < current_date)
        ) ORDER BY j.ordre, j.date_prevue), '[]'::jsonb)
        FROM j WHERE j.phase_id = p.id)
    ) ORDER BY p.ordre), '[]'::jsonb) FROM p)
);
$$;
