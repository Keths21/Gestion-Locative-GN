/**
 * Adresse du projet Supabase — lue au démarrage, pas figée à la construction.
 *
 * Pourquoi ce détour plutôt qu'un simple `NEXT_PUBLIC_SUPABASE_URL` : Next
 * remplace les `NEXT_PUBLIC_*` par leur valeur DANS le bundle au moment du
 * build. Une image construite avec ce préfixe est donc mariée à un projet
 * Supabase précis — alors que `production.yml` promeut justement l'empreinte
 * exacte validée en recette, sans reconstruire. Tant que l'adresse était
 * gravée, recette et production ne pouvaient pas viser deux bases distinctes.
 *
 * On lit donc ces deux valeurs sans préfixe, au démarrage, exactement comme
 * `APP_URL`. Le serveur y accède directement par `process.env` ; le navigateur,
 * lui, les reçoit du layout racine, qui les dépose dans `window` avant que
 * React n'hydrate la page.
 *
 * La clé anon n'est pas un secret : elle est faite pour aller au navigateur,
 * c'est le RLS qui protège les données. Ce qui change ici, ce n'est pas sa
 * confidentialité, c'est le moment où on la lit.
 */

export type ConfigSupabase = {
  url: string
  cleAnon: string
}

declare global {
  interface Window {
    __CONFIG_SUPABASE__?: ConfigSupabase
  }
}

/**
 * Côté serveur : lit l'environnement du processus.
 *
 * La vérification est faite ici, à l'appel, et non au chargement du module :
 * Next importe ces fichiers pendant la construction pour en collecter les
 * métadonnées, et une image ne doit pas échouer à se construire parce qu'une
 * variable d'exécution manque à ce moment-là.
 */
export function configSupabaseServeur(): ConfigSupabase {
  const url = process.env.SUPABASE_URL
  const cleAnon = process.env.SUPABASE_ANON_KEY

  if (!url || !cleAnon) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_ANON_KEY doivent être présentes au démarrage. ' +
        'En développement : .env.local. En recette et en production : le .env du serveur.'
    )
  }

  return { url, cleAnon }
}

/**
 * Des deux côtés de la frontière.
 *
 * Un composant marqué `'use client'` s'exécute AUSSI sur le serveur au premier
 * rendu : se contenter de `window` casserait le rendu initial des 22 pages qui
 * appellent `createClient()` dans leur corps.
 */
export function configSupabase(): ConfigSupabase {
  if (typeof window === 'undefined') return configSupabaseServeur()

  const config = window.__CONFIG_SUPABASE__
  if (!config) {
    throw new Error(
      "Configuration Supabase absente du navigateur : le script d'injection du " +
        "layout racine n'a pas été exécuté."
    )
  }
  return config
}

/**
 * Le script injecté dans la page. Sérialisé ici pour que l'échappement soit
 * écrit à un seul endroit.
 *
 * `<` devient `<` : sans quoi une valeur contenant `</script>` refermerait
 * la balise et le reste serait interprété comme du HTML. Aucune URL ni aucun
 * JWT ne contient ce caractère en pratique — mais cet échappement ne coûte rien
 * et retire la question.
 */
export function scriptConfigSupabase(config: ConfigSupabase): string {
  const charge = JSON.stringify(config).replace(/</g, '\\u003c')
  return `window.__CONFIG_SUPABASE__=${charge}`
}
