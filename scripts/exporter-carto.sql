-- ============================================================================
--  Lot 6 · Export du portefeuille foncier depuis l'application CartographieBiens
--
--  Volontairement en SQL pur : il s'exécute avec le seul `psql`, sans Node ni
--  dépendance à installer. C'est ce qui compte sur le VPS, où l'application est
--  conteneurisée et où l'on ne veut rien ajouter pour une opération unique.
--
--  Usage :
--    psql "$CARTO_DATABASE_URL" -At -f exporter-carto.sql > carto-export.json
--
--  Les géométries sortent en GeoJSON, exactement dans la forme attendue par la
--  RPC enregistrer_parcelle côté CASA CHAMS. Les identifiants d'origine sont
--  conservés : la RPC étant idempotente, l'import peut être rejoué sans créer
--  de doublon.
--
--  Les documents ne sont référencés que par leur chemin relatif ; les fichiers
--  eux-mêmes se trouvent dans UPLOAD_DIR et se transfèrent séparément.
-- ============================================================================

SELECT json_build_object(
  'exporte_le', now(),
  'source', 'CartographieBiens',
  'organisations', (
    SELECT COALESCE(json_agg(o ORDER BY o.cree_le), '[]'::json)
      FROM (
        SELECT id, nom, pays, devise, cree_le
          FROM organisations
      ) o
  ),
  'utilisateurs', (
    SELECT COALESCE(json_agg(u ORDER BY u.cree_le), '[]'::json)
      FROM (
        SELECT organisation_id, lower(email) AS email, nom, role, cree_le
          FROM utilisateurs
         WHERE actif
      ) u
  ),
  'parcelles', (
    SELECT COALESCE(json_agg(p ORDER BY p.cree_le), '[]'::json)
      FROM (
        SELECT
          b.id,
          b.organisation_id,
          b.nom,
          b.reference,
          b.type,
          b.statut,
          b.statut_juridique,
          b.description,
          b.pays,
          b.region,
          b.prefecture,
          b.commune,
          b.quartier,
          b.adresse,
          ST_AsGeoJSON(b.geom)::json       AS geom,
          ST_AsGeoJSON(b.point_geom)::json AS point_geom,
          -- Superficie de référence côté source : sert de témoin pour vérifier
          -- que PostGIS recalcule la même valeur après import.
          b.superficie_m2                  AS superficie_m2_source,
          b.perimetre_m                    AS perimetre_m_source,
          b.superficie_declaree_m2,
          b.prix_achat::float8             AS prix_achat,
          b.valeur_estimee::float8         AS valeur_estimee,
          b.devise,
          to_char(b.date_acquisition, 'YYYY-MM-DD') AS date_acquisition,
          b.proprietaire,
          b.occupant,
          b.contact_telephone,
          b.couleur,
          b.tags,
          b.source_trace,
          b.precision_m,
          b.cree_le
        FROM biens b
        WHERE b.supprime_le IS NULL
      ) p
  ),
  'documents', (
    SELECT COALESCE(json_agg(d ORDER BY d.cree_le), '[]'::json)
      FROM (
        SELECT id, bien_id AS parcelle_id, organisation_id, nom, categorie,
               chemin, mime, taille_octets, lat, lon, cree_le
          FROM documents
      ) d
  )
);
