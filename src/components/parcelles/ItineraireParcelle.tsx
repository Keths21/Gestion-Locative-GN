'use client'

import { useState } from 'react'
import { Check, Copy, Signpost } from 'lucide-react'
import { versDMS } from '@/lib/geo'
import type { Parcelle } from '@/types'

/**
 * Se rendre sur une parcelle.
 *
 * La destination est `point_geom`, calculé en base par ST_PointOnSurface :
 * ce point est garanti *à l'intérieur* du polygone, y compris sur une
 * parcelle concave ou en L. Un centroïde, lui, peut tomber dehors — et
 * envoyer le conducteur chez le voisin.
 *
 * Le bouton « copier » n'est pas un ornement : en Guinée, l'adresse postale
 * ne mène nulle part, et des coordonnées transmises par messagerie sont la
 * façon habituelle d'envoyer quelqu'un sur place.
 */
export default function ItineraireParcelle({ parcelle }: { parcelle: Parcelle }) {
  const [copie, setCopie] = useState(false)

  const centre = parcelle.point_geom?.coordinates ?? null
  if (!centre) return null

  const [lon, lat] = centre
  const couple = `${lat.toFixed(6)}, ${lon.toFixed(6)}`

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(couple)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      /* Presse-papiers refusé : les coordonnées restent lisibles à l'écran. */
    }
  }

  return (
    <div className="mb-5 rounded-lg border border-bordure bg-surface-appuyee p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-texte-doux">
          S&apos;y rendre
        </span>
        <span className="font-mono text-xs text-texte-doux">
          {versDMS(lat, 'lat')} {versDMS(lon, 'lon')}
        </span>
      </div>

      <div className="flex gap-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primaire px-3 py-2 text-sm font-semibold text-white hover:bg-primaire-appui"
        >
          <Signpost size={15} /> Itinéraire
        </a>
        <button
          type="button"
          onClick={copier}
          className="flex items-center justify-center gap-2 rounded-lg border border-bordure-forte bg-surface px-3 py-2 text-sm text-texte hover:bg-surface-appuyee"
          title="Copier les coordonnées pour les envoyer par message"
        >
          {copie ? <Check size={15} className="text-succes" /> : <Copy size={15} />}
          {copie ? 'Copié' : couple}
        </button>
      </div>
    </div>
  )
}
