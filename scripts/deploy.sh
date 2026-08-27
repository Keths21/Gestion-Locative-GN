#!/usr/bin/env bash
#
# Déploiement de CASA CHAMS sur le VPS srv1571346.
#
#   ./deploy.sh dev              → /var/www/casa-chams-dev, port 3001
#   ./deploy.sh prod             → /var/www/casa-chams,     port 3000
#   ./deploy.sh prod --retour    → revient au commit d'avant le dernier déploiement
#   ./deploy.sh prod --oui       → sans demander confirmation (pour un lancement à distance)
#
# Le principe : rien n'est redémarré tant que la construction n'a pas réussi,
# et une construction qui échoue est défaite plutôt que laissée en place.
#
# Pourquoi ce dernier point : Next sert ses fichiers statiques depuis .next,
# que la construction réécrit. Une construction interrompue laisse donc un
# .next incohérent qui casse le site DÉJÀ EN LIGNE, sans même redémarrer. Le
# script revient alors au commit précédent et reconstruit.
#
# La prod ajoute deux précautions que la recette n'a pas besoin d'avoir :
#
# 1. Elle demande confirmation, après avoir listé les commits qui vont partir.
#    On voit ce qu'on déploie avant de le déployer, pas après.
#
# 2. Elle écrit son point de retour dans .dernier-deploiement, ce qui rend
#    `--retour` possible. La reprise automatique ne couvre que l'échec de
#    construction ; une version qui compile mais se comporte mal une fois en
#    ligne, elle, ne se détecte qu'à l'usage — parfois le lendemain. Il faut
#    alors pouvoir revenir en arrière sans retrouver le bon commit à la main.

set -euo pipefail

# --- Arguments ---------------------------------------------------------------
CIBLE=""
CONFIRME=0
RETOUR=0
for argument in "$@"; do
  case "$argument" in
    prod|dev)  CIBLE="$argument" ;;
    --retour)  RETOUR=1 ;;
    --oui|-y)  CONFIRME=1 ;;
    *) echo "Option inconnue : $argument" >&2; exit 2 ;;
  esac
done

case "$CIBLE" in
  prod) REPERTOIRE=/var/www/casa-chams;     SERVICE=casa-chams;     PORT=3000 ;;
  dev)  REPERTOIRE=/var/www/casa-chams-dev; SERVICE=casa-chams-dev; PORT=3001 ;;
  *)    echo "Usage : $0 [dev|prod] [--retour] [--oui]" >&2; exit 2 ;;
esac

# Node est installé via nvm : il reste invisible d'un shell non interactif
# tant que ce fichier n'est pas chargé.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

command -v npm  >/dev/null || { echo "npm introuvable après chargement de nvm." >&2; exit 1; }
command -v pm2  >/dev/null || { echo "pm2 introuvable." >&2; exit 1; }

cd "$REPERTOIRE"
MARQUE="$REPERTOIRE/.dernier-deploiement"

echo "── $CIBLE · $REPERTOIRE"

# --- Outils ------------------------------------------------------------------

# La prod ne bouge pas sans un accord explicite. En l'absence de terminal
# (lancement par ssh non interactif), on refuse plutôt que de supposer : c'est
# précisément le cas où une erreur de cible passerait inaperçue.
confirmer () {
  [ "$CIBLE" = prod ] || return 0
  [ "$CONFIRME" = 1 ] && return 0
  if [ ! -t 0 ]; then
    echo "   ✗ la production demande une confirmation, or l'entrée n'est pas un terminal." >&2
    echo "     Relancez depuis un shell interactif, ou ajoutez --oui en connaissance de cause." >&2
    exit 1
  fi
  printf '   %s [oui/non] ' "$1"
  read -r reponse
  case "$reponse" in
    oui|OUI|o|O) ;;
    *) echo "   abandon — rien n'a été touché."; exit 0 ;;
  esac
}

# Construit dans le journal indiqué. Ne redémarre rien : l'appelant décide.
construire () {
  npm ci --silent
  npm run build > "$1" 2>&1
}

relancer () {
  echo "── redémarrage"
  pm2 restart "$SERVICE" --update-env >/dev/null
  pm2 save >/dev/null
  sleep 6
}

# Renseigne CODE. Renvoie vrai si le service répond correctement.
controler () {
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://127.0.0.1:$PORT/login" || echo 000)
  [ "$CODE" = "200" ]
}

