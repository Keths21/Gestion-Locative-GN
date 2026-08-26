#!/usr/bin/env bash
#
# Déploiement de CASA CHAMS sur le VPS srv1571346.
#
#   ./deploy.sh dev     → /var/www/casa-chams-dev, port 3001
#   ./deploy.sh prod    → /var/www/casa-chams,     port 3000
#
# Le principe : rien n'est redémarré tant que la construction n'a pas réussi,
# et une construction qui échoue est défaite plutôt que laissée en place.
#
# Pourquoi ce dernier point : Next sert ses fichiers statiques depuis .next,
# que la construction réécrit. Une construction interrompue laisse donc un
# .next incohérent qui casse le site DÉJÀ EN LIGNE, sans même redémarrer. Le
# script revient alors au commit précédent et reconstruit.

set -euo pipefail

CIBLE="${1:-}"
case "$CIBLE" in
  prod) REPERTOIRE=/var/www/casa-chams;     SERVICE=casa-chams;     PORT=3000 ;;
  dev)  REPERTOIRE=/var/www/casa-chams-dev; SERVICE=casa-chams-dev; PORT=3001 ;;
  *)    echo "Usage : $0 [dev|prod]" >&2; exit 2 ;;
esac

# Node est installé via nvm : il reste invisible d'un shell non interactif
# tant que ce fichier n'est pas chargé.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

command -v npm  >/dev/null || { echo "npm introuvable après chargement de nvm." >&2; exit 1; }
command -v pm2  >/dev/null || { echo "pm2 introuvable." >&2; exit 1; }

cd "$REPERTOIRE"

echo "── $CIBLE · $REPERTOIRE"

# --- Point de retour ---------------------------------------------------------
AVANT=$(git rev-parse HEAD)
echo "   commit actuel : $(git rev-parse --short HEAD)"

# --- Modifications locales ---------------------------------------------------
# package-lock.json dérive tout seul si un npm install a été lancé à la main :
# on le rend, c'est un fichier généré. Toute AUTRE modification arrête le
# script — écraser le travail de quelqu'un sans le lui dire serait pire que
# de ne pas déployer.
git checkout -- package-lock.json 2>/dev/null || true

DIVERGENT=$(git status --porcelain --untracked-files=no)
if [ -n "$DIVERGENT" ]; then
  echo "   ✗ modifications locales non commitées :" >&2
  echo "$DIVERGENT" | sed 's/^/     /' >&2
  echo "   Traitez-les d'abord (git stash, ou commit), puis relancez." >&2
  exit 1
fi

# --- Récupération ------------------------------------------------------------
echo "── récupération"
git pull origin main
APRES=$(git rev-parse HEAD)

if [ "$AVANT" = "$APRES" ]; then
  echo "   déjà à jour ($(git rev-parse --short HEAD)) — rien à déployer."
  exit 0
fi
echo "   $(git rev-parse --short "$AVANT") → $(git rev-parse --short "$APRES")"
git --no-pager log --oneline "$AVANT..$APRES" | sed 's/^/     /'

# --- Dépendances -------------------------------------------------------------
# npm ci, jamais npm install : ci installe à l'identique du verrou sans jamais
# le réécrire, ce qui évite la dérive qui bloque le pull suivant.
echo "── dépendances"
npm ci --silent

# --- Construction ------------------------------------------------------------
echo "── construction (le site reste en ligne pendant ce temps)"
if ! npm run build > /tmp/build-$SERVICE.log 2>&1; then
  echo "   ✗ construction en échec — extrait :" >&2
  tail -25 "/tmp/build-$SERVICE.log" | sed 's/^/     /' >&2
  echo "── retour au commit précédent (un .next incomplet casserait le site en ligne)" >&2
  git reset --hard "$AVANT" --quiet
  npm ci --silent
  npm run build > /tmp/rebuild-$SERVICE.log 2>&1 \
    && echo "   état précédent rétabli." >&2 \
    || echo "   ✗ la reconstruction a elle aussi échoué : voir /tmp/rebuild-$SERVICE.log" >&2
  exit 1
fi
grep -E "Compiled|Generating" "/tmp/build-$SERVICE.log" | sed 's/^/   /' || true

# --- Redémarrage -------------------------------------------------------------
echo "── redémarrage"
pm2 restart "$SERVICE" --update-env >/dev/null
pm2 save >/dev/null
sleep 6

# --- Contrôle ----------------------------------------------------------------
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://127.0.0.1:$PORT/login" || echo 000)
if [ "$CODE" = "200" ]; then
  echo "   ✓ /login répond 200 sur le port $PORT"
  echo "── déployé : $(git rev-parse --short HEAD)"
else
  echo "   ✗ /login répond $CODE — le service ne sert pas correctement." >&2
  echo "     journaux : pm2 logs $SERVICE --lines 40" >&2
  echo "     retour arrière : git reset --hard $(git rev-parse --short "$AVANT") && npm ci && npm run build && pm2 restart $SERVICE" >&2
  exit 1
fi
