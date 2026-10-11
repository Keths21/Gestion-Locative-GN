import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Racine de l'espace de travail, fixée explicitement.
//
// Sans elle, Turbopack la devine en remontant les dossiers à la recherche d'un
// verrou npm — et se trompe : ce dépôt vit dans un dossier qui en contient une
// vingtaine d'autres, sans marqueur au-dessus. Turbopack retenait alors le
// dossier parent et n'y trouvait plus tailwindcss.
//
// La deviner correctement dépendait de ce qui traîne AILLEURS sur la machine,
// ce qui n'est pas une base pour une construction reproductible. On la déclare.
const racine = dirname(fileURLToPath(import.meta.url));

// En-têtes de sécurité, sur toutes les réponses. Aucun n'était envoyé avant
// l'audit du 11/10/2026.
//
// - HSTS : sans includeSubDomains. casachams.com héberge d'autres sites en
//   sous-domaine (aymerveille.casachams.com) : les engager pour un an n'est
//   pas une décision à prendre ici.
// - Cadres : le site ne s'affiche dans aucune page tierce. Sans cela, une page
//   piégée pouvait l'intégrer de façon invisible et faire cliquer
//   « Approuver » ou « Supprimer » à son insu.
// - CSP volontairement réduite à ce qui ne peut rien casser : les cadres, la
//   balise <base>, les plugins, la cible des formulaires. Encadrer les scripts
//   demanderait des nonces — Next et le script de configuration Supabase
//   s'exécutent en ligne — et mérite un chantier à part.
// - Permissions : la carte et le journal de chantier se servent de la
//   géolocalisation ; les photos passent par un champ fichier, la caméra reste
//   permise au site lui-même. Le reste est fermé.
const entetesSecurite = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  turbopack: { root: racine },
  // « X-Powered-By: Next.js » ne renseigne que qui cherche une faille connue.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: entetesSecurite }];
  },
  // Rassemble le serveur et ses seules dépendances utiles dans .next/standalone,
  // ce qui permet à l'image Docker de ne contenir ni les sources ni les
  // node_modules de développement. Sans cette ligne, l'image passe de ~200 Mo
  // à plus d'un gigaoctet.
  output: "standalone",
};

export default nextConfig;
