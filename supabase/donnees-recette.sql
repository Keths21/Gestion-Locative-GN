-- ============================================================================
--  Jeu de données de recette — CASA CHAMS
--
--  ⚠️  NE JAMAIS EXÉCUTER SUR LA PRODUCTION.
--
--  Ce fichier n'est PAS une migration et ne vit pas dans supabase/migrations/ :
--  il n'a rien à faire dans une séquence rejouée pour reconstruire un schéma.
--  Il peuple la base de recette, et elle seule.
--
--  Tout est inventé. Aucune donnée ne vient de la production : les noms, les
--  montants et les adresses sont fabriqués, les adresses de courriel sont en
--  `.test` — un domaine de premier niveau réservé par l'IANA, qui ne peut par
--  construction jamais résoudre — et les numéros utilisent le préfixe 600, non
--  attribué par les opérateurs guinéens. Le verrou d'envoi
--  (lib/garde-envoi.ts) reste la protection principale ; ceci en est la
--  seconde.
--
--  Rejouable : le script efface d'abord ses propres lignes, reconnaissables à
--  leurs identifiants fixes commençant par « d0 ». Il ne touche à rien d'autre,
--  et notamment pas aux données que vous auriez saisies à la main.
--
--  Les noms sont réalistes, sans marqueur particulier. Ils ont un temps porté
--  un préfixe « REC — », parce que des parcelles tracées à de vraies coordonnées
--  de Conakry, sur le même fond de carte qu'en production, ne se distinguaient
--  de rien. Ce préfixe traitait le symptôme : c'était l'environnement qui était
--  muet, pas les données qui étaient trop crédibles.
--
--  Depuis le bandeau d'environnement (lib/environnement.ts), l'interface le dit
--  d'elle-même, quelles que soient les données. Le jeu d'essai peut donc
--  redevenir naturel — ce qui vaut mieux : c'est la mise en page qu'il sert à
--  éprouver, et des noms déformés l'éprouvent mal.
--
--  Usage : coller dans l'éditeur SQL du projet de RECETTE.
-- ============================================================================

DO $$
DECLARE
  v_org  UUID;
  v_user UUID;

  -- Identifiants fixes : le script est rejouable, et son ménage est sûr.
  b1 UUID := 'd0000000-0000-4000-8000-000000000001'; -- Résidence Kipé
  b2 UUID := 'd0000000-0000-4000-8000-000000000002'; -- Villa Nongo
  b3 UUID := 'd0000000-0000-4000-8000-000000000003'; -- Studio Taouyah
  b4 UUID := 'd0000000-0000-4000-8000-000000000004'; -- Appartement Kaloum
  b5 UUID := 'd0000000-0000-4000-8000-000000000005'; -- Bungalow Ratoma (nuitée)
  b6 UUID := 'd0000000-0000-4000-8000-000000000006'; -- Local Madina (travaux)

  l1 UUID := 'd0000000-0000-4000-8001-000000000001';
  l2 UUID := 'd0000000-0000-4000-8001-000000000002';
  l3 UUID := 'd0000000-0000-4000-8001-000000000003';
  l4 UUID := 'd0000000-0000-4000-8001-000000000004';
  l5 UUID := 'd0000000-0000-4000-8001-000000000005';
  l6 UUID := 'd0000000-0000-4000-8001-000000000006'; -- parti, pour isLocataireActif
