'use client'
import { createContext, useContext } from 'react'

/**
 * Droits de l'utilisateur, tels que la base les calcule (etat_acces).
 *
 * La mise en page les lit une fois et les partage : chaque écran s'en sert
 * pour masquer ce que l'utilisateur ne peut pas faire. Jusqu'ici seuls la
 * carte et les parcelles le faisaient ; ailleurs, un collaborateur en lecture
 * seule voyait « Ajouter », « Modifier », « Supprimer »… et chaque clic
 * échouait sur un refus de la base.
 *
 * La base reste seule juge : masquer n'est qu'un confort. Depuis le
 * 11/10/2026 elle réduit aussi l'écriture à la lecture quand l'abonnement de
 * l'agence a expiré — d'où le même mécanisme pour les deux situations.
 */

export type Domaine = 'locatif' | 'foncier' | 'chantiers'
type Niveau = 'aucun' | 'lecture' | 'ecriture'

export type EtatDroits = {
  est_proprietaire: boolean
  droit_locatif: Niveau
  droit_foncier: Niveau
  droit_chantiers: Niveau
  abonnement_actif: boolean | null
}

const ContexteDroits = createContext<EtatDroits | null>(null)

export const FournisseurDroits = ContexteDroits.Provider

export function useDroits() {
  const d = useContext(ContexteDroits)
  return {
    /**
     * Peut-on écrire dans ce domaine ? Vrai tant que les droits ne sont pas
     * connus : un bouton qui disparaît après coup se lit comme un accès retiré,
     * et la base refuse de toute façon ce qui n'est pas permis.
     */
    ecriture: (domaine: Domaine) => d === null || d[`droit_${domaine}`] === 'ecriture',
    /** Propriétaire de l'agence ET en droit d'écrire (abonnement à jour). */
    gestionAgence: d === null || (d.est_proprietaire && d.droit_locatif === 'ecriture'),
    abonnementExpire: d?.abonnement_actif === false,
  }
}
