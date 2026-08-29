'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Crosshair, Pause, Play, RotateCcw, Undo2, X } from 'lucide-react'
import {
  anneauVersPolygone,
  formaterDistance,
  formaterSuperficieDetail,
  perimetreGeodesique,
  polygoneEstSimple,
  superficieGeodesique,
} from '@/lib/geo'
import type { PolygoneGeoJSON } from '@/types'

/**
 * Relevé GPS à la marche : on longe les limites de la parcelle en posant un
 * point à chaque borne. La précision moyenne des relevés est conservée avec
 * la parcelle, car elle conditionne la confiance qu'on peut accorder au tracé.
 */

interface Props {
  points: [number, number][]
  setPoints: (p: [number, number][]) => void
  position: { lat: number; lon: number; precision: number } | null
  onFermer: () => void
  onValider: (poly: PolygoneGeoJSON, precisionMoyenne: number) => void
}

/** Distance approximative en mètres entre deux positions proches. */
function distance(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLon = ((b[0] - a[0]) * Math.PI) / 180
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180)
  const x = dLon * Math.cos(lat)
  return Math.sqrt(x * x + dLat * dLat) * R
}

export default function OutilReleveGps({
  points,
  setPoints,
  position,
  onFermer,
  onValider,
}: Props) {
  const [auto, setAuto] = useState(false)
  const [seuil, setSeuil] = useState(5)
  const precisions = useRef<number[]>([])

  /* Mode automatique : un sommet dès que l'on s'est déplacé de `seuil` mètres. */
  useEffect(() => {
    if (!auto || !position) return
    const p: [number, number] = [position.lon, position.lat]
    const dernier = points[points.length - 1]
    if (!dernier || distance(dernier, p) >= seuil) {
      precisions.current.push(position.precision)
      setPoints([...points, p])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, auto, seuil])

  const ajouter = () => {
    if (!position) return
    precisions.current.push(position.precision)
    setPoints([...points, [position.lon, position.lat]])
    // Retour haptique : sur le terrain on ne regarde pas l'écran en marchant.
    if (navigator.vibrate) navigator.vibrate(30)
  }

  const annulerDernier = () => {
    precisions.current.pop()
    setPoints(points.slice(0, -1))
  }

  const polygone = anneauVersPolygone(points)
  const simple = polygone ? polygoneEstSimple(polygone) : true
  const precisionMoyenne =
    precisions.current.length > 0
      ? precisions.current.reduce((a, b) => a + b, 0) / precisions.current.length
      : (position?.precision ?? 0)

  const qualite = !position
    ? 'inconnue'
    : position.precision <= 5
      ? 'bonne'
      : position.precision <= 15
        ? 'moyenne'
        : 'faible'

  const couleurQualite =
    qualite === 'bonne' ? 'text-succes' : qualite === 'moyenne' ? 'text-alerte' : 'text-danger'

  return (
    <div className="marge-bas-sure pointer-events-auto absolute inset-x-2 bottom-2 z-[1000] rounded-2xl border border-bordure bg-surface/97 p-3 shadow-2xl backdrop-blur sm:inset-x-auto sm:left-4 sm:w-96">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-texte">Relevé GPS sur le terrain</h3>
          <p className="text-xs text-texte-doux">
            Marchez le long des limites et posez un point à chaque borne.
          </p>
        </div>
        <button
          onClick={onFermer}
          className="rounded-lg p-1.5 text-texte-faible hover:bg-surface-appuyee"
          aria-label="Fermer"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-appuyee px-2 py-2">
          <div className="text-lg font-semibold text-texte">{points.length}</div>
          <div className="text-[10px] uppercase tracking-wide text-texte-doux">Sommets</div>
        </div>
        <div className="rounded-lg bg-surface-appuyee px-2 py-2">
          <div className="text-lg font-semibold text-texte">
            {position ? `±${Math.round(position.precision)} m` : '—'}
          </div>
          <div className={`text-[10px] uppercase tracking-wide ${couleurQualite}`}>
            Précision {qualite}
          </div>
        </div>
        <div className="rounded-lg bg-surface-appuyee px-2 py-2">
          <div className="text-lg font-semibold text-texte">
            {polygone
              ? formaterSuperficieDetail(superficieGeodesique(polygone)).split(' · ')[0]
              : '—'}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-texte-doux">Superficie</div>
        </div>
      </div>

      {polygone && (
        <div className="mb-3 flex justify-between rounded-lg bg-surface-appuyee px-3 py-2 text-xs">
          <span className="text-texte-doux">Périmètre parcouru</span>
          <span className="text-texte">{formaterDistance(perimetreGeodesique(polygone))}</span>
        </div>
      )}

      {!simple && (
        <div className="mb-3 rounded-lg bg-danger-tenue px-3 py-2 text-xs text-danger">
          Le contour se croise. Supprimez le dernier point ou reprenez le relevé.
        </div>
      )}

      <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-appuyee px-3 py-2">
        <button
          onClick={() => setAuto(!auto)}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
            auto ? 'bg-succes text-white' : 'bg-surface text-texte shadow-carte'
          }`}
        >
          {auto ? <Pause size={13} /> : <Play size={13} />}
          {auto ? 'Auto activé' : 'Mode auto'}
        </button>
        <label className="flex flex-1 items-center gap-2 text-xs text-texte-doux">
          tous les
          <input
            type="range"
            min={2}
            max={30}
            step={1}
            value={seuil}
            onChange={(e) => setSeuil(Number(e.target.value))}
            className="flex-1 accent-primaire"
          />
          <span className="w-9 text-right text-texte">{seuil} m</span>
        </label>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-primaire px-3 py-2.5 text-sm font-semibold text-white hover:bg-primaire-appui disabled:opacity-40"
          onClick={ajouter}
          disabled={!position}
          title={position ? undefined : 'Position GPS indisponible'}
        >
          <Crosshair size={16} /> Poser un point
        </button>
        <button
          className="flex items-center justify-center rounded-lg border border-bordure-forte px-3 py-2.5 text-texte hover:bg-surface-appuyee disabled:opacity-40"
          onClick={annulerDernier}
          disabled={!points.length}
          aria-label="Annuler le dernier point"
        >
          <Undo2 size={16} />
        </button>
        <button
          className="flex items-center justify-center rounded-lg border border-bordure-forte px-3 py-2.5 text-texte hover:bg-surface-appuyee disabled:opacity-40"
          onClick={() => {
            precisions.current = []
            setPoints([])
          }}
          disabled={!points.length}
          aria-label="Tout effacer"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <button
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primaire px-4 py-2.5 text-sm font-semibold text-white hover:bg-primaire-appui disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!polygone || !simple}
        onClick={() => polygone && onValider(polygone, precisionMoyenne)}
      >
        <Check size={16} /> Fermer le contour et enregistrer
      </button>
    </div>
  )
}
