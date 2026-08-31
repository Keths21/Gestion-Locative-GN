# Migrations

## Ordre de rejeu

`supabase/schema.sql` **d'abord**, puis les fichiers de ce dossier dans l'ordre
alphabétique de leurs noms. Les quatre tables de départ — `biens`, `locataires`,
`paiements`, `parametres` — ne sont créées nulle part ailleurs : le premier
fichier de migration les modifie déjà.

## Le rapatriement du 31/08/2026

Jusqu'à cette date, ce dossier ne décrivait pas la base réelle. Neuf migrations
appliquées en production n'y figuraient pas, ou seulement en commentaire :

| migration | état avant |
|---|---|
| `20260406185110_biens_champs_etendus` | absente |
| `20260406190249_loyer_base_facultatif` | absente |
| `20260406195705_retirer_contrainte_mode_location` | absente |
| `20260406221154_parametres_champs_legaux` | absente |
| `20260816130000_durcissement_fonctions` | 1 ligne sur 10 |
| `20260816225007_retablir_grants_fonctions` | absente |
| `20260819101357_placer_chantier` | absente |
| `20260819140000_journal_chantier` | commentaires seuls |
| `20260826100000_intervenants_echeancier` | commentaires seuls |

Quatre tables — `journal_chantier`, `intervenants`, `interventions`,
`echeances_chantier` — n'existaient donc dans aucun fichier. Le SQL a été repris
de `supabase_migrations.schema_migrations`, l'historique que Supabase tient de
lui-même, et qui s'est révélé la seule source complète.

**Vérifié après rapatriement :** les 128 objets de la production — tables,
fonctions, vues, index, triggers, buckets — apparaissent tous dans le SQL du
dépôt. Les clés primaires sont exclues du décompte : Postgres les nomme, on ne
les écrit jamais.

Ce qui n'a **pas** été fait : rejouer réellement la séquence sur une base neuve
pour comparer le résultat à la production. La couverture est prouvée, la
reproduction ne l'est pas.

## Deux paires à lire ensemble

`20260816130000_durcissement_fonctions` retire des droits d'exécution que
`20260816225007_retablir_grants_fonctions` rétablit quelques minutes plus tard :
le retrait rendait l'application inutilisable, les policies RLS appelant ces
fonctions avec les droits de l'appelant. Lire le premier sans le second donne
une idée fausse de l'état de la base.

De même, `valider_jalon` est définie par `20260819120000_phases_jalons` puis
redéfinie par `20260826100000_intervenants_echeancier`, qui lui ajoute le
déclenchement des échéances.

## Ce qui n'est volontairement pas ici

La base de production héberge aussi six tables `k_*` — `k_shops`, `k_products`,
`k_customers`, `k_sales`, `k_sale_items`, `k_stock_movements` — vestiges de
KommerceGN, une autre application qui a depuis son propre projet Supabase. Les
cinq migrations qui les créent restent hors du dépôt : ce sont celles d'un autre
produit, et la base de recette montée le 31/08 s'en passe sans conséquence.
Aucune migration postérieure à avril 2026 ne les référence.

## La règle, désormais

Toute évolution du schéma passe par un fichier de ce dossier, **avec son SQL**.
Un fichier qui se contente de décrire ce qui a été fait ailleurs n'est pas une
migration : c'est une note, et elle laisse le dépôt incapable de reconstruire la
base.