# --- Retour en arrière -------------------------------------------------------
if [ "$RETOUR" = 1 ]; then
  [ -f "$MARQUE" ] || {
    echo "   ✗ aucun point de retour : $MARQUE est absent." >&2
    echo "     Il n'est écrit qu'après un déploiement réussi par ce script." >&2
    exit 1
  }
  PRECEDENT=$(cat "$MARQUE")
  git cat-file -e "${PRECEDENT}^{commit}" 2>/dev/null || {
    echo "   ✗ le commit enregistré ($PRECEDENT) est introuvable dans ce dépôt." >&2
    exit 1
  }

  echo "   actuel    : $(git rev-parse --short HEAD)"
  echo "   retour à  : $(git rev-parse --short "$PRECEDENT")  $(git log -1 --format=%s "$PRECEDENT")"
  confirmer "Ramener la PRODUCTION à ce commit ?"

  echo "── retour"
  git reset --hard "$PRECEDENT" --quiet
  echo "── construction"
  if ! construire "/tmp/retour-$SERVICE.log"; then
    echo "   ✗ la construction du commit précédent a échoué : /tmp/retour-$SERVICE.log" >&2
    exit 1
  fi
  relancer
  if controler; then
    echo "   ✓ /login répond 200 sur le port $PORT"
    echo "── revenu à : $(git rev-parse --short HEAD)"
    rm -f "$MARQUE"   # ce point de retour a servi ; le garder inviterait à y revenir deux fois
  else
    echo "   ✗ /login répond $CODE même après retour — voir pm2 logs $SERVICE --lines 40" >&2
    exit 1
  fi
  exit 0
fi

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
# fetch puis merge, plutôt que pull : ça laisse la place, entre les deux, pour
# montrer ce qui arrive et demander confirmation. Et --ff-only refuse d'inventer
# un commit de fusion sur le serveur si l'historique a divergé — un déploiement
# n'est pas l'endroit où résoudre ça.
echo "── récupération"
git fetch origin main --quiet
APRES=$(git rev-parse FETCH_HEAD)

if [ "$AVANT" = "$APRES" ]; then
  echo "   déjà à jour ($(git rev-parse --short HEAD)) — rien à déployer."
  exit 0
fi

NOMBRE=$(git rev-list --count "$AVANT..$APRES")
echo "   $(git rev-parse --short "$AVANT") → $(git rev-parse --short "$APRES")  ($NOMBRE commits)"
git --no-pager log --oneline "$AVANT..$APRES" | sed 's/^/     /'

confirmer "Déployer ces $NOMBRE commits en PRODUCTION ?"

git merge --ff-only FETCH_HEAD --quiet || {
  echo "   ✗ avance rapide impossible : l'historique local a divergé de origin/main." >&2
  echo "     Inspectez avec : git -C $REPERTOIRE log --oneline origin/main..HEAD" >&2
  exit 1
}

# --- Dépendances et construction ---------------------------------------------
# npm ci, jamais npm install : ci installe à l'identique du verrou sans jamais
# le réécrire, ce qui évite la dérive qui bloque le pull suivant.
echo "── dépendances et construction (le site reste en ligne pendant ce temps)"
if ! construire "/tmp/build-$SERVICE.log"; then
  echo "   ✗ construction en échec — extrait :" >&2
  tail -25 "/tmp/build-$SERVICE.log" | sed 's/^/     /' >&2
  echo "── retour au commit précédent (un .next incomplet casserait le site en ligne)" >&2
  git reset --hard "$AVANT" --quiet
  construire "/tmp/rebuild-$SERVICE.log" \
    && echo "   état précédent rétabli." >&2 \
    || echo "   ✗ la reconstruction a elle aussi échoué : voir /tmp/rebuild-$SERVICE.log" >&2
  exit 1
fi
grep -E "Compiled|Generating" "/tmp/build-$SERVICE.log" | sed 's/^/   /' || true

# --- Redémarrage et contrôle -------------------------------------------------
relancer

if controler; then
  echo "   ✓ /login répond 200 sur le port $PORT"
  # Écrit seulement maintenant : un point de retour n'a de sens qu'une fois
  # qu'il y a quelque chose à défaire.
  echo "$AVANT" > "$MARQUE"
  echo "── déployé : $(git rev-parse --short HEAD)"
  echo "   en cas de problème constaté plus tard : $0 $CIBLE --retour"
else
  echo "   ✗ /login répond $CODE — le service ne sert pas correctement." >&2
  echo "     journaux : pm2 logs $SERVICE --lines 40" >&2
  echo "$AVANT" > "$MARQUE"
  echo "     retour arrière : $0 $CIBLE --retour" >&2
  exit 1
fi
