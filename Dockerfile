# syntax=docker/dockerfile:1
#
# Image de CASA CHAMS.
#
# Trois étages, pour que l'image finale ne contienne que ce qui sert à servir :
# ni sources, ni outils de construction, ni dépendances de développement.
#
# Node 20 : c'est la version qui construit déjà l'application sur le VPS
# (20.20.2, installée par nvm). Autant faire tourner en conteneur ce qui est
# éprouvé ailleurs plutôt que d'introduire une variable de plus.

# --- Dépendances -------------------------------------------------------------
# Étage séparé pour que Docker le remette en cache tant que le verrou ne bouge
# pas : une modification de code ne réinstalle pas les dépendances.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Construction ------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Aucune variable d'environnement applicative ici, et c'est le point important :
# cette image ne connaît AUCUN projet Supabase. L'adresse et la clé anon sont
# lues au démarrage du conteneur (SUPABASE_URL, SUPABASE_ANON_KEY dans le .env
# du serveur), transmises au navigateur par le layout racine.
#
# C'est ce qui rend l'image réellement promouvable : les octets validés en
# recette sont ceux qui tournent en production, alors même que les deux visent
# des bases différentes.
#
# Avant d'ajouter un NEXT_PUBLIC_* ici, se demander si la variable est vraiment
# lue par le navigateur, et si sa valeur peut légitimement être la même dans
# tous les environnements. Sinon, elle se passe de préfixe et se lit au
# démarrage — voir lib/config-supabase.ts pour le procédé.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Exécution ---------------------------------------------------------------
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Un utilisateur sans privilèges : rien dans cette application ne demande root,
# et un conteneur qui tourne en root offre une marche de plus à qui trouverait
# une faille dans le serveur.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# server.js est produit par output: "standalone" — ce n'est pas un fichier du
# dépôt. Il embarque son propre serveur : pas de `next start` ici.
CMD ["node", "server.js"]
