'use client'

import { useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Crosshair,
  Layers,
  MapPin,
  Maximize2,
  PencilRuler,
  Plus,
  Sigma,
  Tag,
  X,
} from 'lucide-react'
import { FournisseurParcelles, useMagasin } from '@/components/parcelles/MagasinParcelles'
import PanneauParcelle from '@/components/parcelles/PanneauParcelle'
import DetailParcelle from '@/components/parcelles/DetailParcelle'
import OutilCoordonnees from '@/components/parcelles/OutilCoordonnees'
import OutilReleveGps from '@/components/parcelles/OutilReleveGps'
import BarreEtatSync from '@/components/parcelles/BarreEtatSync'
import type { PoigneeCarte } from '@/components/parcelles/CarteParcelles'
import { FONDS, type CleFond } from '@/lib/fonds-carte'
import { formaterSuperficie } from '@/lib/geo'
import type { Parcelle, PolygoneGeoJSON } from '@/types'

// Leaflet touche directement au DOM et ne survit pas au rendu serveur.
const CarteParcelles = dynamic(() => import('@/components/parcelles/CarteParcelles'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-500">
      Chargement de la carte…
    </div>
  ),
})

type Outil = null | 'coordonnees' | 'gps'

function Carte() {
  const { parcelles, chargement, creer, modifier, supprimer, message, enLigne } = useMagasin()
  const carte = useRef<PoigneeCarte>(null)

  const [selectionId, setSelectionId] = useState<string | null>(null)
  const [fond, setFond] = useState<CleFond>('satellite')
  const [reperes, setReperes] = useState(true)
  const [etiquettes, setEtiquettes] = useState(true)
  const [couches, setCouches] = useState(false)
  const [menuAjout, setMenuAjout] = useState(false)
  const [outil, setOutil] = useState<Outil>(null)
  const [releve, setReleve] = useState<[number, number][]>([])
  const [position, setPosition] = useState<{ lat: number; lon: number; precision: number } | null>(
    null
  )
  const [mode, setMode] = useState<'navigation' | 'trace' | 'edition'>('navigation')

  const selection = parcelles.find((p) => p.id === selectionId) ?? null

  const creerDepuisTrace = useCallback(
    async (geom: PolygoneGeoJSON, source: Parcelle['source_trace'], precision?: number) => {
      const nouvelle = await creer({
        nom: `Parcelle du ${new Date().toLocaleDateString('fr-FR')}`,
        geom,
        source_trace: source,
        precision_m: precision ?? null,
      })
      setSelectionId(nouvelle.id)
      setOutil(null)
      setReleve([])
    },
    [creer]
  )

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CarteParcelles
        ref={carte}
        parcelles={parcelles}
        selectionId={selectionId}
        fond={fond}
        reperes={reperes}
        etiquettes={etiquettes}
        releve={outil === 'gps' ? releve : null}
        onSelection={setSelectionId}
        onTraceTermine={(geom) => void creerDepuisTrace(geom, 'manuel')}
        onModeChange={setMode}
        onPositionChange={setPosition}
      />

      {/* Bandeau d'état */}
      {(chargement || message || mode !== 'navigation') && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-[1000] flex justify-center px-2">
          <div
            className={`rounded-full px-4 py-1.5 text-xs font-medium shadow-lg ${
              message ? 'bg-red-600 text-white' : 'bg-gray-900/85 text-white'
            }`}
          >
            {message
              ? message
              : chargement
                ? 'Chargement des parcelles…'
                : mode === 'trace'
                  ? 'Cliquez pour poser les sommets, double-clic pour fermer'
                  : 'Déplacez les sommets, puis validez'}
          </div>
        </div>
      )}

      {/* État de la synchronisation */}
      <div className="absolute left-2 top-2 z-[1000] rounded-lg bg-white/95 shadow-lg backdrop-blur">
        <BarreEtatSync />
      </div>

      {/* Contrôles de couches */}
      <div className="absolute right-2 top-16 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => setCouches(!couches)}
          className="rounded-lg bg-white p-2.5 text-gray-700 shadow-lg hover:bg-gray-50"
          aria-label="Fonds de carte"
        >
          <Layers size={18} />
        </button>
        <button
          onClick={() => carte.current?.localiser()}
          className="rounded-lg bg-white p-2.5 text-gray-700 shadow-lg hover:bg-gray-50"
          aria-label="Me localiser"
        >
          <Crosshair size={18} />
        </button>
        <button
          onClick={() => carte.current?.ajusterVue()}
          className="rounded-lg bg-white p-2.5 text-gray-700 shadow-lg hover:bg-gray-50"
          aria-label="Voir tout le portefeuille"
        >
          <Maximize2 size={18} />
        </button>
      </div>

      {couches && (
        <div className="absolute right-14 top-16 z-[1000] w-56 rounded-xl bg-white p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Fond de carte
          </p>
          <div className="flex flex-col gap-1">
            {(Object.keys(FONDS) as CleFond[])
              .filter((k) => k !== 'reperes')
              .map((k) => (
                <button
                  key={k}
                  onClick={() => setFond(k)}
                  className={`rounded-md px-3 py-2 text-left text-sm ${
                    fond === k ? 'bg-primaire-tenue font-semibold text-primaire' : 'hover:bg-gray-50'
                  }`}
                >
                  {FONDS[k].nom}
                </button>
              ))}
          </div>
          <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={reperes}
                onChange={(e) => setReperes(e.target.checked)}
                className="accent-primaire"
              />
              Noms et repères
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={etiquettes}
                onChange={(e) => setEtiquettes(e.target.checked)}
                className="accent-primaire"
              />
              Étiquettes des parcelles
            </label>
          </div>
        </div>
      )}

      {/* Menu d'ajout */}
      <div
        className="absolute right-4 z-[1000] flex flex-col items-end gap-2"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {menuAjout && (
          <>
            <BoutonAjout
              icone={<PencilRuler size={16} />}
              libelle="Tracer sur la carte"
              onClick={() => {
                setMenuAjout(false)
                carte.current?.demarrerTrace()
              }}
            />
            <BoutonAjout
              icone={<Crosshair size={16} />}
              libelle="Relevé GPS en marchant"
              onClick={() => {
                setMenuAjout(false)
                setReleve([])
                setOutil('gps')
              }}
            />
            <BoutonAjout
              icone={<Sigma size={16} />}
              libelle="Saisir des coordonnées"
              onClick={() => {
                setMenuAjout(false)
                setOutil('coordonnees')
              }}
            />
            <BoutonAjout
              icone={<MapPin size={16} />}
              libelle="Poser un repère ici"
              onClick={async () => {
                setMenuAjout(false)
                if (!position) return
                const nouvelle = await creer({
                  nom: `Repère du ${new Date().toLocaleDateString('fr-FR')}`,
                  point_geom: { type: 'Point', coordinates: [position.lon, position.lat] },
                  source_trace: 'coordonnees',
                  precision_m: position.precision,
                })
                setSelectionId(nouvelle.id)
              }}
            />
          </>
        )}
        <button
          onClick={() => setMenuAjout(!menuAjout)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primaire text-white shadow-xl hover:bg-primaire-appui"
          aria-label={menuAjout ? 'Fermer le menu' : 'Ajouter une parcelle'}
        >
          {menuAjout ? <X size={22} /> : <Plus size={22} />}
        </button>
      </div>

      {/* Panneau de la parcelle sélectionnée */}
      {selection && (
        <PanneauParcelle
          key={selection.id}
          titre={selection.nom}
          sousTitre={
            selection.superficie_m2 ? formaterSuperficie(selection.superficie_m2) : 'Sans tracé'
          }
          onFermer={() => setSelectionId(null)}
          actions={
            selection.geom ? (
              <button
                onClick={() => {
                  if (mode === 'edition') {
                    const geom = carte.current?.terminerEdition()
                    if (geom) void modifier(selection.id, { geom })
                  } else {
                    carte.current?.activerEdition(selection.id)
                  }
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label={mode === 'edition' ? 'Valider le tracé' : 'Modifier le tracé'}
              >
                {mode === 'edition' ? <Tag size={18} /> : <PencilRuler size={18} />}
              </button>
            ) : null
          }
        >
          <DetailParcelle
            parcelle={selection}
            enLigne={enLigne}
            position={position ? { lat: position.lat, lon: position.lon } : null}
            onEnregistrer={(champs) => modifier(selection.id, champs)}
            onSupprimer={async () => {
              await supprimer(selection.id)
              setSelectionId(null)
            }}
            onFermer={() => setSelectionId(null)}
          />
        </PanneauParcelle>
      )}

      {outil === 'coordonnees' && (
        <OutilCoordonnees
          onFermer={() => setOutil(null)}
          onValider={(poly) => void creerDepuisTrace(poly, 'coordonnees')}
        />
      )}

      {outil === 'gps' && (
        <OutilReleveGps
          points={releve}
          setPoints={setReleve}
          position={position}
          onFermer={() => {
            setOutil(null)
            setReleve([])
          }}
          onValider={(poly, precision) => void creerDepuisTrace(poly, 'gps_marche', precision)}
        />
      )}
    </div>
  )
}

function BoutonAjout({
  icone,
  libelle,
  onClick,
}: {
  icone: React.ReactNode
  libelle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-lg hover:bg-gray-50"
    >
      <span className="text-primaire">{icone}</span>
      {libelle}
    </button>
  )
}

export default function PageCarte() {
  return (
    <FournisseurParcelles>
      <Carte />
    </FournisseurParcelles>
  )
}
