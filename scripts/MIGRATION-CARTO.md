# Migration de CartographieBiens vers CASA CHAMS

Procédure de reprise du portefeuille foncier puis d'arrêt de l'application
autonome `cartographiegn`.

La chaîne a été répétée de bout en bout sur la base de démonstration
(5 parcelles, 4 avec tracé, 11 606 258 m²) : superficies identiques après
recalcul PostGIS, et deux passages consécutifs sans créer de doublon.

**Ce qui reste à faire ne peut l'être que depuis le VPS**, qui seul a accès à
la base de production et aux fichiers.

---

## Avant de commencer

Chaque personne qui utilise `cartographiegn` doit avoir **un compte CASA CHAMS
approuvé, avec la même adresse e-mail**. C'est cette adresse qui sert de pont
entre les deux applications : l'import y retrouve l'organisation de
destination. Sans compte correspondant, ses parcelles sont refusées — et c'est
volontaire, mieux vaut un refus qu'un rattachement au mauvais portefeuille.

Pour lister les adresses concernées :

```sql
SELECT lower(email), nom, role FROM utilisateurs WHERE actif ORDER BY email;
```

---

## 1. Export (sur le VPS `srv1571346`)

Repères tirés de `deploy/DEPLOIEMENT.md` de l'application source :

| Élément | Valeur |
|---|---|
| Code | `/srv/cartographie` |
| Fichiers | `/srv/cartographie/data/uploads` |
| Conteneur base | `carto-db` (utilisateur `carto`, base `cartographie`) |
| Port base | **aucun** — la base n'est joignable que par le réseau Docker |

La base n'étant pas exposée, tout passe par `docker exec`.

### 1.0 Sauvegarder d'abord

```bash
mkdir -p /var/sauvegardes/cartographie
docker exec carto-db pg_dump -U carto -d cartographie --format=custom \
  > /var/sauvegardes/cartographie/avant-migration-$(date +%F).dump
tar czf /var/sauvegardes/cartographie/uploads-avant-migration-$(date +%F).tar.gz \
  -C /srv/cartographie/data uploads
```

### 1.1 Mesurer le volume

À faire **avant tout le reste** : la mise en production étant récente, il se
peut qu'il n'y ait rien à reprendre.

```bash
docker exec carto-db psql -U carto -d cartographie -c "
SELECT (SELECT count(*) FROM organisations) AS organisations,
       (SELECT count(*) FROM utilisateurs)  AS comptes,
       (SELECT count(*) FROM biens WHERE supprime_le IS NULL) AS parcelles,
       (SELECT count(*) FROM documents)     AS documents;"
```

Si `parcelles` vaut 0 : il n'y a pas de migration à faire, passez directement
à l'étape 5 (bascule).

### 1.2 Exporter

Le script est dans le dépôt CASA CHAMS, pas sur le VPS. Depuis le poste :

```bash
scp scripts/exporter-carto.sql root@187.124.217.166:/root/
```

Puis sur le VPS :

```bash
docker exec -i carto-db psql -U carto -d cartographie -At \
  < /root/exporter-carto.sql > /root/carto-export.json

tar czf /root/carto-documents.tar.gz -C /srv/cartographie/data/uploads .
```

Contrôle du contenu :

```bash
python3 -c "import json;d=json.load(open('/root/carto-export.json'));\
print(len(d['organisations']),'org',len(d['parcelles']),'parcelles',len(d['documents']),'documents')"
```

### 1.3 Rapatrier

Depuis le poste :

```bash
scp root@187.124.217.166:/root/carto-export.json .
scp root@187.124.217.166:/root/carto-documents.tar.gz .
mkdir -p documents && tar xzf carto-documents.tar.gz -C documents
```

## 2. Simulation

Toujours commencer par là : rien n'est écrit, et la correspondance des
organisations est affichée.

```bash
node --env-file=.env.local scripts/importer-carto.mjs \
  --bundle carto-export.json
```

Si une organisation ressort en `AUCUNE CORRESPONDANCE`, créez le compte
manquant dans CASA CHAMS et faites-le approuver, puis relancez.

## 3. Import

```bash
node --env-file=.env.local scripts/importer-carto.mjs \
  --bundle carto-export.json \
  --documents ./documents \
  --executer
```

Le script compare, parcelle par parcelle, la superficie recalculée par PostGIS
à celle de la base source. La ligne attendue en fin de traitement :

```
superficies : toutes identiques à la source après recalcul PostGIS ✓
```

Tout écart supérieur à 0,01 % est listé nommément. **Un écart n'est pas une
fatalité** : reprenez l'import une fois la cause corrigée, il est rejouable.

## 4. Vérification

```sql
SELECT count(*) AS parcelles,
       count(*) FILTER (WHERE geom IS NOT NULL) AS avec_trace,
       round(sum(superficie_m2))::bigint AS surface_totale_m2
  FROM parcelles;
```

Comparez avec la source :

```sql
SELECT count(*), count(geom), round(sum(superficie_m2))::bigint
  FROM biens WHERE supprime_le IS NULL;
```

Puis, dans l'application, ouvrez `/carte` avec chaque compte migré et vérifiez
que le portefeuille s'affiche au bon endroit.

## 5. Bascule

Ne coupez rien tant que le point 4 n'est pas validé compte par compte.

Le vhost est versionné dans `/opt/pbp-guinee/nginx/host/`, conformément à la
convention de la machine. Modifiez le bloc 443 de
`cartographiegn.innoveagroup.tech.conf` pour remplacer le `location /` par :

```nginx
location / {
    return 301 https://casachams.com/carte;
}
```

Avant de déployer, vérifier qu'aucun vhost en service n'a divergé de sa version
versionnée — `deploy.sh` réinstalle **tous** les vhosts du dossier :

```bash
for f in /opt/pbp-guinee/nginx/host/*.conf; do
  n=$(basename "$f" .conf)
  diff -q "$f" "/etc/nginx/sites-available/$n" >/dev/null 2>&1 \
    && echo "IDENTIQUE $n" || echo "DIVERGENT $n"
done

cd /opt/pbp-guinee && ./nginx/host/deploy.sh
```

Gardez le bloc 80 et le `location /.well-known/acme-challenge/` : sans lui, le
renouvellement du certificat échouera tant que le domaine existe.

## 6. Arrêt

**Après une période d'observation d'au moins deux semaines**, le temps que les
utilisateurs basculent et qu'un éventuel oubli remonte.

```bash
cd /srv/cartographie
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml down
```

Le volume `carto-pgdata` survit à un `down` : la base reste récupérable. Ne le
supprimez qu'après avoir sorti l'archive du VPS, et jamais le même jour que
l'arrêt du conteneur.

Le port 3004 redevient libre — pensez à le noter, la convention de la machine
tient l'inventaire des ports occupés.

---

## En cas de problème

| Symptôme | Cause probable | Correction |
|---|---|---|
| `AUCUNE CORRESPONDANCE` | Compte absent ou e-mail différent | Créer le compte dans CASA CHAMS avec la même adresse, le faire approuver |
| `permission denied` | Clé de service absente ou erronée | Vérifier `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local` |
| Écart de superficie | Géométrie invalide à la source | Corriger le tracé côté source, ré-exporter, relancer |
| Document `absent` | `--documents` mal pointé | Vérifier que le chemin contient bien l'arborescence de `UPLOAD_DIR` |

L'import étant idempotent, **relancer est toujours sans danger** : les
parcelles déjà reprises sont mises à jour, pas dupliquées.