BEGIN
  -- L'organisation est résolue, jamais codée en dur : recréer le compte de
  -- recette change son identifiant, et un script qui le fige devient faux au
  -- premier reset.
  SELECT m.organisation_id, m.user_id INTO v_org, v_user
    FROM public.membres m
    ORDER BY m.cree_le
    LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation : créez d''abord un compte sur cet environnement.';
  END IF;

  -- --- Ménage de nos propres lignes ---------------------------------------
  -- Les paiements et locataires partent en cascade depuis les biens, mais on
  -- est explicite : une cascade qu'on n'a pas relue est une cascade qu'on ne
  -- connaît pas.
  DELETE FROM public.paiements  WHERE id::text LIKE 'd0000000-0000-4000-8002%';
  DELETE FROM public.locataires WHERE id::text LIKE 'd0000000-0000-4000-8001%';
  DELETE FROM public.biens      WHERE id::text LIKE 'd0000000-0000-4000-8000%';

  -- --- Paramètres de l'agence ---------------------------------------------
  INSERT INTO public.parametres (organisation_id, user_id, nom_agence, email, telephone,
                                 adresse, ville, devise, rccm, nif, site_web, description)
  VALUES (v_org, v_user, 'CASA CHAMS — Recette', 'agence@exemple.test', '+224 600 00 00 00',
          'Immeuble Kaloum Center, 3e étage', 'Conakry', 'GNF',
          'GN-CNK-2026-B-00000', '000000000', 'https://exemple.test',
          'Jeu de recette — aucune donnée réelle.')
  ON CONFLICT (organisation_id) DO UPDATE
    SET nom_agence = EXCLUDED.nom_agence,
        description = EXCLUDED.description;

  -- --- Biens ---------------------------------------------------------------
  INSERT INTO public.biens
    (id, organisation_id, user_id, nom, adresse, ville, type, mode_location,
     surface, loyer_base, charges, statut, nombre_pieces, etage, meuble,
     parking, gardien, climatisation, eau_incluse, depot_garantie_mois, description)
  VALUES
    (b1, v_org, v_user, 'Résidence Kipé — Appt 4B', 'Carrefour Kipé, route Le Prince', 'Conakry',
     'appartement', 'appartement', 95, 3500000, 250000, 'loué', 3, 2, true, true, true, true, false, 2,
     'Trois pièces au deuxième étage, vue sur la route Le Prince.'),
    (b2, v_org, v_user, 'Villa Nongo', 'Nongo, près de l''hôtel Noom', 'Conakry',
     'villa', 'appartement', 240, 7000000, 500000, 'loué', 6, 0, false, true, true, true, true, 3,
     'Villa avec cour close et logement de gardien.'),
    (b3, v_org, v_user, 'Studio Taouyah', 'Taouyah, derrière le marché', 'Conakry',
     'studio', 'appartement', 32, 1200000, 80000, 'vacant', 1, 1, true, false, false, true, false, 1,
     'Studio meublé, libre immédiatement.'),
    (b4, v_org, v_user, 'Appartement Kaloum', 'Boulevard du Commerce, Kaloum', 'Conakry',
     'appartement', 'appartement', 130, 5000000, 400000, 'loué', 4, 5, false, true, true, true, false, 2,
     'Quatre pièces au cinquième, ascenseur en service.'),
    (b5, v_org, v_user, 'Bungalow Ratoma', 'Ratoma, corniche nord', 'Conakry',
     'maison', 'airbnb', 70, NULL, NULL, 'vacant', 2, 0, true, true, true, true, true, NULL,
     'Location à la nuitée, deux chambres, vue mer.'),
    (b6, v_org, v_user, 'Local commercial Madina', 'Marché Madina, allée centrale', 'Conakry',
     'commerce', 'appartement', 45, 2800000, 150000, 'travaux', 1, 0, false, false, true, false, false, 3,
     'Réfection de la devanture en cours.');

  UPDATE public.biens SET prix_nuit = 450000, duree_min_nuits = 2, max_voyageurs = 4,
                          heure_checkin = '14:00', heure_checkout = '11:00',
                          regles_maison = 'Non-fumeur. Animaux non admis.'
   WHERE id = b5;

  -- --- Locataires ----------------------------------------------------------
  -- Adresses en .test, numéros en préfixe 600 : ni les unes ni les autres ne
  -- peuvent joindre qui que ce soit.
  INSERT INTO public.locataires
    (id, organisation_id, user_id, bien_id, nom, prenom, email, telephone,
     date_entree, date_sortie, depot_garantie)
  VALUES
    (l1, v_org, v_user, b1, 'Camara', 'Aïssatou', 'a.camara@exemple.test', '+224 600 00 00 11',
     '2025-11-01', NULL, 7000000),
    (l2, v_org, v_user, b2, 'Diallo', 'Mamadou', 'm.diallo@exemple.test', '+224 600 00 00 12',
     '2025-06-15', NULL, 21000000),
    (l3, v_org, v_user, b4, 'Bangoura', 'Fatoumata', 'f.bangoura@exemple.test', '+224 600 00 00 13',
     '2026-01-05', NULL, 10000000),
    (l4, v_org, v_user, b4, 'Sylla', 'Ibrahima', 'i.sylla@exemple.test', '+224 600 00 00 14',
     '2026-02-01', NULL, 10000000),
    (l5, v_org, v_user, b1, 'Touré', 'Kadiatou', 'k.toure@exemple.test', '+224 600 00 00 15',
     '2026-03-01', NULL, 7000000),
    -- Sorti : sert à éprouver isLocataireActif() et les filtres d'archive.
    (l6, v_org, v_user, b3, 'Keïta', 'Ousmane', 'o.keita@exemple.test', '+224 600 00 00 16',
     '2025-02-01', '2026-05-31', 1200000);

  RAISE NOTICE 'Biens et locataires posés pour l''organisation %', v_org;
