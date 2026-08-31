-- Lots E et F — annuaire des intervenants, et échéancier de paiement.
-- Contenu appliqué en base le 26/08/2026 ; ce fichier tient lieu de référence
-- versionnée.
--
-- Trois choix structurants :
--
-- 1. L'annuaire appartient à l'organisation, l'affectation au chantier : un
--    maçon travaille sur plusieurs chantiers, sa décennale ne doit être
--    saisie qu'une fois.
--
-- 2. La lecture des intervenants suit la double voie d'accès. Sans cela, un
--    architecte invité verrait la fiche du chantier sans savoir qui y
--    travaille — l'information la plus utile à un maître d'œuvre.
--
-- 3. valider_jalon rend exigibles les échéances qui en dépendent. C'est le
--    lien entre l'avancement constaté et le décaissement : tant que l'ouvrage
--    n'est pas réceptionné, l'échéance reste verrouillée.
--
-- echeances_a_alerter écarte ce qui a été notifié dans les sept derniers
-- jours : un rappel qui se répète cesse d'être lu.

-- SQL rapatrié depuis l'historique Supabase le 31/08/2026. Ce fichier ne
-- contenait que les commentaires ci-dessus : les trois tables qu'il décrit
-- n'existaient nulle part dans le dépôt.

-- Un artisan travaille sur plusieurs chantiers : l'annuaire appartient donc à
-- l'organisation, et l'affectation est une table à part.
CREATE TABLE IF NOT EXISTS public.intervenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  nom               TEXT NOT NULL,
  entreprise        TEXT,
  metier            TEXT NOT NULL DEFAULT 'autre'
                    CHECK (metier IN ('maconnerie','charpente','couverture','plomberie',
                                      'electricite','menuiserie','peinture','carrelage',
                                      'terrassement','geometre','architecte','bureau_etudes','autre')),
  telephone         TEXT,
  email             TEXT,
  adresse           TEXT,
  rccm              TEXT,
  nif               TEXT,
  -- La décennale est la vérification qu'on oublie de faire et qui coûte cher
  -- en cas de sinistre : sa date de validité est un champ à part entière.
  decennale_numero  TEXT,
  decennale_assureur TEXT,
  decennale_valide_jusqu_au DATE,
  notes             TEXT,
  cree_le           TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intervenants_org_idx ON public.intervenants (organisation_id, nom);

CREATE TABLE IF NOT EXISTS public.interventions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id     UUID NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  intervenant_id  UUID NOT NULL REFERENCES public.intervenants(id) ON DELETE CASCADE,
  lot             TEXT NOT NULL DEFAULT 'divers'
                  CHECK (lot IN ('viabilisation','gros_oeuvre','second_oeuvre',
                                 'finitions','equipements','honoraires','divers')),
  montant_marche  NUMERIC(18,2),
  date_debut      DATE,
  date_fin        DATE,
  statut          TEXT NOT NULL DEFAULT 'prevu'
                  CHECK (statut IN ('prevu','en_cours','termine','resilie')),
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS interventions_unique
  ON public.interventions (chantier_id, intervenant_id, lot);
CREATE INDEX IF NOT EXISTS interventions_chantier_idx ON public.interventions (chantier_id);

