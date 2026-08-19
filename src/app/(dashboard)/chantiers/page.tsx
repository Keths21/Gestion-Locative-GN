'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookImage, GanttChartSquare, HardHat, Link2, MapPin, Plus, Search, Wallet, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { creerChantier, creerPhasesStandard, listerChantiers, syntheseBudget } from '@/lib/chantiers'
import TableauBudget from '@/components/chantiers/TableauBudget'
import FriseAvancement from '@/components/chantiers/FriseAvancement'
import JournalChantier from '@/components/chantiers/JournalChantier'
import { formatMontant } from '@/lib/utils'
import { LIBELLES_NATURE_CHANTIER, LIBELLES_STATUT_CHANTIER } from '@/lib/constants'
import type { Chantier, NatureChantier, StatutChantier } from '@/types'

const couleursStatut: Record<StatutChantier, string> = {
  prevu: 'bg-gray-100 text-gray-700',
  en_cours: 'bg-blue-100 text-blue-700',
  suspendu: 'bg-amber-100 text-amber-800',
  livre: 'bg-green-100 text-green-700',
  abandonne: 'bg-gray-100 text-gray-500',
}

const classeChamp =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500'

export default function PageChantiers() {
  const supabase = useMemo(() => createClient(), [])
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [resumes, setResumes] = useState<Record<string, { realise: number; prevu: number; depassement: number }>>({})
  const [chargement, setChargement] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [selectionId, setSelectionId] = useState<string | null>(null)
  const [creation, setCreation] = useState(false)
  const [onglet, setOnglet] = useState<'budget' | 'avancement' | 'journal'>('budget')
  const [erreur, setErreur] = useState<string | null>(null)

  const [n, setN] = useState({
    nom: '',
    nature: 'construction' as NatureChantier,
    commune: '',
    quartier: '',
    budget_initial: '',
    reserve_imprevus: '',
  })

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const liste = await listerChantiers(supabase, { recherche: recherche || undefined })
      setChantiers(liste)
      // Un aperçu budgétaire par chantier : sans lui, la liste ne dit rien
      // de ce qui compte vraiment.
      const paires = await Promise.all(
        liste.map(async (c) => {
          try {
            const s = await syntheseBudget(supabase, c.id)
            return [c.id, { realise: s.realise_total, prevu: s.prevu_total, depassement: s.depassement }] as const
          } catch {
            return [c.id, { realise: 0, prevu: 0, depassement: 0 }] as const
          }
        })
      )
      setResumes(Object.fromEntries(paires))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setChargement(false)
    }
  }, [supabase, recherche])

  useEffect(() => {
    void charger()
  }, [charger])

  const creer = async () => {
    if (!n.nom.trim()) {
      setErreur('Le nom est obligatoire.')
      return
    }
    try {
      const c = await creerChantier(supabase, {
        nom: n.nom.trim(),
        nature: n.nature,
        commune: n.commune.trim() || null,
        quartier: n.quartier.trim() || null,
        budget_initial: n.budget_initial ? Number(n.budget_initial.replace(/\s/g, '')) : null,
        reserve_imprevus: n.reserve_imprevus ? Number(n.reserve_imprevus.replace(/\s/g, '')) : null,
      })
      await creerPhasesStandard(supabase, c.id)
      setCreation(false)
      setN({ nom: '', nature: 'construction', commune: '', quartier: '', budget_initial: '', reserve_imprevus: '' })
      await charger()
      setSelectionId(c.id)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création impossible')
    }
  }

  const selection = chantiers.find((c) => c.id === selectionId) ?? null

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chantiers</h1>
          <p className="mt-1 text-sm text-gray-500">
            {chantiers.length} chantier(s) — travaux de construction et de rénovation
          </p>
        </div>
        <button
          onClick={() => setCreation(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={16} /> Nouveau chantier
        </button>
      </div>

      {erreur && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erreur}</div>
      )}

      {creation && (
        <div className="mb-5 grid gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
          <input className={classeChamp} placeholder="Nom du chantier" value={n.nom}
                 onChange={(e) => setN({ ...n, nom: e.target.value })} />
          <select className={classeChamp} value={n.nature}
                  onChange={(e) => setN({ ...n, nature: e.target.value as NatureChantier })}>
            {Object.entries(LIBELLES_NATURE_CHANTIER).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <input className={classeChamp} placeholder="Commune" value={n.commune}
                 onChange={(e) => setN({ ...n, commune: e.target.value })} />
          <input className={classeChamp} placeholder="Quartier" value={n.quartier}
                 onChange={(e) => setN({ ...n, quartier: e.target.value })} />
          <input className={classeChamp} placeholder="Budget prévu (GNF)" inputMode="decimal"
                 value={n.budget_initial} onChange={(e) => setN({ ...n, budget_initial: e.target.value })} />
          <input className={classeChamp} placeholder="Réserve d'imprévus (GNF)" inputMode="decimal"
                 value={n.reserve_imprevus} onChange={(e) => setN({ ...n, reserve_imprevus: e.target.value })} />
          <p className="text-xs text-gray-500 sm:col-span-2">
            Un chantier peut exister sans bien ni parcelle : le rattachement se fera plus tard, quand
            le foncier sera enregistré. Les postes de budget et les phases usuelles sont créés automatiquement.
          </p>
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={creer}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Créer
            </button>
            <button onClick={() => setCreation(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
               placeholder="Nom, référence, commune…"
               className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {chargement ? (
        <p className="py-12 text-center text-sm text-gray-500">Chargement…</p>
      ) : chantiers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <HardHat size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">Aucun chantier.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chantiers.map((c) => {
            const r = resumes[c.id]
            const depasse = (r?.depassement ?? 0) > 0
            return (
              <button key={c.id} onClick={() => setSelectionId(c.id)}
                      className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="font-semibold text-gray-900">{c.nom}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${couleursStatut[c.statut]}`}>
                    {LIBELLES_STATUT_CHANTIER[c.statut]}
                  </span>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span>{LIBELLES_NATURE_CHANTIER[c.nature]}</span>
                  {(c.commune || c.quartier) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={11} /> {[c.quartier, c.commune].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {(c.bien_id || c.parcelle_id) && (
                    <span className="inline-flex items-center gap-1 text-blue-600">
                      <Link2 size={11} /> rattaché
                    </span>
                  )}
                </div>
                {r && r.prevu > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        {formatMontant(r.realise)} sur {formatMontant(r.prevu)}
                      </span>
                      {depasse && (
                        <span className="font-medium text-red-600">
                          +{formatMontant(r.depassement)}
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${depasse ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, (r.realise / r.prevu) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {selection && (
        <>
          <div className="fixed inset-0 z-[1500] bg-black/30" onClick={() => setSelectionId(null)} aria-hidden />
          <aside key={selection.id}
                 className="fixed inset-y-0 right-0 z-[1600] flex w-full max-w-2xl flex-col bg-white shadow-2xl">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">{selection.nom}</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {LIBELLES_NATURE_CHANTIER[selection.nature]} ·{' '}
                  {LIBELLES_STATUT_CHANTIER[selection.statut]}
                  {selection.commune ? ` · ${selection.commune}` : ''}
                </p>
              </div>
              <button onClick={() => setSelectionId(null)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Fermer">
                <X size={18} />
              </button>
            </header>
            <div className="shrink-0 border-b border-gray-200 px-5">
              <div className="flex gap-1">
                {([['budget', 'Budget', Wallet], ['avancement', 'Avancement', GanttChartSquare], ['journal', 'Journal', BookImage]] as const).map(
                  ([cle, libelle, Icone]) => (
                    <button
                      key={cle}
                      onClick={() => setOnglet(cle)}
                      className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                        onglet === cle
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Icone size={15} /> {libelle}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="marge-bas-sure min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {onglet === 'budget' ? (
                <TableauBudget chantierId={selection.id} />
              ) : onglet === 'avancement' ? (
                <FriseAvancement chantierId={selection.id} />
              ) : (
                <JournalChantier
                  chantierId={selection.id}
                  organisationId={selection.organisation_id}
                />
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
