-- ============================================================================
--  Jeu d'essai — villa R+1 à Kipé, chantier conduit aux deux tiers
--
--  Ordres de grandeur guinéens : ~200 m² habitables, 4,75 M GNF/m² tout
--  compris, soit 950 M GNF (≈ 110 000 USD) et 10 % de réserve d'imprévus.
--
--  Le chantier est volontairement imparfait : deux avenants qui entament la
--  réserve aux trois quarts, un signalement bloquant ouvert, et un retard de
--  livraison de charpente consigné au journal. Un jeu d'essai où tout va bien
--  ne prouve rien.
--
--  Aucun jalon n'est formellement en retard : l'échéance suivante (mise hors
--  d'eau, 10/09/2026) n'est pas encore passée. Pour exercer cet affichage,
--  avancer sa date_prevue de quelques semaines.
--
--  Suppression : voir la dernière ligne du fichier.
-- ============================================================================

BEGIN;

-- Le chantier appartient à l'organisation de l'utilisateur courant.
INSERT INTO public.chantiers
  (id, organisation_id, nom, reference, nature, statut, description,
   region, prefecture, commune, quartier, adresse,
   budget_initial, reserve_imprevus, devise,
   date_debut_prevue, date_fin_prevue, date_debut_reelle)
VALUES (
  'e5111111-0000-4000-8000-000000000001',
  public.organisation_courante(),
  '[DÉMO] Villa R+1 — Kipé',
  'CH-2026-001',
  'construction',
  'en_cours',
  'Villa R+1, 4 chambres, 198 m² habitables sur parcelle de 500 m². Maîtrise d''œuvre confiée à un architecte, exécution par entreprise générale.',
  'Conakry', 'Conakry', 'Ratoma', 'Kipé', 'Kipé Centre Émetteur, lot 12',
  950000000, 95000000, 'GNF',
  '2026-02-15', '2027-02-15', '2026-02-22'
);

SELECT public.placer_chantier('e5111111-0000-4000-8000-000000000001', -13.67720, 9.53510);

-- ----------------------------------------------------------------------------
--  Postes de budget
-- ----------------------------------------------------------------------------

SELECT public.creer_postes_standard('e5111111-0000-4000-8000-000000000001');

UPDATE public.postes_budget SET montant_prevu = CASE libelle
  WHEN 'Viabilisation et raccordements' THEN  45000000
  WHEN 'Terrassement et fondations'     THEN 190000000
  WHEN 'Élévation et charpente'         THEN 247000000
  WHEN 'Toiture et étanchéité'          THEN 118000000
  WHEN 'Menuiseries'                    THEN  88000000
  WHEN 'Plomberie et électricité'       THEN  95000000
  WHEN 'Enduits, peinture et carrelage' THEN  76000000
  WHEN 'Équipements et sanitaires'      THEN  44000000
  WHEN 'Honoraires et études'           THEN  47000000
  ELSE montant_prevu END
WHERE chantier_id = 'e5111111-0000-4000-8000-000000000001';

-- ----------------------------------------------------------------------------
--  Devis, factures et avenants
--
--  Les trois natures se distinguent : le devis engage, la facture dépense,
--  l'avenant augmente le prévu et consomme la réserve.
-- ----------------------------------------------------------------------------

INSERT INTO public.depenses_chantier
  (chantier_id, poste_id, libelle, montant, type, statut, reference, date_depense)
SELECT 'e5111111-0000-4000-8000-000000000001', p.id, d.libelle, d.montant, d.type, d.statut, d.reference, d.jour
FROM (VALUES
  -- Viabilisation
  ('Viabilisation et raccordements', 'Raccordement SEG (eau)',            18500000, 'facture', 'paye',       'F-SEG-0412',  DATE '2026-03-04'),
  ('Viabilisation et raccordements', 'Branchement EDG (électricité)',     24000000, 'facture', 'paye',       'F-EDG-1188',  DATE '2026-03-18'),
  -- Terrassement et fondations
  ('Terrassement et fondations',     'Devis entreprise générale — lot 1', 172000000, 'devis',   'valide',     'DV-EGC-001',  DATE '2026-02-20'),
  ('Terrassement et fondations',     'Terrassement et fouilles',           38000000, 'facture', 'paye',       'F-EGC-001',   DATE '2026-03-28'),
  ('Terrassement et fondations',     'Fondations — tranche 1',             84000000, 'facture', 'paye',       'F-EGC-002',   DATE '2026-04-22'),
  ('Terrassement et fondations',     'Fondations — tranche 2',             50000000, 'facture', 'paye',       'F-EGC-003',   DATE '2026-05-15'),
  ('Terrassement et fondations',     'Avenant — sol argileux, semelles renforcées', 48000000, 'avenant', 'valide', 'AV-001', DATE '2026-04-08'),
  -- Élévation
  ('Élévation et charpente',         'Devis élévation R+1',               228000000, 'devis',   'valide',     'DV-EGC-002',  DATE '2026-05-02'),
  ('Élévation et charpente',         'Élévation RDC',                     112000000, 'facture', 'paye',       'F-EGC-004',   DATE '2026-06-12'),
  ('Élévation et charpente',         'Élévation R+1',                      98000000, 'facture', 'paye',       'F-EGC-005',   DATE '2026-07-20'),
  ('Élévation et charpente',         'Ciment et fer à béton (approvisionnement)', 65000000, 'facture', 'paye', 'F-QUINC-77', DATE '2026-06-02'),
  ('Élévation et charpente',         'Avenant — rehausse mur de clôture',  22000000, 'avenant', 'valide',     'AV-002',      DATE '2026-07-02'),
  -- Toiture
  ('Toiture et étanchéité',          'Devis charpente et couverture',      98000000, 'devis',   'valide',     'DV-TOIT-01',  DATE '2026-07-25'),
  ('Toiture et étanchéité',          'Charpente — acompte 40 %',           39000000, 'facture', 'paye',       'F-TOIT-01',   DATE '2026-08-05'),
  -- Menuiseries : devis reçu, pas encore tranché
  ('Menuiseries',                    'Devis menuiseries aluminium',        88000000, 'devis',   'en_attente', 'DV-ALU-03',   DATE '2026-08-14'),
  -- Honoraires
  ('Honoraires et études',           'Honoraires architecte — 60 %',       28000000, 'facture', 'paye',       'F-ARCHI-01',  DATE '2026-03-02'),
  ('Honoraires et études',           'Étude de sol',                        6500000, 'facture', 'paye',       'F-GEO-014',   DATE '2026-02-18')
) AS d(poste, libelle, montant, type, statut, reference, jour)
JOIN public.postes_budget p
  ON p.chantier_id = 'e5111111-0000-4000-8000-000000000001' AND p.libelle = d.poste;

-- ----------------------------------------------------------------------------
--  Phases et avancement
--
--  Les montants pondèrent l'avancement global : une phase peu coûteuse
--  achevée ne fait pas illusion.
-- ----------------------------------------------------------------------------

SELECT public.creer_phases_standard('e5111111-0000-4000-8000-000000000001');

UPDATE public.phases_chantier SET
  montant_prevu = CASE nom
    WHEN 'Viabilisation' THEN  45000000
    WHEN 'Terrassement'  THEN  38000000
    WHEN 'Fondations'    THEN 200000000
    WHEN 'Élévation'     THEN 269000000
    WHEN 'Hors d''eau'   THEN 118000000
    WHEN 'Second œuvre'  THEN 183000000
    WHEN 'Finitions'     THEN  76000000
    WHEN 'Livraison'     THEN  21000000 END,
  avancement_pct = CASE nom
    WHEN 'Viabilisation' THEN 100
    WHEN 'Terrassement'  THEN 100
    WHEN 'Fondations'    THEN 100
    WHEN 'Élévation'     THEN 100
    WHEN 'Hors d''eau'   THEN  55
    WHEN 'Second œuvre'  THEN  10
    ELSE 0 END,
  date_prevue_debut = CASE nom
    WHEN 'Viabilisation' THEN DATE '2026-02-22' WHEN 'Terrassement' THEN DATE '2026-03-20'
    WHEN 'Fondations'    THEN DATE '2026-04-10' WHEN 'Élévation'    THEN DATE '2026-05-25'
    WHEN 'Hors d''eau'   THEN DATE '2026-07-28' WHEN 'Second œuvre' THEN DATE '2026-09-15'
    WHEN 'Finitions'     THEN DATE '2026-11-20' ELSE DATE '2027-01-25' END,
  date_prevue_fin = CASE nom
    WHEN 'Viabilisation' THEN DATE '2026-03-20' WHEN 'Terrassement' THEN DATE '2026-04-08'
    WHEN 'Fondations'    THEN DATE '2026-05-22' WHEN 'Élévation'    THEN DATE '2026-07-25'
    WHEN 'Hors d''eau'   THEN DATE '2026-09-10' WHEN 'Second œuvre' THEN DATE '2026-11-18'
    WHEN 'Finitions'     THEN DATE '2027-01-20' ELSE DATE '2027-02-15' END,
  date_reelle_debut = CASE nom
    WHEN 'Viabilisation' THEN DATE '2026-02-24' WHEN 'Terrassement' THEN DATE '2026-03-24'
    WHEN 'Fondations'    THEN DATE '2026-04-14' WHEN 'Élévation'    THEN DATE '2026-06-02'
    WHEN 'Hors d''eau'   THEN DATE '2026-08-03' ELSE NULL END,
  date_reelle_fin = CASE nom
    WHEN 'Viabilisation' THEN DATE '2026-03-22' WHEN 'Terrassement' THEN DATE '2026-04-11'
    WHEN 'Fondations'    THEN DATE '2026-05-30' WHEN 'Élévation'    THEN DATE '2026-08-01'
    ELSE NULL END
WHERE chantier_id = 'e5111111-0000-4000-8000-000000000001';

-- ----------------------------------------------------------------------------
--  Jalons — deux validés, trois à venir
-- ----------------------------------------------------------------------------

INSERT INTO public.jalons_chantier
  (chantier_id, phase_id, nom, description, date_prevue, montant_a_liberer, ordre)
SELECT 'e5111111-0000-4000-8000-000000000001', p.id, j.nom, j.descr, j.jour, j.montant, j.ordre
FROM (VALUES
  ('Fondations',   'Réception des fondations',   'Contrôle ferraillage et coulage par le bureau d''études', DATE '2026-05-25', 150000000, 1),
  ('Élévation',    'Réception de l''élévation',  'Fin du R+1, avant pose de charpente',                     DATE '2026-07-30', 200000000, 2),
  ('Hors d''eau',  'Mise hors d''eau',           'Couverture posée, bâtiment étanche',                      DATE '2026-09-10', 180000000, 3),
  ('Second œuvre', 'Réception du second œuvre',  'Plomberie, électricité et menuiseries achevées',          DATE '2026-11-18', 150000000, 4),
  ('Livraison',    'Réception définitive',       'Levée des réserves et remise des clés',                   DATE '2027-02-15', 120000000, 5)
) AS j(phase, nom, descr, jour, montant, ordre)
JOIN public.phases_chantier p
  ON p.chantier_id = 'e5111111-0000-4000-8000-000000000001' AND p.nom = j.phase;

-- Les deux premiers jalons ont été validés en leur temps.
UPDATE public.jalons_chantier
   SET date_validation = '2026-05-30 10:20:00+00', valide_par = auth.uid(),
       paiement_libere_le = '2026-05-30 10:20:00+00'
 WHERE chantier_id = 'e5111111-0000-4000-8000-000000000001' AND nom = 'Réception des fondations';

UPDATE public.jalons_chantier
   SET date_validation = '2026-08-01 16:05:00+00', valide_par = auth.uid(),
       paiement_libere_le = '2026-08-01 16:05:00+00'
 WHERE chantier_id = 'e5111111-0000-4000-8000-000000000001' AND nom = 'Réception de l''élévation';

-- ----------------------------------------------------------------------------
--  Journal de chantier
--
--  Trois prises au même point de la façade sud, à des dates différentes :
--  elles doivent se regrouper d'elles-mêmes en séquence avant/pendant/après.
-- ----------------------------------------------------------------------------

INSERT INTO public.journal_chantier
  (chantier_id, phase_id, type, texte, gravite, statut, point_geom, cree_par, cree_le)
SELECT 'e5111111-0000-4000-8000-000000000001',
       (SELECT id FROM public.phases_chantier
         WHERE chantier_id = 'e5111111-0000-4000-8000-000000000001' AND nom = e.phase),
       e.type, e.texte, e.gravite, e.statut,
       extensions.ST_SetSRID(extensions.ST_MakePoint(e.lon, e.lat), 4326),
       auth.uid(), e.quand
FROM (VALUES
  -- Façade sud, même point, trois dates
  ('Terrassement', 'photo',       'Terrain nu avant terrassement, vue façade sud',      NULL,        'ouvert', -13.677200, 9.535100, TIMESTAMPTZ '2026-03-24 08:15:00+00'),
  ('Fondations',   'photo',       'Semelles coulées, façade sud',                       NULL,        'ouvert', -13.677210, 9.535108, TIMESTAMPTZ '2026-05-18 09:40:00+00'),
  ('Élévation',    'photo',       'R+1 achevé, façade sud',                             NULL,        'ouvert', -13.677195, 9.535095, TIMESTAMPTZ '2026-08-01 15:30:00+00'),
  -- Angle nord-ouest : le problème
  ('Hors d''eau',  'signalement', 'Infiltration à l''angle nord-ouest : l''étanchéité de l''acrotère n''est pas reprise sur 2 m. Entreprise alertée le 12/08, sans retour.', 'bloquant', 'ouvert', -13.677320, 9.535240, TIMESTAMPTZ '2026-08-12 11:05:00+00'),
  ('Hors d''eau',  'signalement', 'Arrivée d''eau du bloc sanitaire R+1 décalée de 40 cm par rapport au plan', 'attention', 'resolu', -13.677180, 9.535180, TIMESTAMPTZ '2026-07-18 14:20:00+00'),
  -- Notes de suivi
  ('Élévation',    'note',        'Livraison de 180 sacs de ciment, stockés sous abri. Contrôle de la qualité du sable effectué.', NULL, 'ouvert', -13.677260, 9.535060, TIMESTAMPTZ '2026-06-02 07:50:00+00'),
  ('Hors d''eau',  'note',        'Réunion de chantier hebdomadaire : charpente livrée avec 9 jours de retard, la mise hors d''eau glisse d''autant.', NULL, 'ouvert', -13.677200, 9.535140, TIMESTAMPTZ '2026-08-19 16:00:00+00')
) AS e(phase, type, texte, gravite, statut, lon, lat, quand);

UPDATE public.journal_chantier SET resolu_le = '2026-07-25 10:00:00+00'
 WHERE chantier_id = 'e5111111-0000-4000-8000-000000000001' AND statut = 'resolu';

COMMIT;

-- Suppression du jeu d'essai :
--   DELETE FROM public.chantiers WHERE id = 'e5111111-0000-4000-8000-000000000001';
-- Les postes, dépenses, phases, jalons et entrées de journal partent en cascade.
