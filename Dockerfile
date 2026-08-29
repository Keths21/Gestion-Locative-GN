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

# Next remplace les NEXT_PUBLIC_* par leur valeur DANS le bundle client au
# moment de la construction, pas au démarrage. Elles doivent donc être connues
# ici, et l'image qui en résulte est liée à ces valeurs. Ce ne sont pas des
# secrets : la clé anon est faite pour être envoyée au navigateur, c'est le RLS
# qui protège les données.
#
# Les autres variables (Resend, Nimba, service_role…) ne sont PAS ici : elles
# sont lues au démarrage et restent dans le .env du serveur.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1

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
