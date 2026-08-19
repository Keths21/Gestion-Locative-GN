-- ============================================================================
--  Module Travaux & Chantier · Lot B — pilotage financier
--
--  Le modèle repose sur une distinction que l'on confond souvent, et dont
--  dépend la justesse de tout le suivi :
--
--    devis    → un engagement, pas encore une dépense
--    facture  → une dépense réalisée
--    avenant  → ne dépense rien : il AUGMENTE le prévu, et ronge la réserve
--
--  Les additionner indistinctement donnerait un « réalisé » gonflé par des
--  devis jamais honorés, et masquerait le seul chiffre qui compte en cours de
--  chantier : ce qu'il reste d'imprévus avant la rallonge.
--
--  Les tables filles ne portent PAS d'organisation_id. Leur RLS passe par le
--  chantier : une seconde source de vérité pourrait diverger de la première,
--  et un accès invité s'en trouverait faussé.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.postes_budget (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  corps_etat   TEXT NOT NULL DEFAULT 'divers'
               CHECK (corps_etat IN ('viabilisation', 'gros_oeuvre', 'second_oeuvre',
                                     'finitions', 'equipements', 'honoraires', 'divers')),
  libelle      TEXT NOT NULL,
  montant_prevu NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ordre        INTEGER NOT NULL DEFAULT 0,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS postes_budget_chantier_idx ON public.postes_budget (chantier_id, ordre);