-- Échéancier : appels de fonds, liés ou non à un jalon.
CREATE TABLE IF NOT EXISTS public.echeances_chantier (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id     UUID NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  -- Lien facultatif : une échéance peut être calendaire, ou conditionnée par
  -- la validation d'un jalon.
  jalon_id        UUID REFERENCES public.jalons_chantier(id) ON DELETE SET NULL,
  intervenant_id  UUID REFERENCES public.intervenants(id) ON DELETE SET NULL,
  libelle         TEXT NOT NULL,
  montant         NUMERIC(18,2) NOT NULL,
  date_echeance   DATE NOT NULL,
  statut          TEXT NOT NULL DEFAULT 'prevue'
                  CHECK (statut IN ('prevue','exigible','payee','annulee')),
  montant_paye    NUMERIC(18,2) NOT NULL DEFAULT 0,
  date_paiement   DATE,
  alerte_envoyee_le TIMESTAMPTZ,
  ordre           INTEGER NOT NULL DEFAULT 0,
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS echeances_chantier_idx ON public.echeances_chantier (chantier_id, date_echeance);
CREATE INDEX IF NOT EXISTS echeances_jalon_idx    ON public.echeances_chantier (jalon_id);

DROP TRIGGER IF EXISTS trg_maj_intervenants ON public.intervenants;
CREATE TRIGGER trg_maj_intervenants BEFORE UPDATE ON public.intervenants
  FOR EACH ROW EXECUTE FUNCTION public.maj_modifie_le();

DROP TRIGGER IF EXISTS trg_maj_echeances ON public.echeances_chantier;
CREATE TRIGGER trg_maj_echeances BEFORE UPDATE ON public.echeances_chantier
  FOR EACH ROW EXECUTE FUNCTION public.maj_modifie_le();

DROP TRIGGER IF EXISTS trg_org_intervenants ON public.intervenants;
CREATE TRIGGER trg_org_intervenants BEFORE INSERT ON public.intervenants
  FOR EACH ROW EXECUTE FUNCTION public.remplir_organisation();

ALTER TABLE public.intervenants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interventions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.echeances_chantier ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture des intervenants" ON public.intervenants;
DROP POLICY IF EXISTS "Gestion des intervenants" ON public.intervenants;

-- L'architecte invité doit voir les artisans de SON chantier — sans quoi la
-- fiche resterait muette sur qui y travaille.
CREATE POLICY "Lecture des intervenants" ON public.intervenants
  FOR SELECT USING (
    public.est_membre(organisation_id)
    OR EXISTS (SELECT 1 FROM public.interventions i
                WHERE i.intervenant_id = intervenants.id
                  AND public.acces_chantier_explicite(i.chantier_id))
  );

CREATE POLICY "Gestion des intervenants" ON public.intervenants
  FOR ALL USING (public.peut_ecrire(organisation_id))
          WITH CHECK (public.peut_ecrire(organisation_id));

DROP POLICY IF EXISTS "Lecture des interventions" ON public.interventions;
DROP POLICY IF EXISTS "Gestion des interventions" ON public.interventions;
CREATE POLICY "Lecture des interventions" ON public.interventions
  FOR SELECT USING (public.acces_chantier_lecture(chantier_id));
CREATE POLICY "Gestion des interventions" ON public.interventions
  FOR ALL USING (public.acces_chantier_ecriture(chantier_id))
          WITH CHECK (public.acces_chantier_ecriture(chantier_id));

DROP POLICY IF EXISTS "Lecture des echeances" ON public.echeances_chantier;
DROP POLICY IF EXISTS "Gestion des echeances" ON public.echeances_chantier;
CREATE POLICY "Lecture des echeances" ON public.echeances_chantier
  FOR SELECT USING (public.acces_chantier_lecture(chantier_id));
CREATE POLICY "Gestion des echeances" ON public.echeances_chantier
  FOR ALL USING (public.acces_chantier_ecriture(chantier_id))
          WITH CHECK (public.acces_chantier_ecriture(chantier_id));

-- Validation d'un jalon : rend exigibles les échéances qui en dépendent.
-- Redéfinit la version posée par 20260819120000_phases_jalons.sql.
CREATE OR REPLACE FUNCTION public.valider_jalon(j UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_row public.jalons_chantier;
  v_n   INTEGER := 0;
BEGIN
  SELECT * INTO v_row FROM public.jalons_chantier WHERE id = j;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jalon introuvable ou inaccessible.';
  END IF;

  IF v_row.date_validation IS NOT NULL THEN
    RETURN jsonb_build_object('deja_valide', true, 'montant_libere', 0, 'echeances_exigibles', 0);
  END IF;

  UPDATE public.jalons_chantier
     SET date_validation    = now(),
         valide_par         = auth.uid(),
         paiement_libere_le = CASE WHEN montant_a_liberer IS NOT NULL THEN now() END
   WHERE id = j;

  -- Les échéances conditionnées par ce jalon deviennent exigibles.
  UPDATE public.echeances_chantier
     SET statut = 'exigible'
   WHERE jalon_id = j AND statut = 'prevue';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object(
    'deja_valide', false,
    'montant_libere', COALESCE(v_row.montant_a_liberer, 0),
    'echeances_exigibles', v_n
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.synthese_echeancier_chantier(c UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public AS $$
WITH e AS (
  SELECT ec.*, i.nom AS intervenant_nom, jl.nom AS jalon_nom,
         (jl.id IS NOT NULL AND jl.date_validation IS NULL) AS bloquee_par_jalon
    FROM public.echeances_chantier ec
    LEFT JOIN public.intervenants i    ON i.id = ec.intervenant_id
    LEFT JOIN public.jalons_chantier jl ON jl.id = ec.jalon_id
   WHERE ec.chantier_id = c
)
SELECT jsonb_build_object(
  'total_prevu',   (SELECT COALESCE(SUM(montant),0)::float8 FROM e WHERE statut <> 'annulee'),
  'total_paye',    (SELECT COALESCE(SUM(montant_paye),0)::float8 FROM e),
  'reste_a_payer', (SELECT COALESCE(SUM(montant - montant_paye),0)::float8
                      FROM e WHERE statut IN ('prevue','exigible')),
  'exigible_maintenant', (SELECT COALESCE(SUM(montant - montant_paye),0)::float8
                            FROM e WHERE statut = 'exigible'),
  -- Une échéance dépassée et non soldée : le signal d'un retard de paiement.
  'en_retard_nombre', (SELECT count(*) FROM e
                        WHERE statut IN ('prevue','exigible')
                          AND date_echeance < current_date),
  'a_venir_7j', (SELECT count(*) FROM e
                  WHERE statut IN ('prevue','exigible')
                    AND date_echeance BETWEEN current_date AND current_date + 7),
  'echeances', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'libelle', libelle, 'montant', montant::float8,
      'montant_paye', montant_paye::float8, 'date_echeance', date_echeance,
      'statut', statut, 'date_paiement', date_paiement,
      'intervenant_nom', intervenant_nom, 'jalon_nom', jalon_nom,
      'bloquee_par_jalon', bloquee_par_jalon,
      'en_retard', (statut IN ('prevue','exigible') AND date_echeance < current_date),
      'alerte_envoyee_le', alerte_envoyee_le
    ) ORDER BY date_echeance), '[]'::jsonb) FROM e)
);
$$;

-- Échéances dues sous `jours` et non encore alertées. La contrainte sur
-- alerte_envoyee_le évite qu'un appel répété inonde le destinataire : un rappel
-- qui se répète cesse d'être lu.
CREATE OR REPLACE FUNCTION public.echeances_a_alerter(jours INTEGER DEFAULT 3)
RETURNS TABLE (id UUID, chantier_id UUID, chantier_nom TEXT, libelle TEXT,
               montant FLOAT8, date_echeance DATE, jours_restants INTEGER)
LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.id, e.chantier_id, ch.nom, e.libelle, e.montant::float8, e.date_echeance,
         (e.date_echeance - current_date)::integer
    FROM public.echeances_chantier e
    JOIN public.chantiers ch ON ch.id = e.chantier_id
   WHERE e.statut IN ('prevue','exigible')
     AND e.montant_paye < e.montant
     AND e.date_echeance <= current_date + jours
     AND (e.alerte_envoyee_le IS NULL
          OR e.alerte_envoyee_le < now() - interval '7 days')
   ORDER BY e.date_echeance;
$$;
