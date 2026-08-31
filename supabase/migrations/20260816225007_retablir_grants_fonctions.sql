-- Rétablissement des droits d'exécution, immédiatement après le durcissement.
--
-- Le retrait opéré par la migration précédente allait trop loin : ces fonctions
-- sont appelées DANS les clauses des policies RLS, qui s'évaluent avec les
-- droits de l'appelant. Sans EXECUTE, `anon` et `authenticated` se voyaient
-- refuser l'accès à toutes les tables protégées — l'application entière.
--
-- Le durcissement reste donc à faire autrement : déplacer ces fonctions dans un
-- schéma que PostgREST n'expose pas, plutôt que leur retirer des droits dont la
-- RLS dépend. Voir la note de 20260816130000_durcissement_fonctions.sql.
--
-- Rapatrié depuis l'historique Supabase le 31/08/2026 : appliqué en base le
-- 16/08/2026, il n'avait jamais été versionné — alors qu'il annule en partie le
-- fichier qui le précède, ce qui rendait la lecture du dépôt trompeuse.

GRANT EXECUTE ON FUNCTION public.est_membre(uuid)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peut_ecrire(uuid)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.est_proprietaire(uuid)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organisation_courante()    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.est_membre_chemin(text)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peut_ecrire_chemin(text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remplir_organisation()     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maj_metriques_parcelle()   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user()          TO anon, authenticated;
