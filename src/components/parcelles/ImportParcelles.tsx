'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Check,
  FileUp,
  Loader2,
  MapPin,
  Shapes,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { enregistrerParcelle } from '@/lib/parcelles'
import { analyserFichier, LIBELLES_FORMAT, type RapportImport } from '@/lib/import-parcelles'
import { formaterSuperficie } from '@/lib/geo'
import type { EntreeParcelle } from '@/lib/schemas'

/**
 * Import d'un fichier de parcelles fourni par un géomètre ou relevé au GPS.
 *
 * Rien n'est écrit avant confirmation : le fichier est analysé dans le
 * navigateur, l'utilisateur voit exactement ce qui sera créé — géométrie,
 * superficie recalculée, champs reconnus — et ce qui sera écarté, avec la
 * raison. C'est ce qui distingue un import d'un pari.
 */

interface Props {
  onFerme: () => void
  onTermine: (crees: number) => void
}

const EXTENSIONS = '.geojson,.json,.kml,.gpx'

export default function ImportParcelles({ onFerme, onTermine }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const input = useRef<HTMLInputElement>(null)

  const [nomFichier, setNomFichier] = useState<string | null>(null)
  const [rapport, setRapport] = useState<RapportImport | null>(null)
  const [survol, setSurvol] = useState(false)
  const [ecriture, setEcriture] = useState(false)
  const [progression, setProgression] = useState(0)
  const [echecs, setEchecs] = useState<{ nom: string; motif: string }[]>([])

  const lire = useCallback(async (fichier: File) => {
    setEchecs([])
    setNomFichier(fichier.name)
    const contenu = await fichier.text()
    setRapport(analyserFichier(fichier.name, contenu))
  }, [])

  const importer = async () => {
    if (!rapport?.parcelles.length) return
    setEcriture(true)
    setProgression(0)
    const rates: { nom: string; motif: string }[] = []
    let crees = 0

    for (const [i, p] of rapport.parcelles.entries()) {
      try {
        await enregistrerParcelle(supabase, {
          nom: p.nom,
          reference: p.reference,
          type: p.type,
          statut: p.statut,
          statut_juridique: p.statut_juridique,
          description: p.description,
          region: p.region,
          prefecture: p.prefecture,
          commune: p.commune,
          quartier: p.quartier,
          adresse: p.adresse,
          geom: p.geom,
          point_geom: p.point_geom,
          superficie_declaree_m2: p.superficie_declaree_m2,
          prix_achat: p.prix_achat,
          valeur_estimee: p.valeur_estimee,
          date_acquisition: p.date_acquisition,
          proprietaire: p.proprietaire,
          occupant: p.occupant,
          contact_telephone: p.contact_telephone,
          source_trace: p.source_trace,
        } as unknown as EntreeParcelle)
        crees++
      } catch (e) {
        rates.push({ nom: p.nom, motif: e instanceof Error ? e.message : 'erreur inconnue' })
      }
      setProgression(i + 1)
    }

    setEcriture(false)
    setEchecs(rates)
    if (!rates.length) onTermine(crees)
  }

  const total = rapport?.parcelles.length ?? 0
  const avecTrace = rapport?.parcelles.filter((p) => p.geom).length ?? 0
  const superficieTotale = rapport?.parcelles.reduce((s, p) => s + p.superficie_estimee_m2, 0) ?? 0
  const alertes = rapport?.parcelles.filter((p) => p.avertissements.length).length ?? 0

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Importer des parcelles</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Fichier de géomètre ou relevé d&apos;appareil — GeoJSON, KML ou GPX
            </p>
          </div>
          <button
            onClick={onFerme}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <input
            ref={input}
            type="file"
            accept={EXTENSIONS}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void lire(f)
            }}
          />

          {!rapport && (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setSurvol(true)
              }}
              onDragLeave={() => setSurvol(false)}
              onDrop={(e) => {
                e.preventDefault()
                setSurvol(false)
                const f = e.dataTransfer.files?.[0]
                if (f) void lire(f)
              }}
              onClick={() => input.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
                survol ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Upload size={28} className="text-gray-400" />
              <p className="text-sm font-medium text-gray-700">
                Déposez le fichier ici, ou cliquez pour le choisir
              </p>
              <p className="text-xs text-gray-500">
                Un tracé GPX relevé à pied est reconnu comme tel et enregistré en « relevé GPS »
              </p>
            </div>
          )}

          {rapport && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  <FileUp size={13} /> {nomFichier}
                </span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  {LIBELLES_FORMAT[rapport.format]}
                </span>
                <button
                  onClick={() => {
                    setRapport(null)
                    setNomFichier(null)
                    setEchecs([])
                    if (input.current) input.current.value = ''
                  }}
                  className="ml-auto text-xs text-blue-600 hover:underline"
                >
                  Changer de fichier
                </button>
              </div>

              {total > 0 && (
                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-gray-50 px-2 py-3">
                    <div className="text-xl font-semibold text-gray-900">{total}</div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">
                      à importer
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-3">
                    <div className="text-xl font-semibold text-gray-900">{avecTrace}</div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">
                      avec tracé
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-3">
                    <div className="text-xl font-semibold text-gray-900">
                      {formaterSuperficie(superficieTotale)}
                    </div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">
                      superficie
                    </div>
                  </div>
                </div>
              )}

              {alertes > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  <span>
                    {alertes} parcelle(s) présentent une anomalie signalée ci-dessous. Elles seront
                    importées quand même — à vérifier ensuite sur la carte.
                  </span>
                </div>
              )}

              {total > 0 && (
                <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Parcelle</th>
                        <th className="px-3 py-2 font-medium">Forme</th>
                        <th className="px-3 py-2 text-right font-medium">Superficie</th>
                        <th className="px-3 py-2 font-medium">Champs reconnus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rapport.parcelles.map((p, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{p.nom}</div>
                            {p.avertissements.map((a, k) => (
                              <div key={k} className="text-xs text-amber-700">
                                {a}
                              </div>
                            ))}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            <span className="inline-flex items-center gap-1 text-xs">
                              {p.geom ? <Shapes size={13} /> : <MapPin size={13} />}
                              {p.geom ? 'contour' : 'repère'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                            {p.geom ? formaterSuperficie(p.superficie_estimee_m2) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {p.champsDetectes.length ? (
                              <span className="text-xs text-gray-600">
                                {p.champsDetectes.join(', ')}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">nom et tracé seulement</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {rapport.ignores.length > 0 && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {rapport.ignores.length} entrée(s) écartée(s)
                  </p>
                  <ul className="space-y-1 text-xs text-gray-600">
                    {rapport.ignores.slice(0, 8).map((e, i) => (
                      <li key={i}>
                        <span className="font-medium text-gray-800">{e.source}</span> — {e.motif}
                      </li>
                    ))}
                    {rapport.ignores.length > 8 && (
                      <li className="text-gray-400">
                        et {rapport.ignores.length - 8} autre(s)…
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {total === 0 && (
                <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-700">
                  Aucune parcelle exploitable dans ce fichier.
                </p>
              )}

              {echecs.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
                    {echecs.length} refusée(s) par la base
                  </p>
                  <ul className="space-y-1 text-xs text-red-700">
                    {echecs.map((e, i) => (
                      <li key={i}>
                        <span className="font-medium">{e.nom}</span> — {e.motif}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-gray-200 px-5 py-4">
          {ecriture && (
            <span className="text-xs tabular-nums text-gray-500">
              {progression} / {total}
            </span>
          )}
          <button
            onClick={onFerme}
            className="ml-auto rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={importer}
            disabled={!total || ecriture}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ecriture ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {ecriture ? 'Import en cours…' : `Importer ${total || ''} parcelle(s)`}
          </button>
        </footer>
      </div>
    </div>
  )
}
