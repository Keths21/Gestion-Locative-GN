'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { perimetreGeodesique, superficieGeodesique } from '@/lib/geo'
import {
  ecrireParcelleLocale,
  empiler,
  fileMutations,
  lireParcellesLocales,
  nouvelleMutation,
  supprimerParcelleLocale,
} from '@/lib/offline/idb'
import { ecrireMeta, lireMeta } from '@/lib/offline/idb'
import { derniereSync, synchroniser } from '@/lib/offline/sync'
import { createClient } from '@/lib/supabase'
import type { Parcelle } from '@/types'

/**
 * Magasin des parcelles, local d'abord.
 *
 * Toute lecture vient d'IndexedDB, toute écriture y va d'abord puis rejoint
 * une file rejouée dès que le réseau revient. Conséquence recherchée :
 * l'application reste entièrement utilisable sans connexion **et sans jeton
 * valide** — c'est le point qui compte sur le terrain, la session Supabase
 * expirant en une heure alors qu'une tournée dure la journée.
 *
 * L'interface publique est celle que consommaient déjà la carte et la liste :
 * le passage au hors-ligne n'a demandé aucune modification des composants.
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
  derniereSyncLe: string | null
  message: string | null
  sessionExpiree: boolean
  creer: (entree: EntreeParcelleUI) => Promise<Parcelle>
  modifier: (id: string, champs: Partial<Parcelle>) => Promise<void>
  supprimer: (id: string) => Promise<void>
  recharger: () => Promise<void>
  synchroniserMaintenant: () => Promise<void>
}

const Ctx = createContext<Magasin | null>(null)

export function useMagasin(): Magasin {
  const c = useContext(Ctx)
  if (!c) throw new Error('useMagasin doit être utilisé dans <FournisseurParcelles>')
  return c
}

const DEFAUTS: Omit<Parcelle, 'id' | 'nom' | 'organisation_id'> = {
  bien_id: null,
  reference: null,
  type: 'terrain_nu',
  statut: 'possede',
  statut_juridique: 'inconnu',
  description: null,
  pays: 'Guinée',
  region: null,
  prefecture: null,
  commune: null,
  quartier: null,
  adresse: null,
  geom: null,
  point_geom: null,
  superficie_m2: null,
  perimetre_m: null,
  superficie_declaree_m2: null,
  prix_achat: null,
  valeur_estimee: null,
  devise: 'GNF',
  date_acquisition: null,
  proprietaire: null,
  occupant: null,
  contact_telephone: null,
  couleur: '#f59e0b',
  tags: [],
  source_trace: 'manuel',
  precision_m: null,
  cree_par: null,
  cree_le: '',
  modifie_le: '',
  supprime_le: null,
  version: 1,
}

/** Champs acceptés en écriture : exclut tout ce que la base calcule elle-même. */
function chargeUtile(p: Parcelle): Partial<Parcelle> {
  return {
    bien_id: p.bien_id,
    nom: p.nom,
    reference: p.reference,
    type: p.type,
    statut: p.statut,
    statut_juridique: p.statut_juridique,
    description: p.description,
    pays: p.pays,
    region: p.region,
    prefecture: p.prefecture,
    commune: p.commune,
    quartier: p.quartier,
    adresse: p.adresse,
    geom: p.geom,
    // Une parcelle tracée dérive son repère du polygone : l'envoyer en plus
    // contredirait ST_PointOnSurface.
    point_geom: p.geom ? null : p.point_geom,
    superficie_declaree_m2: p.superficie_declaree_m2,
    prix_achat: p.prix_achat,
    valeur_estimee: p.valeur_estimee,
    devise: p.devise,
    date_acquisition: p.date_acquisition,
    proprietaire: p.proprietaire,
    occupant: p.occupant,
    contact_telephone: p.contact_telephone,
    couleur: p.couleur,
    tags: p.tags,
    source_trace: p.source_trace,
    precision_m: p.precision_m,
  }
}

/**
 * Reproduit localement ce que PostGIS calculera. Ces valeurs servent à
 * l'affichage immédiat ; celles qui font foi arrivent à la synchronisation.
 */
function avecMetriques(p: Parcelle): Parcelle {
  if (!p.geom) return { ...p, superficie_m2: null, perimetre_m: null }
  const anneau = p.geom.coordinates[0]
  let sx = 0
  let sy = 0
  const n = Math.max(1, anneau.length - 1)
  for (let i = 0; i < n; i++) {
    sx += anneau[i][0]
    sy += anneau[i][1]
  }
  return {
    ...p,
    superficie_m2: superficieGeodesique(p.geom),
    perimetre_m: perimetreGeodesique(p.geom),
    // Approximation du repère en attendant ST_PointOnSurface.
    point_geom: { type: 'Point', coordinates: [sx / n, sy / n] },
  }
}

const trierParNom = (a: Parcelle, b: Parcelle) => a.nom.localeCompare(b.nom, 'fr')

const CLE_ORG = 'organisation_id'