CREATE TABLE IF NOT EXISTS public.depenses_chantier (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  -- Nullable : une facture peut arriver avant qu'on ait décidé de son poste.
  poste_id     UUID REFERENCES public.postes_budget(id) ON DELETE SET NULL,
  libelle      TEXT NOT NULL,
  montant      NUMERIC(18, 2) NOT NULL,
  type         TEXT NOT NULL DEFAULT 'facture'
               CHECK (type IN ('devis', 'facture', 'avenant')),
  statut       TEXT NOT NULL DEFAULT 'valide'
               CHECK (statut IN ('en_attente', 'valide', 'paye', 'annule')),
  reference    TEXT,
  date_depense DATE NOT NULL DEFAULT current_date,
  -- Chemin dans le bucket Storage, quand le document est joint.
  document     TEXT,
  cree_par     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS depenses_chantier_idx ON public.depenses_chantier (chantier_id, date_depense DESC);
CREATE INDEX IF NOT EXISTS depenses_poste_idx    ON public.depenses_chantier (poste_id);

-- ----------------------------------------------------------------------------
--  Horodatage
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.maj_modifie_le()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.modifie_le := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maj_postes ON public.postes_budget;
CREATE TRIGGER trg_maj_postes BEFORE UPDATE ON public.postes_budget
  FOR EACH ROW EXECUTE FUNCTION public.maj_modifie_le();

DROP TRIGGER IF EXISTS trg_maj_depenses ON public.depenses_chantier;
CREATE TRIGGER trg_maj_depenses BEFORE UPDATE ON public.depenses_chantier
  FOR EACH ROW EXECUTE FUNCTION public.maj_modifie_le();

-- ----------------------------------------------------------------------------
--  RLS : entièrement dérivée de l'accès au chantier
-- ----------------------------------------------------------------------------

ALTER TABLE public.postes_budget     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depenses_chantier ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture des postes"  ON public.postes_budget;
DROP POLICY IF EXISTS "Gestion des postes"  ON public.postes_budget;
CREATE POLICY "Lecture des postes" ON public.postes_budget
  FOR SELECT USING (public.acces_chantier_lecture(chantier_id));
CREATE POLICY "Gestion des postes" ON public.postes_budget
  FOR ALL USING (public.acces_chantier_ecriture(chantier_id))
          WITH CHECK (public.acces_chantier_ecriture(chantier_id));

DROP POLICY IF EXISTS "Lecture des depenses" ON public.depenses_chantier;
DROP POLICY IF EXISTS "Gestion des depenses" ON public.depenses_chantier;
CREATE POLICY "Lecture des depenses" ON public.depenses_chantier
  FOR SELECT USING (public.acces_chantier_lecture(chantier_id));
CREATE POLICY "Gestion des depenses" ON public.depenses_chantier
  FOR ALL USING (public.acces_chantier_ecriture(chantier_id))
          WITH CHECK (public.acces_chantier_ecriture(chantier_id));

-- ----------------------------------------------------------------------------
--  Postes standard
--
--  Un chantier vide n'aide personne à démarrer. Ce découpage est celui d'une
--  construction guinéenne courante ; il reste entièrement modifiable.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.creer_postes_standard(c UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO public.postes_budget (chantier_id, corps_etat, libelle, ordre)
  VALUES
    (c, 'viabilisation',  'Viabilisation et raccordements', 1),
    (c, 'gros_oeuvre',    'Terrassement et fondations',     2),
    (c, 'gros_oeuvre',    'Élévation et charpente',         3),
    (c, 'second_oeuvre',  'Toiture et étanchéité',          4),
    (c, 'second_oeuvre',  'Menuiseries',                    5),
    (c, 'second_oeuvre',  'Plomberie et électricité',       6),
    (c, 'finitions',      'Enduits, peinture et carrelage', 7),
    (c, 'equipements',    'Équipements et sanitaires',      8),
    (c, 'honoraires',     'Honoraires et études',           9);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ----------------------------------------------------------------------------
--  Synthèse budgétaire
--
--  Quatre montants par poste, dans l'ordre où ils se succèdent réellement :
--    prévu   = budget de départ + avenants acceptés
--    engagé  = devis validés — ce à quoi on s'est engagé
--    réalisé = factures — ce qui est effectivement dû ou payé
--    payé    = factures soldées
--
--  Et, au global, la seule question qui vaille en cours de chantier :
--  combien reste-t-il de réserve d'imprévus avant la rallonge ?
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.synthese_budget_chantier(c UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public AS $$
WITH agr AS (
  SELECT
    p.id, p.corps_etat, p.libelle, p.ordre,
    p.montant_prevu::float8 AS base,
    COALESCE(SUM(d.montant) FILTER (WHERE d.type = 'avenant' AND d.statut <> 'annule'), 0)::float8 AS avenants,
    COALESCE(SUM(d.montant) FILTER (WHERE d.type = 'devis'   AND d.statut = 'valide'),   0)::float8 AS engage,
    COALESCE(SUM(d.montant) FILTER (WHERE d.type = 'facture' AND d.statut <> 'annule'),  0)::float8 AS realise,
    COALESCE(SUM(d.montant) FILTER (WHERE d.type = 'facture' AND d.statut = 'paye'),     0)::float8 AS paye
  FROM public.postes_budget p
  LEFT JOIN public.depenses_chantier d ON d.poste_id = p.id
  WHERE p.chantier_id = c
  GROUP BY p.id, p.corps_etat, p.libelle, p.ordre, p.montant_prevu
),
ch AS (
  SELECT COALESCE(budget_initial, 0)::float8   AS budget_initial,
         COALESCE(reserve_imprevus, 0)::float8 AS reserve
    FROM public.chantiers WHERE id = c
),
-- Dépenses non affectées à un poste : sans elles, le total global mentirait.
orphelines AS (
  SELECT COALESCE(SUM(montant) FILTER (WHERE type = 'facture' AND statut <> 'annule'), 0)::float8 AS realise,
         COALESCE(SUM(montant) FILTER (WHERE type = 'devis'   AND statut = 'valide'),  0)::float8 AS engage,
         COUNT(*) FILTER (WHERE poste_id IS NULL)                                                 AS nombre
    FROM public.depenses_chantier WHERE chantier_id = c AND poste_id IS NULL
)
SELECT jsonb_build_object(
  'budget_initial',   (SELECT budget_initial FROM ch),
  'reserve_imprevus', (SELECT reserve FROM ch),
  'prevu_total',      (SELECT COALESCE(SUM(base + avenants), 0) FROM agr),
  'avenants_total',   (SELECT COALESCE(SUM(avenants), 0) FROM agr),
  'engage_total',     (SELECT COALESCE(SUM(engage), 0) FROM agr) + (SELECT engage FROM orphelines),
  'realise_total',    (SELECT COALESCE(SUM(realise), 0) FROM agr) + (SELECT realise FROM orphelines),
  'paye_total',       (SELECT COALESCE(SUM(paye), 0) FROM agr),
  'reserve_restante', (SELECT reserve FROM ch) - (SELECT COALESCE(SUM(avenants), 0) FROM agr),
  'depassement',      GREATEST(0, (SELECT COALESCE(SUM(avenants), 0) FROM agr) - (SELECT reserve FROM ch)),
  'depenses_sans_poste', (SELECT nombre FROM orphelines),
  'postes', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'corps_etat', corps_etat, 'libelle', libelle, 'ordre', ordre,
      'prevu', base + avenants, 'base', base, 'avenants', avenants,
      'engage', engage, 'realise', realise, 'paye', paye,
      'ecart', (base + avenants) - realise
    ) ORDER BY ordre), '[]'::jsonb) FROM agr)
);
$$;
