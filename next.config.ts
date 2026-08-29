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

const nextConfig: NextConfig = {
  turbopack: { root: racine },
  // Rassemble le serveur et ses seules dépendances utiles dans .next/standalone,
  // ce qui permet à l'image Docker de ne contenir ni les sources ni les
  // node_modules de développement. Sans cette ligne, l'image passe de ~200 Mo
  // à plus d'un gigaoctet.
  output: "standalone",
};

export default nextConfig;
