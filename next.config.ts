import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Rassemble le serveur et ses seules dépendances utiles dans .next/standalone,
  // ce qui permet à l'image Docker de ne contenir ni les sources ni les
  // node_modules de développement. Sans cette ligne, l'image passe de ~200 Mo
  // à plus d'un gigaoctet.
  output: "standalone",
};

export default nextConfig;
