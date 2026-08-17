'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  enregistrerParcelle,
  listerParcelles,
  supprimerParcelle as supprimerEnBase,
} from '@/lib/parcelles'
import { perimetreGeodesique, superficieGeodesique } from '@/lib/geo'
import type { Parcelle } from '@/types'
import type { EntreeParcelle } from '@/lib/schemas'

/**
 * Magasin des parcelles.
 *
 * Transposition de MagasinBiens.tsx. L'interface publique est délibérément
 * conservée à l'identique alors que la persistance change : ici les écritures
 * partent directement vers Supabase, là où l'original passait par IndexedDB
 * puis une file de mutations.
 *
 * Le lot 5 réinsérera cette file *sous* la même interface — IndexedDB en
 * lecture immédiate, file en écriture, synchronisation opportuniste — sans
 * qu'aucun composant consommateur ait à changer. C'est la raison d'être de
 * `enLigne`, `syncEnCours` et `enAttente`, qui existent déjà ici alors qu'ils
 * ne servent pas encore pleinement.
 */

export interface EntreeParcelleUI extends Partial<Omit<Parcelle, 'id'>> {
  nom: string
}

interface Magasin {
  parcelles: Parcelle[]
  chargement: boolean
  enLigne: boolean
  syncEnCours: boolean
  enAttente: number
  message: string | null
  creer: (entree: EntreeParcelleUI) => Promise<Parcelle>
  modifier: (id: string, champs: Partial<Parcelle>) => Promise<void>
  supprimer: (id: string) => Promise<void>
  recharger: () => Promise<void>
}

const Ctx = createContext<Magasin | null>(null)

export function useMagasin(): Magasin {
  const c = useContext(Ctx)
  if (!c) throw new Error('useMagasin doit être utilisé dans <FournisseurParcelles>')
  return c
}

/** Champs acceptés en écriture : exclut tout ce que la base calcule elle-même. */
function chargeUtile(p: Partial<Parcelle>): Record<string, unknown> {
  return {
    bien_id: p.bien_id ?? null,
    nom: p.nom,
    reference: p.reference ?? null,
    type: p.type ?? 'terrain_nu',
    statut: p.statut ?? 'possede',
    statut_juridique: p.statut_juridique ?? 'inconnu',
    description: p.description ?? null,
    pays: p.pays ?? 'Guinée',
    region: p.region ?? null,
    prefecture: p.prefecture ?? null,
    commune: p.commune ?? null,
    quartier: p.quartier ?? null,
    adresse: p.adresse ?? null,
    geom: p.geom ?? null,
    // Une parcelle tracée dérive son repère du polygone : l'envoyer en plus
    // serait redondant et pourrait contredire ST_PointOnSurface.
    point_geom: p.geom ? null : (p.point_geom ?? null),
    superficie_declaree_m2: p.superficie_declaree_m2 ?? null,
    prix_achat: p.prix_achat ?? null,
    valeur_estimee: p.valeur_estimee ?? null,
    devise: p.devise ?? 'GNF',
    date_acquisition: p.date_acquisition ?? null,
    proprietaire: p.proprietaire ?? null,
    occupant: p.occupant ?? null,
    contact_telephone: p.contact_telephone ?? null,
    couleur: p.couleur ?? '#f59e0b',
    tags: p.tags ?? [],
    source_trace: p.source_trace ?? 'manuel',
    precision_m: p.precision_m ?? null,
  }
}

/**
 * Métriques provisoires calculées côté client, le temps que la base réponde.
 * Elles font foi à l'affichage seulement : la valeur de référence est celle
 * que renvoie PostGIS.
 */
function avecMetriques(p: Parcelle): Parcelle {
  if (!p.geom) return { ...p, superficie_m2: null, perimetre_m: null }
  return {
    ...p,
    superficie_m2: superficieGeodesique(p.geom),
    perimetre_m: perimetreGeodesique(p.geom),
  }
}

const trierParNom = (a: Parcelle, b: Parcelle) => a.nom.localeCompare(b.nom, 'fr')

export function FournisseurParcelles({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [parcelles, setParcelles] = useState<Parcelle[]>([])
  const [chargement, setChargement] = useState(true)
  const [enLigne, setEnLigne] = useState(true)
  const [syncEnCours, setSyncEnCours] = useState(false)
  const [enAttente] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  const recharger = useCallback(async () => {
    setSyncEnCours(true)
    try {
      const liste = await listerParcelles(supabase)
      setParcelles(liste.sort(trierParNom))
      setMessage(null)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setSyncEnCours(false)
      setChargement(false)
    }
  }, [supabase])

  useEffect(() => {
    void recharger()
  }, [recharger])

  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine)
    maj()
    window.addEventListener('online', maj)
    window.addEventListener('offline', maj)
    return () => {
      window.removeEventListener('online', maj)
      window.removeEventListener('offline', maj)
    }
  }, [])

  const creer = useCallback(
    async (entree: EntreeParcelleUI): Promise<Parcelle> => {
      const cree = await enregistrerParcelle(
        supabase,
        chargeUtile(entree as Partial<Parcelle>) as unknown as EntreeParcelle
      )
      setParcelles((l) => [...l, cree].sort(trierParNom))
      return cree
    },
    [supabase]
  )

  const modifier = useCallback(
    async (id: string, champs: Partial<Parcelle>) => {
      const actuel = parcelles.find((p) => p.id === id)
      if (!actuel) return

      const fusion = avecMetriques({ ...actuel, ...champs })
      // Affichage optimiste : la carte se met à jour sans attendre l'aller-retour.
      setParcelles((l) => l.map((p) => (p.id === id ? fusion : p)).sort(trierParNom))

      try {
        const maj = await enregistrerParcelle(
          supabase,
          { ...chargeUtile(fusion), id } as unknown as EntreeParcelle
        )
        setParcelles((l) => l.map((p) => (p.id === id ? maj : p)).sort(trierParNom))
      } catch (e) {
        // Rollback : on remet ce que la base connaît.
        setParcelles((l) => l.map((p) => (p.id === id ? actuel : p)).sort(trierParNom))
        setMessage(e instanceof Error ? e.message : 'Modification refusée')
        throw e
      }
    },
    [parcelles, supabase]
  )

  const supprimer = useCallback(
    async (id: string) => {
      const avant = parcelles
      setParcelles((l) => l.filter((p) => p.id !== id))
      try {
        await supprimerEnBase(supabase, id)
      } catch (e) {
        setParcelles(avant)
        setMessage(e instanceof Error ? e.message : 'Suppression refusée')
        throw e
      }
    },
    [parcelles, supabase]
  )

  const valeur = useMemo<Magasin>(
    () => ({
      parcelles,
      chargement,
      enLigne,
      syncEnCours,
      enAttente,
      message,
      creer,
      modifier,
      supprimer,
      recharger,
    }),
    [
      parcelles,
      chargement,
      enLigne,
      syncEnCours,
      enAttente,
      message,
      creer,
      modifier,
      supprimer,
      recharger,
    ]
  )

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>
}
