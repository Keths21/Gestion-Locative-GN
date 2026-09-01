/**
 * Identité de l'environnement, lue au démarrage.
 *
 * Née d'une confusion réelle : devant des parcelles de recette dessinées à de
 * vraies coordonnées de Conakry, sur le même fond de carte qu'en production, on
 * ne savait plus quel environnement on regardait. Préfixer les données d'un
 * « REC — » traitait le symptôme ; l'écran, lui, restait muet.
 *
 * Le verrou est fermé par défaut, comme celui des envois : un environnement qui
 * ne se déclare pas est signalé. Il faut poser ENVIRONNEMENT=production pour
 * faire taire le bandeau.
 *
 * L'inverse serait tentant — pas de bandeau sauf mention contraire — et
 * exactement à l'envers : une recette montée à la hâte, un conteneur de secours,
 * une machine de développement passeraient alors pour la production par simple
 * omission. C'est précisément la confusion qu'on cherche à rendre impossible.
 * Le pire que puisse produire ce choix, c'est une production qui s'annonce à
 * tort comme recette : voyant, embarrassant, corrigé en une ligne. L'erreur
 * inverse, elle, ne se voit pas.
 *
 * Ce module ne tourne que côté serveur. Le bandeau est rendu par le layout
 * racine, déjà dynamique : aucun JavaScript n'est envoyé au navigateur pour ça.
 */

export type Environnement = {
  /** Vrai uniquement si l'environnement s'est explicitement déclaré. */
  production: boolean
  /** Ce qu'affiche le bandeau. */
  nom: string
}

export function environnement(): Environnement {
  const declare = (process.env.ENVIRONNEMENT ?? '').trim()

  if (declare.toLowerCase() === 'production') {
    return { production: true, nom: 'Production' }
  }

  return {
    production: false,
    // Un environnement muet est plus inquiétant qu'un environnement nommé :
    // le bandeau le dit plutôt que d'inventer une étiquette rassurante.
    nom: declare || 'environnement non identifié',
  }
}
