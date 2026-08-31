-- ============================================================================
--  Durcissement des fonctions internes
--
--  Ce que fait réellement cette migration : fixer le search_path de
--  handle_new_user(). C'est le seul correctif de sécurité effectif ici, et
--  il n'est pas cosmétique — une fonction SECURITY DEFINER sans search_path
--  fixe est le vecteur d'injection classique : un appelant qui contrôle son
--  search_path peut faire résoudre un nom de table vers un objet à lui.
--
--  ----------------------------------------------------------------------
--  Ce que cette migration NE fait PAS, et pourquoi
--  ----------------------------------------------------------------------
--  L'audit Supabase signale aussi que les fonctions d'appartenance
--  (est_membre, peut_ecrire, est_proprietaire, organisation_courante,
--  est_membre_chemin, peut_ecrire_chemin) sont exposées comme endpoints
--  /rest/v1/rpc/* parce qu'elles vivent dans le schéma `public`.
--
--  La réponse évidente — révoquer EXECUTE à anon et authenticated — a été
--  essayée puis abandonnée, pour deux raisons vérifiées en base :
--
--   1. Elle est sans effet. PostgreSQL accorde EXECUTE à PUBLIC par défaut,
--      dont anon et authenticated héritent ; révoquer sur ces deux rôles ne
--      retire rien et laisse croire à une protection.
--
--   2. Révoquer sur PUBLIC casse l'application. Les policies RLS évaluent ces
--      fonctions avec les droits de l'appelant : sans EXECUTE, la moindre
--      lecture échoue sur « permission denied for function est_membre ».
--
--  Le correctif propre est de déplacer ces fonctions dans un schéma non
--  exposé par PostgREST (`private`), ce qui supprime les endpoints sans
--  toucher aux droits — au prix de la réécriture des ~30 policies qui les
--  référencent. À faire, mais comme chantier assumé, pas en passant.
--
--  Risque réel en attendant : faible. Un appelant anonyme n'obtient que des
--  `false` (auth.uid() est nul) ; un appelant authentifié n'apprend que sa
--  propre appartenance, qu'il lit déjà dans la table `membres`.
-- ============================================================================

ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Les huit REVOKE ci-dessous étaient appliqués en base mais absents de ce
-- fichier, qui ne portait que l'ALTER. Rapatriés depuis l'historique Supabase
-- le 31/08/2026.
--
-- ATTENTION : ils sont annulés quelques minutes plus tard par
-- 20260816225007_retablir_grants_fonctions.sql. Ce retrait rendait
-- l'application inutilisable — les policies RLS appellent ces fonctions et
-- s'évaluent avec les droits de l'appelant. Les deux fichiers se lisent
-- ensemble, sans quoi l'état réel de la base reste incompréhensible.

REVOKE EXECUTE ON FUNCTION public.est_membre(uuid)           FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.peut_ecrire(uuid)          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.est_proprietaire(uuid)     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.organisation_courante()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.est_membre_chemin(text)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.peut_ecrire_chemin(text)   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remplir_organisation()     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maj_metriques_parcelle()   FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