END $$;

-- ============================================================================
--  2. Paiements — six mois d'historique, profils contrastés
-- ============================================================================
DO $$
DECLARE v_org UUID; n INT := 0; r RECORD; v_id UUID; v_date DATE;
BEGIN
  SELECT organisation_id INTO v_org FROM public.membres ORDER BY cree_le LIMIT 1;
  DELETE FROM public.paiements WHERE id::text LIKE 'd0000000-0000-4000-8002%';

  -- Un profil par locataire, pensé pour que chaque page ait de quoi montrer :
  -- un bon payeur, un retard naissant, deux dossiers en souffrance, et un
  -- locataire parti dont l'historique s'arrête à sa sortie.
  FOR r IN
    SELECT * FROM (VALUES
      ('d0000000-0000-4000-8001-000000000001','d0000000-0000-4000-8000-000000000001',3750000,'2026-03','payé'),
      ('d0000000-0000-4000-8001-000000000001','d0000000-0000-4000-8000-000000000001',3750000,'2026-04','payé'),
      ('d0000000-0000-4000-8001-000000000001','d0000000-0000-4000-8000-000000000001',3750000,'2026-05','payé'),
      ('d0000000-0000-4000-8001-000000000001','d0000000-0000-4000-8000-000000000001',3750000,'2026-06','payé'),
      ('d0000000-0000-4000-8001-000000000001','d0000000-0000-4000-8000-000000000001',3750000,'2026-07','payé'),
      ('d0000000-0000-4000-8001-000000000001','d0000000-0000-4000-8000-000000000001',3750000,'2026-08','impayé'),
      ('d0000000-0000-4000-8001-000000000002','d0000000-0000-4000-8000-000000000002',7500000,'2026-03','payé'),
      ('d0000000-0000-4000-8001-000000000002','d0000000-0000-4000-8000-000000000002',7500000,'2026-04','payé'),
      ('d0000000-0000-4000-8001-000000000002','d0000000-0000-4000-8000-000000000002',7500000,'2026-05','payé'),
      ('d0000000-0000-4000-8001-000000000002','d0000000-0000-4000-8000-000000000002',7500000,'2026-06','payé'),
      ('d0000000-0000-4000-8001-000000000002','d0000000-0000-4000-8000-000000000002',7500000,'2026-07','impayé'),
      ('d0000000-0000-4000-8001-000000000002','d0000000-0000-4000-8000-000000000002',7500000,'2026-08','impayé'),
      ('d0000000-0000-4000-8001-000000000003','d0000000-0000-4000-8000-000000000004',5400000,'2026-03','payé'),
      ('d0000000-0000-4000-8001-000000000003','d0000000-0000-4000-8000-000000000004',5400000,'2026-04','payé'),
      ('d0000000-0000-4000-8001-000000000003','d0000000-0000-4000-8000-000000000004',5400000,'2026-05','payé'),
      ('d0000000-0000-4000-8001-000000000003','d0000000-0000-4000-8000-000000000004',5400000,'2026-06','payé'),
      ('d0000000-0000-4000-8001-000000000003','d0000000-0000-4000-8000-000000000004',5400000,'2026-07','payé'),
      ('d0000000-0000-4000-8001-000000000003','d0000000-0000-4000-8000-000000000004',5400000,'2026-08','payé'),
      ('d0000000-0000-4000-8001-000000000004','d0000000-0000-4000-8000-000000000004',5400000,'2026-03','payé'),
      ('d0000000-0000-4000-8001-000000000004','d0000000-0000-4000-8000-000000000004',5400000,'2026-04','payé'),
      ('d0000000-0000-4000-8001-000000000004','d0000000-0000-4000-8000-000000000004',5400000,'2026-05','payé'),
      ('d0000000-0000-4000-8001-000000000004','d0000000-0000-4000-8000-000000000004',5400000,'2026-06','payé'),
      ('d0000000-0000-4000-8001-000000000004','d0000000-0000-4000-8000-000000000004',5400000,'2026-07','payé'),
      ('d0000000-0000-4000-8001-000000000004','d0000000-0000-4000-8000-000000000004',5400000,'2026-08','en_attente'),
      ('d0000000-0000-4000-8001-000000000005','d0000000-0000-4000-8000-000000000001',3750000,'2026-03','payé'),
      ('d0000000-0000-4000-8001-000000000005','d0000000-0000-4000-8000-000000000001',3750000,'2026-04','payé'),
      ('d0000000-0000-4000-8001-000000000005','d0000000-0000-4000-8000-000000000001',3750000,'2026-05','payé'),
      ('d0000000-0000-4000-8001-000000000005','d0000000-0000-4000-8000-000000000001',3750000,'2026-06','impayé'),
      ('d0000000-0000-4000-8001-000000000005','d0000000-0000-4000-8000-000000000001',3750000,'2026-07','impayé'),
      ('d0000000-0000-4000-8001-000000000005','d0000000-0000-4000-8000-000000000001',3750000,'2026-08','impayé'),
      ('d0000000-0000-4000-8001-000000000006','d0000000-0000-4000-8000-000000000003',1280000,'2026-03','payé'),
      ('d0000000-0000-4000-8001-000000000006','d0000000-0000-4000-8000-000000000003',1280000,'2026-04','payé'),
      ('d0000000-0000-4000-8001-000000000006','d0000000-0000-4000-8000-000000000003',1280000,'2026-05','payé')
    ) AS t(loc, bien, montant, mois, statut)
  LOOP
    n := n + 1;
    v_id := ('d0000000-0000-4000-8002-' || lpad(n::text, 12, '0'))::uuid;
    -- Un loyer réglé l'est vers le 5 du mois ; une échéance non réglée n'a pas
    -- de date de paiement, c'est ce qui la distingue en base.
    v_date := CASE WHEN r.statut = 'payé' THEN (r.mois || '-05')::date ELSE NULL END;
    INSERT INTO public.paiements
      (id, organisation_id, locataire_id, bien_id, montant, date_paiement, mois_concerne, statut, notes)
    VALUES (v_id, v_org, r.loc::uuid, r.bien::uuid, r.montant, v_date, r.mois, r.statut,
            CASE WHEN r.statut = 'en_attente' THEN 'Virement annoncé, en attente de réception.' END);
  END LOOP;

  -- Une relance récente sur Camara : elle doit sortir des envois groupés, le
  -- délai de garde étant de DELAI_RELANCE_JOURS (8 jours).
  UPDATE public.locataires SET derniere_relance = now() - interval '2 days'
   WHERE id = 'd0000000-0000-4000-8001-000000000001';
