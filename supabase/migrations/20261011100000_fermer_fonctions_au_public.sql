-- ============================================================================
--  Fermer les fonctions du schéma public aux appelants anonymes
--
--  Audit de sécurité du 11/10/2026. crediter_abonnement() — qui marque un
--  paiement d'abonnement comme réussi et ajoute un mois d'accès, SANS
--  interroger SASPay — était exécutable par n'importe qui, avec la seule clé
--  publique, via /rest/v1/rpc/crediter_abonnement. Vérifié en recette : un
--  appel anonyme s'exécutait et répondait « session_inconnue ».
--
--  L'exploitation était à la portée d'un client : /api/abonnement/checkout lui
--  renvoie le session_id, et la session reste « en_attente » s'il ne paie
--  pas. Un appel suffisait ensuite à se créditer un mois — autant de fois que
--  de sessions ouvertes. En production, aucune session n'a jamais été ouverte
--  (SASPay pas encore actif) : la faille n'a pas pu servir.
--
--  ----------------------------------------------------------------------
--  Pourquoi le REVOKE du 01/09 n'avait rien protégé
--  ----------------------------------------------------------------------
--  20260901110100 révoquait EXECUTE à `anon, authenticated`. Mais PostgreSQL
--  accorde EXECUTE à PUBLIC à toute fonction créée, et anon comme
--  authenticated en héritent : retirer leurs droits propres laissait
--  l'héritage intact. C'est exactement le constat de 20260816130000, qui
--  n'avait pas été retenu pour la fonction suivante.
--
--  Ce que fait cette migration :
--
--   1. Toutes les fonctions de `public` perdent PUBLIC et anon. Aucune page
--      sans session n'interroge la base (le proxy répond 401 ou redirige
--      avant), et la RLS n'a donc jamais à s'évaluer pour anon.
--   2. authenticated GARDE l'exécution des fonctions appelées par les
--      policies RLS et par l'application. Les lui retirer casse tout — c'est
--      ce qui a obligé à annuler 20260816130000 en quelques minutes.
--   3. Les fonctions de service — crédit d'abonnement, diagnostic des
--      organisations orphelines, durée d'essai — perdent aussi authenticated.
--      Aucune policy ne les appelle, et aucun utilisateur n'a à les appeler.
--   4. Les privilèges par défaut sont fermés : une fonction créée demain ne
--      naîtra plus exécutable par PUBLIC ni anon. C'est ce défaut qui a
--      rouvert la porte le 01/09 ; on ne compte plus sur la mémoire de qui
--      écrira la prochaine migration.
-- ============================================================================

-- 1 et 2 — toutes les fonctions propres au projet. Les fonctions
-- d'extension sont exclues : elles ne sont pas à nous.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- 3 — fonctions de service. crediter_abonnement n'est appelée que par
-- lib/abonnement-serveur.ts avec la clé de service ; les deux autres
-- uniquement depuis d'autres fonctions SECURITY DEFINER, qui s'exécutent avec
-- les droits de leur propriétaire.
REVOKE EXECUTE ON FUNCTION public.crediter_abonnement(text, text, numeric, numeric, numeric, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.organisations_orphelines() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.organisation_est_vide(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.jours_essai() FROM authenticated;

-- handle_new_user est le trigger d'inscription : c'est le service
-- d'authentification qui insère dans auth.users, jamais un utilisateur.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- Signalé par l'auditeur Supabase : seule fonction sans search_path fixe.
ALTER FUNCTION public.jours_essai() SET search_path = public;

-- 4 — privilèges par défaut. Le retrait de PUBLIC ne peut se faire que
-- globalement (PostgreSQL n'autorise pas à retirer par schéma un droit
-- accordé à tous les schémas) ; celui d'anon vise le défaut que Supabase pose
-- sur `public`. authenticated reste accordé par défaut : presque toute
-- nouvelle fonction sert une policy ou l'application, et une fonction de
-- service doit le lui retirer explicitement — ce que le point 3 fait ici.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
