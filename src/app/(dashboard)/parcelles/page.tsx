'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Download, Link2, Map, Search, TriangleAlert, Upload, X } from 'lucide-react'
import { FournisseurParcelles, useMagasin } from '@/components/parcelles/MagasinParcelles'
import ImportParcelles from '@/components/parcelles/ImportParcelles'
import DetailParcelle from '@/components/parcelles/DetailParcelle'
import BarreEtatSync from '@/components/parcelles/BarreEtatSync'
import { formaterSuperficie } from '@/lib/geo'
import { formatMontant } from '@/lib/utils'
import {
  LIBELLES_JURIDIQUE,
  LIBELLES_STATUT_PARCELLE,
  LIBELLES_TYPE_PARCELLE,
} from '@/lib/constants'
import type { StatutParcelle } from '@/types'

const couleursStatut: Record<StatutParcelle, string> = {
  possede: 'bg-succes-tenue text-succes',
  en_vente: 'bg-alerte-tenue text-alerte',
  vendu: 'bg-surface-appuyee text-texte-doux',
  loue: 'bg-primaire-tenue text-primaire',
  reserve: 'bg-info-tenue text-info',
  prospect: 'bg-surface-appuyee text-texte-doux',
}

function Liste() {
  const { parcelles, chargement, recharger, modifier, supprimer, enLigne, peutEcrire } = useMagasin()
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
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-texte">Parcelles</h1>
            <BarreEtatSync />
          </div>
          <p className="mt-1 text-sm text-texte-doux">
            {filtrees.length} parcelle(s) · {formaterSuperficie(total)} au total
          </p>
        </div>
        {/* flex-wrap + nowrap : sur téléphone, « Ouvrir la carte » sortait de
            l'écran, écrit sur trois lignes. */}
        <div className="flex flex-wrap gap-2">
          {peutEcrire !== false && (
            <button
              onClick={() => setImportOuvert(true)}
              className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--rayon)] border border-bordure-forte px-4 py-2 text-sm text-texte hover:bg-surface-appuyee"
            >
              <Upload size={16} /> Importer
            </button>
          )}
          <a
            href="/api/export?format=geojson"
            className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--rayon)] border border-bordure-forte px-4 py-2 text-sm text-texte hover:bg-surface-appuyee"
          >
            <Download size={16} /> Exporter
          </a>
          <Link
            href="/carte"
            className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--rayon)] bg-primaire px-4 py-2 text-sm font-semibold text-white hover:bg-primaire-appui"
          >
            <Map size={16} /> Ouvrir la carte
          </Link>
        </div>
      </div>

      {messageImport && (
        <div className="mb-4 flex items-center gap-2 rounded-[var(--rayon)] bg-succes-tenue px-4 py-3 text-sm text-succes">
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
            className="fixed inset-y-0 right-0 z-[1600] flex w-full max-w-lg flex-col bg-surface shadow-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-bordure px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-texte">{selection.nom}</h2>
                <p className="mt-0.5 text-xs text-texte-doux">
                  {selection.superficie_m2
                    ? formaterSuperficie(selection.superficie_m2)
                    : 'Sans tracé'}
                  {selection.reference ? ` · ${selection.reference}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href="/carte"
                  className="rounded-[var(--rayon)] p-2 text-texte-faible hover:bg-surface-appuyee hover:text-texte"
                  title="Voir sur la carte"
                >
                  <Map size={18} />
                </Link>
                <button
                  onClick={() => setSelectionId(null)}
                  className="rounded-[var(--rayon)] p-2 text-texte-faible hover:bg-surface-appuyee hover:text-texte"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="marge-bas-sure min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
        <div className="mb-4 flex items-center gap-2 rounded-[var(--rayon)] bg-alerte-tenue px-4 py-3 text-sm text-alerte">
          <TriangleAlert size={16} className="shrink-0" />
          {sansTrace} parcelle(s) sans tracé — leur superficie ne peut pas être calculée.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-texte-faible" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, référence, commune, propriétaire…"
            className="w-full rounded-[var(--rayon)] border border-bordure-forte py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primaire"
          />
        </div>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="rounded-[var(--rayon)] border border-bordure-forte px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primaire"
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
        <p className="py-12 text-center text-sm text-texte-doux">Chargement…</p>
      ) : filtrees.length === 0 ? (
        <div className="rounded-[var(--rayon)] border border-dashed border-bordure-forte py-16 text-center">
          <p className="text-sm text-texte-doux">Aucune parcelle.</p>
          <Link href="/carte" className="mt-2 inline-block text-sm text-primaire hover:underline">
            Tracer la première sur la carte
          </Link>
        </div>
      ) : (
        <>
        {/* Téléphone : une fiche par parcelle. Le tableau de 52rem n'y
            montrait que le nom et le type, le reste caché hors de l'écran. */}
        <ul className="divide-y divide-bordure overflow-hidden rounded-[var(--rayon)] border border-bordure bg-surface md:hidden">
          {filtrees.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectionId(p.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-primaire-tenue"
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.couleur }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium text-texte">
                    <span className="truncate">{p.nom}</span>
                    {p.bien_id && (
                      <span title="Rattachée à un bien locatif" className="shrink-0">
                        <Link2 size={13} className="text-primaire" />
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-texte-doux">
                    {[p.reference, p.quartier, p.commune].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texte-doux">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${couleursStatut[p.statut]}`}>
                      {LIBELLES_STATUT_PARCELLE[p.statut]}
                    </span>
                    <span>{LIBELLES_TYPE_PARCELLE[p.type]}</span>
                    {p.superficie_m2 ? <span className="tabular-nums">· {formaterSuperficie(p.superficie_m2)}</span> : null}
                    {p.valeur_estimee ?? p.prix_achat
                      ? <span className="tabular-nums">· {formatMontant(p.valeur_estimee ?? p.prix_achat!)}</span>
                      : null}
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-texte-faible" />
              </button>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto rounded-[var(--rayon)] border border-bordure bg-surface md:block">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-bordure bg-surface-appuyee text-left text-xs uppercase tracking-wide text-texte-doux">
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
                  className="cursor-pointer border-b border-bordure last:border-0 hover:bg-primaire-tenue"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: p.couleur }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium text-texte">
                          {p.nom}
                          {p.bien_id && (
                            <span title="Rattachée à un bien locatif">
                              <Link2 size={13} className="text-primaire" />
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-texte-doux">
                          {[p.reference, p.quartier, p.commune].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-texte">{LIBELLES_TYPE_PARCELLE[p.type]}</td>
                  <td className="px-4 py-3 text-texte">
                    {LIBELLES_JURIDIQUE[p.statut_juridique]}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-texte">
                    {p.superficie_m2 ? formaterSuperficie(p.superficie_m2) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-texte">
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
                    <ChevronRight size={16} className="text-texte-faible" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
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
