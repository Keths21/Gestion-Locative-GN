'use client'

import { useMemo, useState } from 'react'
import { Check, MapPin, TriangleAlert, X } from 'lucide-react'
import {
  analyserListeCoordonnees,
  anneauVersPolygone,
  formaterDistance,
  formaterSuperficieDetail,
  perimetreGeodesique,
  polygoneEstSimple,
  superficieGeodesique,
  utmVersWgs84,
} from '@/lib/geo'
import type { PolygoneGeoJSON } from '@/types'

/**
 * Création d'une parcelle par saisie de coordonnées.
 *
 * L'UTM n'est pas un raffinement : les titres fonciers guinéens sont
 * couramment bornés en UTM 28N ou 29N, et c'est souvent la seule forme sous
 * laquelle le propriétaire dispose de ses limites.
 */

type Systeme = 'geo' | 'utm'

const EXEMPLE_GEO = `9.535100, -13.677200
9.535600, -13.676500
9.535100, -13.675900
9.534600, -13.676600`

const EXEMPLE_UTM = `645123, 1054210
645198, 1054265
645255, 1054190
645180, 1054135`

export default function OutilCoordonnees({
  onFermer,
  onValider,
}: {
  onFermer: () => void
  onValider: (poly: PolygoneGeoJSON) => void
}) {
  const [systeme, setSysteme] = useState<Systeme>('geo')
  const [ordre, setOrdre] = useState<'lat_lon' | 'lon_lat'>('lat_lon')
  const [zone, setZone] = useState('28')
  const [hemisphere, setHemisphere] = useState<'N' | 'S'>('N')
  const [texte, setTexte] = useState('')

  const analyse = useMemo(() => {
    if (!texte.trim()) return { points: [] as [number, number][], erreurs: [] as string[] }
    if (systeme === 'geo') return analyserListeCoordonnees(texte, ordre)

    const points: [number, number][] = []
    const erreurs: string[] = []
    texte
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((ligne, i) => {
        const n = ligne
          .replace(/,(?=\s*\d)/g, ' ')
          .split(/[;\s]+/)
          .map((x) => Number(x.replace(',', '.')))
          .filter((x) => Number.isFinite(x))
        if (n.length < 2) {
          erreurs.push(`Ligne ${i + 1} illisible : « ${ligne} »`)
          return
        }
        const { lat, lon } = utmVersWgs84(n[0], n[1], Number(zone) || 28, hemisphere)
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          erreurs.push(`Ligne ${i + 1} : résultat hors limites, vérifiez la zone UTM`)
          return
        }
        points.push([lon, lat])
      })
    return { points, erreurs }
  }, [texte, systeme, ordre, zone, hemisphere])

  const polygone = useMemo(() => anneauVersPolygone(analyse.points), [analyse.points])
  const simple = polygone ? polygoneEstSimple(polygone) : true
  const surface = polygone ? superficieGeodesique(polygone) : 0
  const perimetre = polygone ? perimetreGeodesique(polygone) : 0

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Parcelle par coordonnées</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Une ligne par sommet, dans l&apos;ordre du bornage
            </p>
          </div>
          <button
            onClick={onFermer}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(
              [
                ['geo', 'Latitude / Longitude'],
                ['utm', 'UTM (bornage)'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSysteme(k)}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  systeme === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {systeme === 'geo' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Ordre des colonnes
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primaire"
                value={ordre}
                onChange={(e) => setOrdre(e.target.value as 'lat_lon' | 'lon_lat')}
              >
                <option value="lat_lon">Latitude puis longitude</option>
                <option value="lon_lat">Longitude puis latitude</option>
              </select>
              <p className="mt-1.5 text-xs text-gray-500">
                Formats acceptés : décimal (9.5351), DMS (9°32&apos;06.4&quot;N) ou signé (-13.6772).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Zone UTM</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primaire"
                  inputMode="numeric"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-gray-500">Guinée : zone 28 (ouest) ou 29 (est).</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Hémisphère</label>
                <select
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primaire"
                  value={hemisphere}
                  onChange={(e) => setHemisphere(e.target.value as 'N' | 'S')}
                >
                  <option value="N">Nord</option>
                  <option value="S">Sud</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Sommets</label>
              <button
                type="button"
                className="text-xs text-primaire hover:underline"
                onClick={() => setTexte(systeme === 'geo' ? EXEMPLE_GEO : EXEMPLE_UTM)}
              >
                Insérer un exemple
              </button>
            </div>
            <textarea
              className="min-h-44 w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-primaire"
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder={systeme === 'geo' ? EXEMPLE_GEO : EXEMPLE_UTM}
              spellCheck={false}
            />
          </div>

          {analyse.erreurs.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <TriangleAlert size={14} /> {analyse.erreurs.length} ligne(s) ignorée(s)
              </div>
              <ul className="list-inside list-disc space-y-0.5">
                {analyse.erreurs.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <MapPin size={14} />
              {analyse.points.length} sommet(s) reconnu(s)
            </div>
            {polygone && (
              <>
                <div className="mt-2 flex justify-between">
                  <span className="text-gray-500">Superficie</span>
                  <span className="font-semibold text-gray-900">
                    {formaterSuperficieDetail(surface)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-gray-500">Périmètre</span>
                  <span className="text-gray-700">{formaterDistance(perimetre)}</span>
                </div>
                {analyse.points[0] && (
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-gray-500">Premier point</span>
                    <span className="font-mono text-gray-700">
                      {analyse.points[0][1].toFixed(6)}, {analyse.points[0][0].toFixed(6)}
                    </span>
                  </div>
                )}
              </>
            )}
            {!simple && (
              <div className="mt-2 rounded-md bg-red-100 px-2 py-1.5 text-xs text-red-700">
                Le contour se croise lui-même : vérifiez l&apos;ordre des sommets.
              </div>
            )}
          </div>
        </div>

        <footer className="marge-bas-sure shrink-0 border-t border-gray-200 px-5 py-4">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primaire px-4 py-2.5 text-sm font-semibold text-white hover:bg-primaire-appui disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!polygone || !simple}
            onClick={() => polygone && onValider(polygone)}
          >
            <Check size={16} />
            Créer la parcelle
          </button>
        </footer>
      </div>
    </div>
  )
}
