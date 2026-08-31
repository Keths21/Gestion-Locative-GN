'use client'

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Parcelle } from '@/types'

/**
 * Cache local des parcelles et file d'écritures en attente.
 *
 * C'est ce qui permet à l'application de démarrer et de rester utilisable
 * sans réseau : la lecture ne dépend jamais d'un jeton valide ni d'une
 * connexion, seulement de ce qui a été rapatrié la dernière fois.
 */

/** Une écriture faite hors connexion, en attente de remontée. */
export interface MutationEnAttente {
  id: string
  parcelle_id: string
  operation: 'creation' | 'modification' | 'suppression'
  charge: Partial<Parcelle>
  cree_le: number
  tentatives: number
  derniere_erreur?: string
}

export interface ZoneHorsLigne {
  id: string
  nom: string
  bbox: [number, number, number, number]
  zoomMin: number
  zoomMax: number
  tuiles: number
  octets: number
  cree_le: number
}

interface SchemaLocal extends DBSchema {
  parcelles: {
    key: string
    value: Parcelle
    indexes: { 'par-modification': string }
  }
  mutations: { key: string; value: MutationEnAttente }
  meta: { key: string; value: { cle: string; valeur: unknown } }
  zones: { key: string; value: ZoneHorsLigne }
}

let instance: Promise<IDBPDatabase<SchemaLocal>> | null = null

export function bd(): Promise<IDBPDatabase<SchemaLocal>> {
  if (!instance) {
    instance = openDB<SchemaLocal>('casa-chams-parcelles', 1, {
      upgrade(db) {
        const parcelles = db.createObjectStore('parcelles', { keyPath: 'id' })
        parcelles.createIndex('par-modification', 'modifie_le')
        db.createObjectStore('mutations', { keyPath: 'id' })
        db.createObjectStore('meta', { keyPath: 'cle' })
        db.createObjectStore('zones', { keyPath: 'id' })
      },
    })
  }
  return instance
}

/* ------------------------------- parcelles ------------------------------- */

export async function lireParcellesLocales(): Promise<Parcelle[]> {
  const db = await bd()
  const toutes = await db.getAll('parcelles')
  return toutes.filter((p) => !p.supprime_le)
}

export async function ecrireParcellesLocales(parcelles: Parcelle[]): Promise<void> {
  const db = await bd()
  const tx = db.transaction('parcelles', 'readwrite')
  await Promise.all(parcelles.map((p) => tx.store.put(p)))
  await tx.done
}

export async function ecrireParcelleLocale(parcelle: Parcelle): Promise<void> {
  const db = await bd()
  await db.put('parcelles', parcelle)
}

export async function supprimerParcelleLocale(id: string): Promise<void> {
  const db = await bd()
  await db.delete('parcelles', id)
}

/* ------------------------------- mutations ------------------------------- */

export async function empiler(m: MutationEnAttente): Promise<void> {
  const db = await bd()
  await db.put('mutations', m)
}

/** Ordre chronologique : rejouer dans le désordre réécrirait le passé. */
export async function fileMutations(): Promise<MutationEnAttente[]> {
  const db = await bd()
  const tout = await db.getAll('mutations')
  return tout.sort((a, b) => a.cree_le - b.cree_le)
}

export async function retirerMutation(id: string): Promise<void> {
  const db = await bd()
  await db.delete('mutations', id)
}

export async function marquerEchec(id: string, motif: string): Promise<void> {
  const db = await bd()
  const m = await db.get('mutations', id)
  if (!m) return
  m.tentatives += 1
  m.derniere_erreur = motif
  await db.put('mutations', m)
}

export function nouvelleMutation(
  parcelleId: string,
  operation: MutationEnAttente['operation'],
  charge: Partial<Parcelle>
): MutationEnAttente {
  return {
    id: crypto.randomUUID(),
    parcelle_id: parcelleId,
    operation,
    charge,
    cree_le: Date.now(),
    tentatives: 0,
  }
}

/* --------------------------------- meta ---------------------------------- */

export async function lireMeta<T>(cle: string): Promise<T | null> {
  const db = await bd()
  const e = await db.get('meta', cle)
  return (e?.valeur as T) ?? null
}

export async function ecrireMeta(cle: string, valeur: unknown): Promise<void> {
  const db = await bd()
  await db.put('meta', { cle, valeur })
}

/* --------------------------------- zones --------------------------------- */

export async function listerZones(): Promise<ZoneHorsLigne[]> {
  const db = await bd()
  return db.getAll('zones')
}

export async function enregistrerZone(z: ZoneHorsLigne): Promise<void> {
  const db = await bd()
  await db.put('zones', z)
}

export async function oublierZone(id: string): Promise<void> {
  const db = await bd()
  await db.delete('zones', id)
}

/**
 * Clé du compte propriétaire du magasin local.
 *
 * Le magasin IndexedDB appartient au NAVIGATEUR, pas à la session : il survit à
 * la déconnexion. Sans cette garde, un second compte ouvert sur le même appareil
 * lit les parcelles du premier — la RLS ne peut rien pour lui, elle protège la
 * base, pas le disque du client.
 */
const CLE_COMPTE = 'compte'

/**
 * Purge le magasin local si le compte a changé depuis la dernière fois.
 *
 * À appeler dès qu'une session est connue, AVANT toute lecture locale. On ne se
 * repose pas sur la seule déconnexion : une session peut expirer, ou un
 * utilisateur se connecter directement sur un autre compte sans jamais passer
 * par le bouton. Comparer le propriétaire enregistré couvre tous ces chemins.
 *
 * Renvoie true si une purge a eu lieu, pour que l'appelant puisse resynchroniser.
 */
export async function garantirCompte(userId: string): Promise<boolean> {
  const precedent = await lireMeta<string>(CLE_COMPTE)
  if (precedent === userId) return false

  // Premier passage : rien à purger, on note simplement le propriétaire.
  if (precedent !== null) await viderTout()

  // viderTout() efface aussi `meta` : on réécrit après, jamais avant.
  await ecrireMeta(CLE_COMPTE, userId)
  return precedent !== null
}

/**
 * Purge complète : à réserver au changement de compte.
 *
 * IndexedDB n'est pas le seul magasin à survivre à la session : le service
 * worker garde aussi les réponses des routes /api/ (réseau d'abord, repli sur
 * le cache). Hors ligne, ce repli servirait les données du compte précédent.
 * Les deux se vident donc ensemble, sans quoi la fuite se déplace simplement
 * d'un magasin à l'autre.
 */
export async function viderTout(): Promise<void> {
  const db = await bd()
  await Promise.all([
    db.clear('parcelles'),
    db.clear('mutations'),
    db.clear('meta'),
    db.clear('zones'),
  ])

  // Le nom du cache porte la version du worker : on efface par préfixe plutôt
  // que par nom exact, pour ne pas laisser derrière soi celui d'une version
  // précédente encore installée sur l'appareil.
  if (typeof caches !== 'undefined') {
    try {
      const noms = await caches.keys()
      await Promise.all(
        noms.filter((n) => n.startsWith('casachams-api')).map((n) => caches.delete(n))
      )
    } catch {
      // Un navigateur qui refuse l'accès au cache ne doit pas empêcher la
      // déconnexion : la purge IndexedDB, elle, a déjà eu lieu.
    }
  }
}
