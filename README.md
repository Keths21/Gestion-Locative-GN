# 🏠 CASA CHAMS

Plateforme de gestion immobilière multi-organisation pour la Guinée : gestion locative,
cartographie foncière et suivi de chantiers, dans une seule application.

En production sur [casachams.com](https://casachams.com) — recette sur `dev.casachams.com`.

---

## Ce que fait l'application

### Gestion locative
Biens en location **mensuelle** (loyer + charges) ou **à la nuit** (prix par nuit), locataires
rattachés à un bien avec dates d'entrée et de sortie, et suivi des paiements (`payé`, `en attente`,
`impayé`). Les échéances se génèrent automatiquement, et les impayés donnent lieu à des relances
groupées.

### Documents
Quittances, baux, relances et états des lieux sont produits en PDF côté navigateur (jsPDF), aux
couleurs de l'agence. Les montants sont convertis en toutes lettres, et la quittance reprend le
modèle de reçu en vigueur, tampon compris.

### Envoi multicanal
Chaque document part par **courriel** (Resend), **SMS** (Nimba SMS par défaut, Africa's Talking en
second fournisseur) ou **WhatsApp** (Meta Cloud API). Le canal se choisit par variable
d'environnement, sans changement de code.

### Cartographie foncière
Parcelles tracées sur fond de carte Leaflet, avec géométries stockées en **PostGIS**. Import de
fichiers de géomètre et de relevés GPS, calcul d'itinéraire vers une parcelle, photos et documents
associés. Le module **fonctionne hors connexion** (IndexedDB + service worker) puis se
resynchronise — indispensable sur le terrain, où le réseau manque.

### Travaux et chantiers
Un chantier existe **de façon autonome**, sans être rattaché à un bien ni à une parcelle. Il porte
son budget (postes et dépenses), son planning (phases, jalons, avancement), son journal
géolocalisé, son annuaire d'intervenants et son échéancier de paiement. Valider un jalon rend
exigibles les échéances qui en dépendent : tant que l'ouvrage n'est pas réceptionné, l'échéance
reste verrouillée. Les chantiers se partagent par un modèle d'accès dédié, distinct de
l'organisation.

### Comptes et accès
L'inscription est libre, mais **un administrateur doit approuver** chaque compte avant tout accès.
Les statuts `pending`, `rejected` et `approved` sont arbitrés par le middleware, qui protège aussi
les routes `/admin`.

---

## Pile technique

| | |
|---|---|
| Cadre applicatif | Next.js 16 (App Router) · React 19 · TypeScript 5.9 |
| Style | Tailwind CSS 4 · Radix UI · lucide-react |
| Données | Supabase — PostgreSQL + PostGIS, Auth, Storage |
| Formulaires | React Hook Form + Zod |
| Cartographie | Leaflet + Geoman · fonds Esri/ArcGIS ou OpenStreetMap |
| Hors connexion | IndexedDB (`idb`) + service worker |
| Documents | jsPDF + jsPDF-AutoTable |
| Graphiques | Recharts |
| Notifications | Resend · Nimba SMS · Africa's Talking · Meta Cloud API |

---

## Organisation du code

```
src/
├── app/
│   ├── (auth)/         login · register · pending-approval · account-rejected
│   ├── (dashboard)/    dashboard · biens · locataires · paiements · documents
│   │                   relances · carte · parcelles · chantiers · parametres
│   │                   admin/users
│   ├── api/            email|sms|whatsapp × relance|quittance
│   │                   admin/users · chantiers/alerte-echeance
│   │                   import · export · sync
│   └── hors-ligne/     page servie quand le réseau manque
├── components/         biens · locataires · paiements · documents
│                       parcelles · chantiers · layout · ui
├── lib/
│   ├── supabase.ts · supabase-server.ts    clients navigateur et serveur
│   ├── schemas.ts                          validation Zod
│   ├── parcelles.ts · geo.ts · fonds-carte.ts · import-parcelles.ts
│   ├── chantiers.ts · echeancier.ts · intervenants.ts · journal-chantier.ts
│   ├── relances.ts · echeances.ts · envoi.ts
│   ├── pdf.ts · montant-en-lettres.ts
│   └── offline/        idb.ts · sync.ts
├── types/
└── middleware.ts       routage selon le statut d'approbation et le rôle
```