END $$;

-- ============================================================================
--  3. Parcelles — tracés réels sur Conakry
--
--  Les métriques (superficie, périmètre, point de surface, GeoJSON) sont
--  calculées par le trigger maj_metriques_parcelle : on ne les écrit jamais.
-- ============================================================================
DO $$
DECLARE v_org UUID; v_user UUID;
BEGIN
  SELECT organisation_id, user_id INTO v_org, v_user FROM public.membres ORDER BY cree_le LIMIT 1;
  DELETE FROM public.parcelles WHERE id::text LIKE 'd0000000-0000-4000-8003%';

  INSERT INTO public.parcelles
    (id, organisation_id, cree_par, bien_id, nom, reference, type, statut, statut_juridique,
     description, pays, region, prefecture, commune, quartier, adresse,
     superficie_declaree_m2, prix_achat, valeur_estimee, devise, date_acquisition,
     proprietaire, occupant, contact_telephone, couleur, tags, source_trace, precision_m, geom)
  VALUES
    ('d0000000-0000-4000-8003-000000000001', v_org, v_user, 'd0000000-0000-4000-8000-000000000001',
     'Parcelle Kipé — Résidence', 'CNK-KIP-001', 'terrain_bati', 'possede', 'titre_foncier',
     'Emprise de la résidence, bâtie sur les deux tiers de la surface.',
     'Guinée', 'Conakry', 'Conakry', 'Ratoma', 'Kipé', 'Carrefour Kipé, route Le Prince',
     3100, 850000000, 1200000000, 'GNF', '2021-04-12',
     'SCI Kipé Invest (fictif)', 'Locataires résidence', '+224 600 00 00 21',
     '#0d6e6e', ARRAY['bâti','titre'], 'gps_marche', 3.5,
     ST_GeomFromText('POLYGON((-13.6355 9.5960, -13.6349 9.5960, -13.6349 9.5955, -13.6355 9.5955, -13.6355 9.5960))', 4326)),
    ('d0000000-0000-4000-8003-000000000002', v_org, v_user, NULL,
     'Terrain Nongo — lot 14', 'CNK-NON-014', 'terrain_nu', 'en_vente', 'attestation_vente',
     'Lot viabilisé, clôturé sur trois côtés. Mise en vente au deuxième trimestre.',
     'Guinée', 'Conakry', 'Conakry', 'Ratoma', 'Nongo', 'Nongo, arrière de l''hôtel Noom',
     5200, 400000000, 900000000, 'GNF', '2023-09-30',
     'Succession Diallo (fictif)', NULL, '+224 600 00 00 22',
     '#f59e0b', ARRAY['à vendre','viabilisé'], 'manuel', NULL,
     ST_GeomFromText('POLYGON((-13.6420 9.6065, -13.6412 9.6065, -13.6412 9.6058, -13.6420 9.6058, -13.6420 9.6065))', 4326)),
    ('d0000000-0000-4000-8003-000000000003', v_org, v_user, NULL,
     'Emprise Kaloum — Boulevard', 'CNK-KAL-007', 'commercial', 'loue', 'bail',
     'Emprise commerciale donnée à bail pour neuf ans.',
     'Guinée', 'Conakry', 'Conakry', 'Kaloum', 'Centre', 'Boulevard du Commerce',
     1800, NULL, 2100000000, 'GNF', '2019-01-15',
     'État guinéen (fictif)', 'Groupe commercial (fictif)', '+224 600 00 00 23',
     '#3b82f6', ARRAY['bail','commercial'], 'coordonnees', 1.2,
     ST_GeomFromText('POLYGON((-13.7128 9.5092, -13.7122 9.5092, -13.7122 9.5088, -13.7128 9.5088, -13.7128 9.5092))', 4326));