export function FournisseurParcelles({ children }: { children: React.ReactNode }) {
  const [organisationId, setOrganisationId] = useState<string | null>(null)
  const [parcelles, setParcelles] = useState<Parcelle[]>([])
  const [chargement, setChargement] = useState(true)
  const [enLigne, setEnLigne] = useState(true)
  const [syncEnCours, setSyncEnCours] = useState(false)
  const [enAttente, setEnAttente] = useState(0)
  const [derniereSyncLe, setDerniereSyncLe] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [sessionExpiree, setSessionExpiree] = useState(false)
  const enCours = useRef(false)

  const recharger = useCallback(async () => {
    const [locales, file, date] = await Promise.all([
      lireParcellesLocales(),
      fileMutations(),
      derniereSync(),
    ])
    setParcelles(locales.sort(trierParNom))
    setEnAttente(file.length)
    setDerniereSyncLe(date)
  }, [])

  const synchroniserMaintenant = useCallback(async () => {
    if (enCours.current) return
    enCours.current = true
    setSyncEnCours(true)
    try {
      const r = await synchroniser()
      if (r.erreur === 'hors-ligne') {
        setMessage(null)
      } else if (r.erreur === 'session-expiree') {
        setSessionExpiree(true)
        setMessage('Session expirée — reconnectez-vous pour envoyer vos relevés.')
      } else if (r.erreur) {
        setMessage(`Synchronisation impossible : ${r.erreur}`)
      } else {
        setSessionExpiree(false)
        setMessage(
          r.refusees.length
            ? `${r.refusees.length} modification(s) refusée(s) par le serveur`
            : null
        )
      }
      await recharger()
    } finally {
      enCours.current = false
      setSyncEnCours(false)
    }
  }, [recharger])

  /*
   * Organisation de rattachement : lue une fois puis conservée localement.
   * Une parcelle créée hors connexion doit porter son organisation dès sa
   * création — le déclencheur serveur ne pourra pas la deviner, la mutation
   * étant rejouée bien plus tard.
   */
  useEffect(() => {
    let vivant = true
    ;(async () => {
      const memorise = await lireMeta<string>(CLE_ORG)
      if (memorise && vivant) setOrganisationId(memorise)
      if (!navigator.onLine) return

      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('membres')
          .select('organisation_id')
          .eq('user_id', user.id)
          .order('cree_le', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (data?.organisation_id && vivant) {
          setOrganisationId(data.organisation_id)
          await ecrireMeta(CLE_ORG, data.organisation_id)
        }
      } catch {
        /* réseau capricieux : la valeur mémorisée fait l'affaire */
      }
    })()
    return () => {
      vivant = false
    }
  }, [])

  /* Démarrage : IndexedDB d'abord — instantané et sans réseau — puis synchro. */
  useEffect(() => {
    let vivant = true
    ;(async () => {
      await recharger()
      if (!vivant) return
      setChargement(false)
      if (navigator.onLine) await synchroniserMaintenant()
    })()
    return () => {
      vivant = false
    }
  }, [recharger, synchroniserMaintenant])

  /* Connectivité : on rattrape dès le retour du réseau. */
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine)
    maj()

    const auRetour = () => {
      setEnLigne(true)
      void synchroniserMaintenant()
    }
    const aLaPerte = () => setEnLigne(false)
    const auFocus = () => {
      if (navigator.onLine) void synchroniserMaintenant()
    }

    window.addEventListener('online', auRetour)
    window.addEventListener('offline', aLaPerte)
    window.addEventListener('focus', auFocus)
    const minuteur = window.setInterval(() => {
      if (navigator.onLine) void synchroniserMaintenant()
    }, 120_000)

    return () => {
      window.removeEventListener('online', auRetour)
      window.removeEventListener('offline', aLaPerte)
      window.removeEventListener('focus', auFocus)
      window.clearInterval(minuteur)
    }
  }, [synchroniserMaintenant])

  const creer = useCallback(
    async (entree: EntreeParcelleUI): Promise<Parcelle> => {
      const maintenant = new Date().toISOString()
      // L'identifiant est généré ici : c'est ce qui permet de créer hors
      // connexion sans risque de collision, la RPC serveur étant idempotente.
      const parcelle = avecMetriques({
        ...DEFAUTS,
        ...entree,
        organisation_id: organisationId ?? '',
        id: crypto.randomUUID(),
        cree_le: maintenant,
        modifie_le: maintenant,
      } as Parcelle)

      await ecrireParcelleLocale(parcelle)
      await empiler(nouvelleMutation(parcelle.id, 'creation', chargeUtile(parcelle)))
      setParcelles((l) => [...l, parcelle].sort(trierParNom))
      setEnAttente((n) => n + 1)
      if (navigator.onLine) void synchroniserMaintenant()
      return parcelle
    },
    [organisationId, synchroniserMaintenant]
  )

  const modifier = useCallback(
    async (id: string, champs: Partial<Parcelle>) => {
      const actuelle = parcelles.find((p) => p.id === id)
      if (!actuelle) return
      const maj = avecMetriques({
        ...actuelle,
        ...champs,
        modifie_le: new Date().toISOString(),
      })

      await ecrireParcelleLocale(maj)
      await empiler(nouvelleMutation(id, 'modification', chargeUtile(maj)))
      setParcelles((l) => l.map((p) => (p.id === id ? maj : p)).sort(trierParNom))
      setEnAttente((n) => n + 1)
      if (navigator.onLine) void synchroniserMaintenant()
    },
    [parcelles, synchroniserMaintenant]
  )

  const supprimer = useCallback(
    async (id: string) => {
      await supprimerParcelleLocale(id)
      await empiler(nouvelleMutation(id, 'suppression', {}))
      setParcelles((l) => l.filter((p) => p.id !== id))
      setEnAttente((n) => n + 1)
      if (navigator.onLine) void synchroniserMaintenant()
    },
    [synchroniserMaintenant]
  )

  const valeur = useMemo<Magasin>(
    () => ({
      parcelles,
      chargement,
      enLigne,
      syncEnCours,
      enAttente,
      derniereSyncLe,
      message,
      sessionExpiree,
      creer,
      modifier,
      supprimer,
      recharger,
      synchroniserMaintenant,
    }),
    [
      parcelles,
      chargement,
      enLigne,
      syncEnCours,
      enAttente,
      derniereSyncLe,
      message,
      sessionExpiree,
      creer,
      modifier,
      supprimer,
      recharger,
      synchroniserMaintenant,
    ]
  )

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>
}
