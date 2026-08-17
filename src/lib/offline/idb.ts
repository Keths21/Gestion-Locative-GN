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

/** Purge complète : à réserver au changement de compte. */
export async function viderTout(): Promise<void> {
  const db = await bd()
  await Promise.all([
    db.clear('parcelles'),
    db.clear('mutations'),
    db.clear('meta'),
    db.clear('zones'),
  ])
}