END $$;

-- ============================================================================
--  4. Chantiers, intervenants et interventions
-- ============================================================================
DO $$
DECLARE
  v_org UUID; v_user UUID;
  c1 UUID := 'd0000000-0000-4000-8004-000000000001';
  c2 UUID := 'd0000000-0000-4000-8004-000000000002';
  i1 UUID := 'd0000000-0000-4000-8005-000000000001';
  i2 UUID := 'd0000000-0000-4000-8005-000000000002';
  i3 UUID := 'd0000000-0000-4000-8005-000000000003';
  i4 UUID := 'd0000000-0000-4000-8005-000000000004';
BEGIN
  SELECT organisation_id, user_id INTO v_org, v_user FROM public.membres ORDER BY cree_le LIMIT 1;
  DELETE FROM public.intervenants WHERE id::text LIKE 'd0000000-0000-4000-8005%';
  DELETE FROM public.chantiers    WHERE id::text LIKE 'd0000000-0000-4000-8004%';

  INSERT INTO public.chantiers
    (id, organisation_id, cree_par, bien_id, parcelle_id, nom, reference, nature, statut,
     description, pays, region, prefecture, commune, quartier, adresse,
     budget_initial, reserve_imprevus, devise, date_debut_prevue, date_fin_prevue, date_debut_reelle)
  VALUES
    (c1, v_org, v_user, NULL, 'd0000000-0000-4000-8003-000000000002',
     'Villa Nongo R+1', 'CH-2026-001', 'construction', 'en_cours',
     'Construction d''une villa R+1 sur le lot 14, quatre chambres et un studio indépendant.',
     'Guinée', 'Conakry', 'Conakry', 'Ratoma', 'Nongo', 'Nongo, lot 14',
     1800000000, 150000000, 'GNF', '2026-04-01', '2027-02-28', '2026-04-08'),
    (c2, v_org, v_user, 'd0000000-0000-4000-8000-000000000006', NULL,
     'Rénovation local Madina', 'CH-2026-002', 'renovation', 'en_cours',
     'Réfection de la devanture, de l''électricité et du sol du local commercial.',
     'Guinée', 'Conakry', 'Conakry', 'Matam', 'Madina', 'Marché Madina, allée centrale',
     140000000, 20000000, 'GNF', '2026-07-15', '2026-09-30', '2026-07-18');

  -- PostgREST ne sait pas écrire une colonne geometry : on passe par la
  -- fonction, comme le fait l'application.
  PERFORM public.placer_chantier(c1, -13.6416, 9.6061);
  PERFORM public.placer_chantier(c2, -13.6702, 9.5378);

  -- La décennale de l'électricien expire dans deux semaines, et le plombier
  -- n'en a fourni aucune : c'est le genre d'échéance que l'annuaire existe pour
  -- faire remonter.
  INSERT INTO public.intervenants
    (id, organisation_id, nom, entreprise, metier, telephone, email, adresse, rccm, nif,
     decennale_numero, decennale_assureur, decennale_valide_jusqu_au, notes)
  VALUES
    (i1, v_org, 'Souleymane Bah', 'Entreprise Bah & Fils', 'maconnerie', '+224 600 00 00 31',
     's.bah@exemple.test', 'Sonfonia, Conakry', 'GN-CNK-2019-A-11111', '111111111',
     'DEC-2024-0912', 'Assurances Guinéennes (fictif)', '2027-03-31',
     'Équipe de douze. Travaille avec nous depuis trois chantiers.'),
    (i2, v_org, 'Aboubacar Condé', 'Condé Électricité', 'electricite', '+224 600 00 00 32',
     'a.conde@exemple.test', 'Hamdallaye, Conakry', 'GN-CNK-2021-A-22222', '222222222',
     'DEC-2023-0455', 'Union Assurances (fictif)', '2026-09-15',
     'Décennale à renouveler avant la reprise du second œuvre.'),
    (i3, v_org, 'Mariama Barry', 'Atelier Barry Architecture', 'architecte', '+224 600 00 00 33',
     'm.barry@exemple.test', 'Kaloum, Conakry', 'GN-CNK-2018-A-33333', '333333333',
     'DEC-2025-0177', 'Assurances Guinéennes (fictif)', '2028-01-31',
     'Maîtrise d''œuvre sur la villa. Accès chantier accordé.'),
    (i4, v_org, 'Thierno Sow', 'Sow Plomberie', 'plomberie', '+224 600 00 00 34',
     't.sow@exemple.test', 'Matoto, Conakry', NULL, NULL, NULL, NULL, NULL,
     'Pas de décennale fournie — à réclamer avant intervention.');

  INSERT INTO public.interventions (chantier_id, intervenant_id, lot, montant_marche, date_debut, date_fin, statut)
  VALUES
    (c1, i1, 'gros_oeuvre',   620000000, '2026-04-08', '2026-11-30', 'en_cours'),
    (c1, i3, 'honoraires',    145000000, '2026-02-01', '2027-02-28', 'en_cours'),
    (c1, i2, 'second_oeuvre', 180000000, '2026-10-01', NULL,         'prevu'),
    (c1, i4, 'second_oeuvre', 130000000, '2026-10-15', NULL,         'prevu'),
    (c2, i2, 'second_oeuvre',  45000000, '2026-07-18', '2026-08-25', 'termine'),
    (c2, i1, 'finitions',      38000000, '2026-08-20', NULL,         'en_cours');
