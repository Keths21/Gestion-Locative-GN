'use client'

import type { Parcelle } from '@/types'
import {
  ecrireMeta,
  ecrireParcellesLocales,
  fileMutations,
  lireMeta,
  marquerEchec,
  retirerMutation,
  supprimerParcelleLocale,
} from './idb'

/**
 * Synchronisation de la file d'écritures avec le serveur.
 *
 * Trois issues, qu'il faut absolument distinguer :
 *  - pas de réseau : la file est intacte, on retentera, rien à signaler ;
 *  - session expirée : l'utilisateur doit se reconnecter, il faut le dire ;
 *  - refus métier : la modification est perdue, il faut la nommer.
 *
 * Les confondre reviendrait à afficher « hors ligne » à quelqu'un qui a du
 * réseau mais doit se reconnecter — c'est pourquoi /api/sync répond 401 en
 * JSON et non par une redirection.
 */

export interface ResultatSync {
  envoyees: number
  refusees: { parcelle_id: string; motif: string }[]
  recues: number
  horodatage: string | null
  erreur?: 'hors-ligne' | 'session-expiree' | string
}

const CLE_DERNIERE = 'derniere_sync'
const CLE_CONFLITS = 'conflits'

export async function derniereSync(): Promise<string | null> {
  return lireMeta<string>(CLE_DERNIERE)
}

export async function conflits(): Promise<{ parcelle_id: string; motif: string; le: number }[]> {
  return (await lireMeta<{ parcelle_id: string; motif: string; le: number }[]>(CLE_CONFLITS)) ?? []
}

export async function effacerConflits(): Promise<void> {
  await ecrireMeta(CLE_CONFLITS, [])
}

export async function synchroniser(): Promise<ResultatSync> {
  const mutations = await fileMutations()
  const depuis = await derniereSync()

  let reponse: Response
  try {
    reponse = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mutations: mutations.map((m) => ({
          id: m.id,
          parcelle_id: m.parcelle_id,
          operation: m.operation,
          charge: m.charge,
          cree_le: m.cree_le,
        })),
        depuis,
      }),
    })
  } catch {
    // Échec réseau : la file reste intacte, ce n'est pas une erreur à afficher.
    return { envoyees: 0, refusees: [], recues: 0, horodatage: depuis, erreur: 'hors-ligne' }
  }

  if (reponse.status === 401 || reponse.status === 403) {
    return { envoyees: 0, refusees: [], recues: 0, horodatage: depuis, erreur: 'session-expiree' }
  }
  if (!reponse.ok) {
    return {
      envoyees: 0,
      refusees: [],
      recues: 0,
      horodatage: depuis,
      erreur: `erreur serveur (${reponse.status})`,
    }
  }

  const data = (await reponse.json()) as {
    resultats: { id: string; parcelle_id: string; etat: 'applique' | 'refuse'; motif?: string }[]
    changements: Parcelle[]
    serveur_le: string
  }

  const refusees: { parcelle_id: string; motif: string }[] = []
  for (const r of data.resultats) {
    if (r.etat === 'applique') {
      await retirerMutation(r.id)
      continue
    }
    const m = mutations.find((x) => x.id === r.id)
    // Une mutation refusée trois fois est abandonnée : la garder
    // indéfiniment bloquerait toute la file derrière elle.
    if (m && m.tentatives >= 2) {
      await retirerMutation(r.id)
      refusees.push({ parcelle_id: r.parcelle_id, motif: r.motif ?? 'refusée' })
    } else {
      await marquerEchec(r.id, r.motif ?? 'refusée')
    }
  }

  const vivantes = data.changements.filter((p) => !p.supprime_le)
  const mortes = data.changements.filter((p) => p.supprime_le)
  if (vivantes.length) await ecrireParcellesLocales(vivantes)
  for (const p of mortes) await supprimerParcelleLocale(p.id)

  await ecrireMeta(CLE_DERNIERE, data.serveur_le)

  if (refusees.length) {
    const anciens = await conflits()
    await ecrireMeta(CLE_CONFLITS, [
      ...anciens,
      ...refusees.map((r) => ({ ...r, le: Date.now() })),
    ])
  }

  return {
    envoyees: data.resultats.filter((r) => r.etat === 'applique').length,
    refusees,
    recues: data.changements.length,
    horodatage: data.serveur_le,
  }
}
