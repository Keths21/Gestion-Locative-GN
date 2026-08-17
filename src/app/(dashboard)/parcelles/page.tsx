'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Download, Link2, Map, Search, TriangleAlert, Upload, X } from 'lucide-react'
import { FournisseurParcelles, useMagasin } from '@/components/parcelles/MagasinParcelles'
import ImportParcelles from '@/components/parcelles/ImportParcelles'
import DetailParcelle from '@/components/parcelles/DetailParcelle'
import { formaterSuperficie } from '@/lib/geo'
import { formatMontant } from '@/lib/utils'
import {
  LIBELLES_JURIDIQUE,
  LIBELLES_STATUT_PARCELLE,
  LIBELLES_TYPE_PARCELLE,
} from '@/lib/constants'
import type { StatutParcelle } from '@/types'

const couleursStatut: Record<StatutParcelle, string> = {
  possede: 'bg-green-100 text-green-700',
  en_vente: 'bg-amber-100 text-amber-700',
  vendu: 'bg-gray-100 text-gray-600',
  loue: 'bg-blue-100 text-blue-700',
  reserve: 'bg-purple-100 text-purple-700',
  prospect: 'bg-gray-100 text-gray-600',
}

function Liste() {
  const { parcelles, chargement, recharger, modifier, supprimer, enLigne } = useMagasin()
  const [recherche, setRecherche] = useState('')
  const [statut, setStatut] = useState('')
  const [importOuvert, setImportOuvert] = useState(false)
  const [messageImport, setMessageImport] = useState<string | null>(null)
  const [selectionId, setSelectionId] = useState<string | null>(null)

  const selection = parcelles.find((p) => p.id === selectionId) ?? null

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return parcelles.filter((p) => {
      if (statut && p.statut !== statut) return false
      if (!q) return true
      return [p.nom, p.reference, p.commune, p.quartier, p.proprietaire]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    })
  }, [parcelles, recherche, statut])

  const total = useMemo(
    () => filtrees.reduce((s, p) => s + (p.superficie_m2 ?? 0), 0),
    [filtrees]
  )
  const sansTrace = filtrees.filter((p) => !p.geom).length

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parcelles</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtrees.length} parcelle(s) · {formaterSuperficie(total)} au total
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportOuvert(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Upload size={16} /> Importer
          </button>
          <a
            href="/api/export?format=geojson"
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download size={16} /> Exporter
          </a>
          <Link
            href="/carte"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Map size={16} /> Ouvrir la carte
          </Link>
        </div>
      </div>

      {messageImport && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <Upload size={16} className="shrink-0" />
          {messageImport}
        </div>
      )}

      {selection && (
        <>
          <div
            className="fixed inset-0 z-[1500] bg-black/30"
            onClick={() => setSelectionId(null)}
            aria-hidden
          />
          <aside
            key={selection.id}
            className="fixed inset-y-0 right-0 z-[1600] flex w-full max-w-lg flex-col bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">{selection.nom}</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {selection.superficie_m2
                    ? formaterSuperficie(selection.superficie_m2)
                    : 'Sans tracé'}
                  {selection.reference ? ` · ${selection.reference}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href="/carte"
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  title="Voir sur la carte"
                >
                  <Map size={18} />
                </Link>
                <button
                  onClick={() => setSelectionId(null)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <DetailParcelle
                parcelle={selection}
                enLigne={enLigne}
                position={null}
                onEnregistrer={(champs) => modifier(selection.id, champs)}
                onSupprimer={async () => {
                  await supprimer(selection.id)
                  setSelectionId(null)
                }}
                onFermer={() => setSelectionId(null)}
              />
            </div>
          </aside>
        </>
      )}

      {importOuvert && (
        <ImportParcelles
          onFerme={() => setImportOuvert(false)}
          onTermine={async (crees) => {
            setImportOuvert(false)
            setMessageImport(`${crees} parcelle(s) importée(s).`)
            await recharger()
          }}
        />
      )}

      {sansTrace > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert size={16} className="shrink-0" />
          {sansTrace} parcelle(s) sans tracé — leur superficie ne peut pas être calculée.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, référence, commune, propriétaire…"
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(LIBELLES_STATUT_PARCELLE).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {chargement ? (
        <p className="py-12 text-center text-sm text-gray-500">Chargement…</p>
      ) : filtrees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-500">Aucune parcelle.</p>
          <Link href="/carte" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
            Tracer la première sur la carte
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Parcelle</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Situation juridique</th>
                <th className="px-4 py-3 text-right font-medium">Superficie</th>
                <th className="px-4 py-3 text-right font-medium">Valeur</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectionId(p.id)}
                  className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-blue-50/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: p.couleur }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium text-gray-900">
                          {p.nom}
                          {p.bien_id && (
                            <span title="Rattachée à un bien locatif">
                              <Link2 size={13} className="text-blue-500" />
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {[p.reference, p.quartier, p.commune].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{LIBELLES_TYPE_PARCELLE[p.type]}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {LIBELLES_JURIDIQUE[p.statut_juridique]}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {p.superficie_m2 ? formaterSuperficie(p.superficie_m2) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {p.valeur_estimee ?? p.prix_achat
                      ? formatMontant(p.valeur_estimee ?? p.prix_achat!)
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${couleursStatut[p.statut]}`}
                    >
                      {LIBELLES_STATUT_PARCELLE[p.statut]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={16} className="text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PageParcelles() {
  return (
    <FournisseurParcelles>
      <Liste />
    </FournisseurParcelles>
  )
}