END $$;

-- ============================================================================
--  5. Budget, phases et jalons
-- ============================================================================
DO $$
DECLARE
  c1 UUID := 'd0000000-0000-4000-8004-000000000001';
  c2 UUID := 'd0000000-0000-4000-8004-000000000002';
  v_phase UUID;
BEGIN
  -- On passe par les fonctions de l'application plutôt que d'écrire les lignes
  -- à la main : le jeu de recette éprouve ainsi le même chemin que l'interface.
  PERFORM public.creer_postes_standard(c1);
  PERFORM public.creer_phases_standard(c1);

  UPDATE public.postes_budget SET montant_prevu = v.m
    FROM (VALUES ('Viabilisation et raccordements',90000000),
                 ('Terrassement et fondations',260000000),
                 ('Élévation et charpente',380000000),
                 ('Toiture et étanchéité',150000000),
                 ('Menuiseries',120000000),
                 ('Plomberie et électricité',200000000),
                 ('Enduits, peinture et carrelage',230000000),
                 ('Équipements et sanitaires',175000000),
                 ('Honoraires et études',145000000)) AS v(lib, m)
   WHERE postes_budget.chantier_id = c1 AND postes_budget.libelle = v.lib;

  -- Avancement pondéré par le budget : la villa est aux trois cinquièmes de son
  -- élévation, le reste n'a pas commencé.
  UPDATE public.phases_chantier SET avancement_pct = v.a, montant_prevu = v.m,
         date_reelle_debut = v.d1, date_reelle_fin = v.d2
    FROM (VALUES ('Viabilisation',100, 90000000,'2026-04-08'::date,'2026-04-25'::date),
                 ('Terrassement',  100,110000000,'2026-04-26'::date,'2026-05-20'::date),
                 ('Fondations',    100,150000000,'2026-05-21'::date,'2026-06-18'::date),
                 ('Élévation',      60,380000000,'2026-06-20'::date,NULL),
                 ('Hors d''eau',     0,150000000,NULL,NULL),
                 ('Second œuvre',    0,320000000,NULL,NULL),
                 ('Finitions',       0,230000000,NULL,NULL),
                 ('Livraison',       0,      0,NULL,NULL)) AS v(nom, a, m, d1, d2)
   WHERE phases_chantier.chantier_id = c1 AND phases_chantier.nom = v.nom;

  -- Un devis engage, une facture dépense, un avenant mord dans la réserve.
  INSERT INTO public.depenses_chantier (chantier_id, poste_id, libelle, montant, type, statut, reference, date_depense)
  SELECT c1, p.id, v.lib, v.m, v.t, v.s, v.ref, v.d
    FROM (VALUES
      ('Terrassement et fondations','Terrassement et fouilles',        95000000,'facture','paye',  'FA-2026-018','2026-05-22'::date),
      ('Terrassement et fondations','Béton de fondation',             180000000,'facture','paye',  'FA-2026-031','2026-06-19'::date),
      ('Terrassement et fondations','Reprise de sol — nappe imprévue',  45000000,'avenant','valide','AV-2026-002','2026-05-30'::date),
      ('Élévation et charpente',    'Agglos et ciment — tranche 1',   140000000,'facture','paye',  'FA-2026-044','2026-07-10'::date),
      ('Élévation et charpente',    'Agglos et ciment — tranche 2',    88000000,'facture','valide','FA-2026-058','2026-08-14'::date),
      ('Menuiseries',               'Devis menuiseries aluminium',    118000000,'devis',  'valide','DE-2026-009','2026-08-05'::date),
      ('Honoraires et études',      'Honoraires maîtrise d''œuvre T2',  36000000,'facture','en_attente','FA-2026-060','2026-08-28'::date)
    ) AS v(poste, lib, m, t, s, ref, d)
    JOIN public.postes_budget p ON p.chantier_id = c1 AND p.libelle = v.poste;

  -- Une dépense sans poste : la synthèse la compte à part, et c'est ce
  -- comportement qu'on veut pouvoir observer.
  INSERT INTO public.depenses_chantier (chantier_id, poste_id, libelle, montant, type, statut, reference, date_depense)
  VALUES (c1, NULL, 'Gardiennage de chantier — août', 12000000, 'facture', 'paye', 'FA-2026-055', '2026-08-01');

  SELECT id INTO v_phase FROM public.phases_chantier WHERE chantier_id = c1 AND nom = 'Fondations';
  INSERT INTO public.jalons_chantier (chantier_id, phase_id, nom, description, date_prevue, date_validation, montant_a_liberer, ordre)
  VALUES (c1, v_phase, 'Fondations réceptionnées', 'Procès-verbal signé par la maîtrise d''œuvre.',
          '2026-06-15', '2026-06-18 10:00:00+00', 400000000, 1);

  SELECT id INTO v_phase FROM public.phases_chantier WHERE chantier_id = c1 AND nom = 'Élévation';
  INSERT INTO public.jalons_chantier (chantier_id, phase_id, nom, description, date_prevue, montant_a_liberer, ordre)
  VALUES (c1, v_phase, 'Élévation R+1 achevée', 'Murs du premier niveau montés et chaînage coulé.',
          '2026-08-20', 500000000, 2);

  SELECT id INTO v_phase FROM public.phases_chantier WHERE chantier_id = c1 AND nom = 'Hors d''eau';
  INSERT INTO public.jalons_chantier (chantier_id, phase_id, nom, description, date_prevue, montant_a_liberer, ordre)
  VALUES (c1, v_phase, 'Mise hors d''eau', 'Toiture posée et étanchéité contrôlée.',
          '2026-11-15', 350000000, 3);

  INSERT INTO public.postes_budget (chantier_id, corps_etat, libelle, montant_prevu, ordre)
  VALUES (c2,'second_oeuvre','Électricité et tableau',45000000,1),
         (c2,'finitions',    'Devanture et vitrine',  52000000,2),
         (c2,'finitions',    'Sol et peinture',       28000000,3),
         (c2,'divers',       'Évacuation des gravats', 8000000,4);

  INSERT INTO public.depenses_chantier (chantier_id, poste_id, libelle, montant, type, statut, reference, date_depense)
  SELECT c2, p.id, v.lib, v.m, v.t, v.s, v.ref, v.d
    FROM (VALUES
      ('Électricité et tableau','Reprise complète du tableau', 45000000,'facture','paye',  'FA-2026-051','2026-08-22'::date),
      ('Devanture et vitrine',  'Acompte vitrerie',            26000000,'facture','valide','FA-2026-059','2026-08-27'::date)
    ) AS v(poste, lib, m, t, s, ref, d)
    JOIN public.postes_budget p ON p.chantier_id = c2 AND p.libelle = v.poste;
