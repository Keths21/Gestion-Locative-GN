/* Service worker — CASA CHAMS, module de cartographie foncière
 *
 * Stratégies :
 *  - tuiles cartographiques   : cache d'abord, cache persistant entre versions
 *  - ressources /_next/static : cache d'abord (fichiers versionnés)
 *  - navigations              : réseau d'abord, repli sur le cache puis /hors-ligne
 *  - API en lecture (GET)     : réseau d'abord, repli sur le cache
 *  - API en écriture          : réseau uniquement — la file d'attente est gérée
 *                               par l'application, pas par le worker
 *
 * Le repli des navigations sur le cache est ce qui rend l'application
 * utilisable sans réseau : le proxy, qui interroge Supabase pour valider
 * la session, n'est jamais atteint puisqu'aucune requête ne part.
 */

// Incrémenter à chaque changement qui doit invalider le cache des appareils
// déjà installés. `v2` : la configuration Supabase n'est plus figée dans le
// bundle mais injectée dans le HTML au rendu (voir lib/config-supabase.ts).
// Une coquille en cache porte donc l'adresse de la base visée au moment où elle
// a été mise en cache — sans ce changement de nom, un appareil hors ligne
// continuerait de viser l'ancien projet après la bascule de la recette.
const VERSION = 'v2';
const CACHE_APP = `casachams-app-${VERSION}`;
const CACHE_API = `casachams-api-${VERSION}`;
const CACHE_TUILES = 'casachams-tuiles-v1';

const COQUILLE = ['/carte', '/parcelles', '/hors-ligne', '/manifest.webmanifest'];

const HOTES_TUILES = [
  'server.arcgisonline.com',
  'basemaps.arcgis.com',
  'basemaps-api.arcgis.com',
  'ibasemaps-api.arcgis.com',
  'tile.openstreetmap.org',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE_APP)
      .then((c) =>
        Promise.allSettled(COQUILLE.map((u) => c.add(new Request(u, { cache: 'reload' }))))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(
          cles
            .filter(
              (c) =>
                c.startsWith('casachams-') &&
                c !== CACHE_APP &&
                c !== CACHE_API &&
                c !== CACHE_TUILES
            )
            .map((c) => caches.delete(c))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (HOTES_TUILES.includes(url.hostname)) {
    e.respondWith(cacheDAbord(req, CACHE_TUILES));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  // Jamais mettre en cache l'authentification : une réponse périmée
  // ferait croire à une session encore valide.
  if (url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/login')) return;

  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/')) {
    e.respondWith(cacheDAbord(req, CACHE_APP));
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(navigation(req));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(reseauDAbord(req, CACHE_API));
    return;
  }

  e.respondWith(reseauDAbord(req, CACHE_APP));
});

async function cacheDAbord(req, nomCache) {
  const cache = await caches.open(nomCache);
  const enCache = await cache.match(req, { ignoreVary: true });
  if (enCache) return enCache;
  try {
    const rep = await fetch(req);
    if (rep && (rep.ok || rep.type === 'opaque')) cache.put(req, rep.clone());
    return rep;
  } catch {
    return new Response('', { status: 504, statusText: 'Hors-ligne' });
  }
}

async function reseauDAbord(req, nomCache) {
  const cache = await caches.open(nomCache);
  try {
    const rep = await fetch(req);
    if (rep && rep.ok) cache.put(req, rep.clone());
    return rep;
  } catch {
    const enCache = await cache.match(req, { ignoreVary: true });
    if (enCache) return enCache;
    return new Response(JSON.stringify({ erreur: 'hors-ligne' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function navigation(req) {
  const cache = await caches.open(CACHE_APP);
  try {
    const rep = await fetch(req);
    if (rep && rep.ok) cache.put(req, rep.clone());
    return rep;
  } catch {
    const enCache =
      (await cache.match(req, { ignoreVary: true })) || (await cache.match('/carte'));
    if (enCache) return enCache;
    const repli = await cache.match('/hors-ligne');
    if (repli) return repli;
    return new Response('Hors-ligne', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