### Base de données

Le schéma initial est dans `supabase/schema.sql`, et son évolution dans `supabase/migrations/`.

Locatif : `biens`, `locataires`, `paiements`, `parametres`, `profiles`.
Socle : `organisations`, `membres`.
Foncier : `parcelles`, `parcelle_documents`, `journal_parcelles`.
Chantiers : `chantiers`, `acces_chantier`, `postes_budget`, `depenses_chantier`,
`phases_chantier`, `jalons_chantier`, `journal_chantier`, `intervenants`, `interventions`,
`echeances_chantier`.

**Toutes les tables sont protégées par RLS**, cloisonnées par organisation. Les migrations ne
partent pas avec le déploiement de code : elles s'appliquent séparément sur le projet Supabase.

---

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs (voir ci-dessous)
npm run dev                  # http://localhost:3000
```

| commande | effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | construction de production (Turbopack) |
| `npm start` | serveur de production |
| `npm run lint` | ESLint |

Aucun cadre de test n'est configuré à ce jour.

---

## Variables d'environnement

La distinction ci-dessous n'est pas cosmétique. Next remplace les `NEXT_PUBLIC_*` par leur valeur
**au moment de la construction** : elles sont gravées dans le bundle et dans l'image Docker. Les
autres sont lues **au démarrage**, et peuvent donc différer d'un environnement à l'autre à image
identique.

### Figées à la construction

| variable | rôle |
|---|---|
| `NEXT_PUBLIC_ARCGIS_API_KEY` | clé Esri ; sans elle, l'application bascule sur OpenStreetMap |
| `NEXT_PUBLIC_TUILES_PLAN` · `_SATELLITE` · `_REPERES` | fonds de carte, si l'on veut d'autres tuiles |

> Avant d'ajouter un `NEXT_PUBLIC_*`, vérifier que le navigateur le lit vraiment **et** que sa
> valeur peut être la même partout : sinon elle rattache l'image à un seul environnement.
>
> `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont lues par le navigateur mais n'ont pas ce préfixe,
> précisément pour cette raison. Le layout racine les lui transmet au rendu — voir
> `src/lib/config-supabase.ts`.

### Lues au démarrage

| variable | rôle |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | clé anon — publique par nature, c'est le RLS qui protège |
| `SUPABASE_SERVICE_ROLE_KEY` | administration des comptes — **secret, jamais côté navigateur** |
| `APP_URL` | adresse publique de l'environnement, pour les liens des courriels (défaut : `https://casachams.com`) |
| `RESEND_API_KEY` | envoi des courriels |
| `SMS_PROVIDER` | `nimbasms` (défaut) ou `africastalking` |
| `NIMBASMS_AUTH_TOKEN` · `NIMBASMS_SENDER_NAME` | fournisseur SMS par défaut |
| `AFRICASTALKING_API_KEY` · `_USERNAME` · `_SENDER_ID` · `_SANDBOX` | fournisseur SMS alternatif |
| `WHATSAPP_ACCESS_TOKEN` · `WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API |

---

## Déploiement

Les deux environnements vivent sur le même VPS et partagent le même projet Supabase.

### Recette — `dev.casachams.com`

Automatique. Un push sur `main` déclenche `.github/workflows/recette.yml` : GitHub construit
l'image, la publie sur GHCR, puis le serveur bascule dessus. **Rien n'est construit sur le
serveur**, et l'ancienne image continue de servir jusqu'à ce que la nouvelle soit saine.

Le déploiement se fait par **empreinte** et non par étiquette : le serveur installe exactement
l'image qui vient d'être construite, et c'est cette même image, à l'octet près, qui pourra être
promue en production.

### Production — `casachams.com`

Manuelle, depuis les sources, tant que le circuit précédent n'a pas fait ses preuves :

```bash
./scripts/deploy.sh prod             # liste les commits, demande confirmation
./scripts/deploy.sh prod --retour    # revient au commit d'avant le dernier déploiement
```

Le script construit avant de redémarrer, revient en arrière si la construction échoue, et vérifie
que l'application répond avant de se déclarer satisfait.

---

## Licence et auteur

Développé par [@Keths21](https://github.com/Keths21) pour Innovea Group.