END $$;

-- ============================================================================
--  6. Échéancier et journal de chantier
-- ============================================================================
DO $$
DECLARE
  v_user UUID;
  c1 UUID := 'd0000000-0000-4000-8004-000000000001';
  c2 UUID := 'd0000000-0000-4000-8004-000000000002';
  i1 UUID := 'd0000000-0000-4000-8005-000000000001';
  i2 UUID := 'd0000000-0000-4000-8005-000000000002';
  i3 UUID := 'd0000000-0000-4000-8005-000000000003';
  j_fond UUID; j_elev UUID; j_eau UUID;
BEGIN
  SELECT user_id INTO v_user FROM public.membres ORDER BY cree_le LIMIT 1;
  SELECT id INTO j_fond FROM public.jalons_chantier WHERE chantier_id=c1 AND nom='Fondations réceptionnées';
  SELECT id INTO j_elev FROM public.jalons_chantier WHERE chantier_id=c1 AND nom='Élévation R+1 achevée';
  SELECT id INTO j_eau  FROM public.jalons_chantier WHERE chantier_id=c1 AND nom='Mise hors d''eau';

  -- L'échéance d'élévation est dépassée et non soldée : c'est elle que
  -- echeances_a_alerter() doit faire remonter, et que la synthèse doit compter
  -- « en retard ». Sans un cas comme celui-là, l'écran ne montre jamais rien.
  INSERT INTO public.echeances_chantier
    (chantier_id, jalon_id, intervenant_id, libelle, montant, date_echeance, statut,
     montant_paye, date_paiement, ordre)
  VALUES
    (c1, NULL,   i1, 'Acompte de démarrage',     300000000, '2026-04-05', 'payee',    300000000, '2026-04-05', 1),
    (c1, j_fond, i1, 'Réception des fondations', 400000000, '2026-06-15', 'payee',    400000000, '2026-06-20', 2),
    (c1, j_elev, i1, 'Élévation R+1 achevée',    500000000, '2026-08-20', 'prevue',           0, NULL,         3),
    (c1, j_eau,  i1, 'Mise hors d''eau',         350000000, '2026-11-15', 'prevue',           0, NULL,         4),
    (c1, NULL,   i3, 'Honoraires — solde T2',     36000000, '2026-09-10', 'exigible',         0, NULL,         5),
    (c2, NULL,   i2, 'Acompte électricité',       40000000, '2026-07-20', 'payee',     40000000, '2026-07-22', 1),
    (c2, NULL,   i2, 'Solde électricité',         25000000, '2026-09-05', 'exigible',         0, NULL,         2);

  -- Les deux premières prises sont au même endroit à deux mois d'écart : c'est
  -- exactement ce que journal_par_emplacement() doit regrouper en une séquence
  -- avant / après.
  INSERT INTO public.journal_chantier
    (chantier_id, phase_id, type, texte, gravite, statut, point_geom, cree_par, cree_le)
  VALUES
    (c1, (SELECT id FROM public.phases_chantier WHERE chantier_id=c1 AND nom='Fondations'),
     'photo', 'Coulage des semelles filantes, angle nord-est.', NULL, 'ouvert',
     ST_SetSRID(ST_MakePoint(-13.64160, 9.60610), 4326), v_user, '2026-06-02 09:14:00+00'),
    (c1, (SELECT id FROM public.phases_chantier WHERE chantier_id=c1 AND nom='Élévation'),
     'photo', 'Même angle, deux mois plus tard : élévation du premier niveau.', NULL, 'ouvert',
     ST_SetSRID(ST_MakePoint(-13.64162, 9.60611), 4326), v_user, '2026-08-11 16:40:00+00'),
    (c1, (SELECT id FROM public.phases_chantier WHERE chantier_id=c1 AND nom='Élévation'),
     'signalement', 'Fissure verticale sur le mur pignon ouest, environ 40 cm. À faire constater avant la poursuite du chaînage.',
     'attention', 'ouvert', ST_SetSRID(ST_MakePoint(-13.64175, 9.60598), 4326), v_user, '2026-08-19 11:05:00+00'),
    (c1, NULL, 'note', 'Réunion hebdomadaire : livraison des agglos décalée de trois jours, sans effet sur le jalon.',
     NULL, 'ouvert', NULL, v_user, '2026-08-25 08:00:00+00'),
    (c2, NULL, 'signalement', 'Coupure secteur récurrente pendant les essais du tableau. Résolu après pose du disjoncteur différentiel.',
     'info', 'resolu', ST_SetSRID(ST_MakePoint(-13.67020, 9.53780), 4326), v_user, '2026-08-21 14:20:00+00');

  UPDATE public.journal_chantier SET resolu_le = '2026-08-22 09:00:00+00'
   WHERE chantier_id = c2 AND statut = 'resolu';
END $$;
