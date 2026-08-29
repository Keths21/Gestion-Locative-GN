'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Plus, ShieldAlert, Trash2, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  enregistrerDepense,
  listerDepenses,
  modifierPoste,
  supprimerDepense,
  syntheseBudget,
  type Depense,
  type SyntheseBudget,
} from '@/lib/chantiers'
import { formatMontant } from '@/lib/utils'
import {
  LIBELLES_CORPS_ETAT,
  LIBELLES_STATUT_DEPENSE,
  LIBELLES_TYPE_DEPENSE,
} from '@/lib/constants'

/**
 * Pilotage financier d'un chantier.
 *
 * Le tableau sépare quatre montants que l'on confond souvent, et dont la
 * confusion fausse tout : le prévu, ce à quoi on s'est engagé par devis, ce
 * qui est réellement facturé, et ce qui est payé. Un devis de 180 M ne doit
 * jamais apparaître comme dépensé.
 *
 * Au-dessus, la seule question qui vaille en cours de chantier : combien
 * reste-t-il de réserve d'imprévus avant la rallonge ?
 */

const classeChamp =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primaire'

export default function TableauBudget({
  chantierId,
  lectureSeule,
}: {
  chantierId: string
  lectureSeule?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [synthese, setSynthese] = useState<SyntheseBudget | null>(null)
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [saisie, setSaisie] = useState(false)

  const [f, setF] = useState({
    libelle: '',
    montant: '',
    type: 'facture' as Depense['type'],
    statut: 'valide' as Depense['statut'],
    poste_id: '',
    reference: '',
    date_depense: new Date().toISOString().slice(0, 10),
  })

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const [s, d] = await Promise.all([
        syntheseBudget(supabase, chantierId),
        listerDepenses(supabase, chantierId),
      ])
      setSynthese(s)
      setDepenses(d)
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setChargement(false)
    }
  }, [supabase, chantierId])

  useEffect(() => {
    void charger()
  }, [charger])

  const ajouter = async () => {
    const montant = Number(f.montant.replace(/\s/g, '').replace(',', '.'))
    if (!f.libelle.trim() || !Number.isFinite(montant) || montant <= 0) {
      setErreur('Un libellé et un montant positif sont requis.')
      return
    }
    try {
      await enregistrerDepense(supabase, {
        chantier_id: chantierId,
        libelle: f.libelle.trim(),
        montant,
        type: f.type,
        statut: f.statut,
        poste_id: f.poste_id || null,
        reference: f.reference.trim() || null,
        date_depense: f.date_depense,
      })
      setF({ ...f, libelle: '', montant: '', reference: '' })
      setSaisie(false)
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible')
    }
  }

  const retirer = async (id: string) => {
    try {
      await supprimerDepense(supabase, id)
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression impossible')
    }
  }

  const majPrevu = async (id: string, valeur: string) => {
    const n = Number(valeur.replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return
    await modifierPoste(supabase, id, { montant_prevu: n })
    await charger()
  }

  if (chargement) return <p className="py-8 text-center text-sm text-gray-500">Chargement du budget…</p>
  if (!synthese) return <p className="py-8 text-center text-sm text-red-600">{erreur}</p>

  const reserveEpuisee = synthese.reserve_restante < 0

  return (
    <div className="space-y-5">
      {/* Le chiffre qui compte en premier */}
      <div
        className={`rounded-xl border p-4 ${
          reserveEpuisee ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <div className="flex items-start gap-3">
          {reserveEpuisee ? (
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-red-600" />
          ) : (
            <Wallet size={20} className="mt-0.5 shrink-0 text-gray-500" />
          )}
          <div className="min-w-0 flex-1">
            {reserveEpuisee ? (
              <>
                <p className="text-sm font-semibold text-red-800">
                  Réserve d&apos;imprévus épuisée — dépassement de{' '}
                  {formatMontant(synthese.depassement)}
                </p>
                <p className="mt-0.5 text-xs text-red-700">
                  Les avenants dépassent la réserve prévue. Toute dépense supplémentaire appelle
                  une rallonge.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">
                  Réserve d&apos;imprévus restante : {formatMontant(synthese.reserve_restante)}
                </p>
                <p className="mt-0.5 text-xs text-gray-600">
                  sur {formatMontant(synthese.reserve_imprevus)} prévus ·{' '}
                  {formatMontant(synthese.avenants_total)} déjà consommés par avenants
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Budget prévu', synthese.prevu_total, 'text-gray-900'],
          ['Engagé (devis)', synthese.engage_total, 'text-amber-700'],
          ['Réalisé (factures)', synthese.realise_total, 'text-primaire'],
          ['Payé', synthese.paye_total, 'text-green-700'],
        ].map(([libelle, valeur, couleur]) => (
          <div key={libelle as string} className="rounded-lg border border-gray-200 bg-white px-3 py-3">
            <div className={`text-base font-semibold tabular-nums ${couleur as string}`}>
              {formatMontant(valeur as number)}
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-500">
              {libelle as string}
            </div>
          </div>
        ))}
      </div>

      {synthese.depenses_sans_poste > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="shrink-0" />
          {synthese.depenses_sans_poste} dépense(s) non affectée(s) à un poste — comptées dans les
          totaux, mais invisibles ligne à ligne.
        </div>
      )}

      {/* Postes */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Poste</th>
              <th className="px-4 py-3 text-right font-medium">Prévu</th>
              <th className="px-4 py-3 text-right font-medium">Engagé</th>
              <th className="px-4 py-3 text-right font-medium">Réalisé</th>
              <th className="px-4 py-3 text-right font-medium">Écart</th>
            </tr>
          </thead>
          <tbody>
            {synthese.postes.map((p) => {
              const depasse = p.ecart < 0
              return (
                <tr key={p.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{p.libelle}</div>
                    <div className="text-xs text-gray-500">
                      {LIBELLES_CORPS_ETAT[p.corps_etat]}
                      {p.avenants > 0 && (
                        <span className="text-amber-700">
                          {' '}· dont {formatMontant(p.avenants)} d&apos;avenants
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {lectureSeule ? (
                      <span className="tabular-nums">{formatMontant(p.prevu)}</span>
                    ) : (
                      <input
                        defaultValue={p.base}
                        onBlur={(e) => void majPrevu(p.id, e.target.value)}
                        className="w-32 rounded border border-gray-200 px-2 py-1 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-primaire"
                        inputMode="decimal"
                        aria-label={`Budget prévu — ${p.libelle}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">
                    {p.engage ? formatMontant(p.engage) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-primaire">
                    {p.realise ? formatMontant(p.realise) : '—'}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                      depasse ? 'text-red-600' : 'text-gray-600'
                    }`}
                  >
                    {formatMontant(p.ecart)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Dépenses */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Devis, factures et avenants</h3>
          {!lectureSeule && (
            <button
              onClick={() => setSaisie(!saisie)}
              className="flex items-center gap-1.5 rounded-lg bg-primaire px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaire-appui"
            >
              <Plus size={14} /> Ajouter
            </button>
          )}
        </div>

        {saisie && !lectureSeule && (
          <div className="mb-3 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
            <input
              className={classeChamp}
              placeholder="Libellé (ex. Facture maçon tranche 2)"
              value={f.libelle}
              onChange={(e) => setF({ ...f, libelle: e.target.value })}
            />
            <input
              className={classeChamp}
              placeholder="Montant"
              inputMode="decimal"
              value={f.montant}
              onChange={(e) => setF({ ...f, montant: e.target.value })}
            />
            <select
              className={classeChamp}
              value={f.type}
              onChange={(e) => setF({ ...f, type: e.target.value as Depense['type'] })}
            >
              {Object.entries(LIBELLES_TYPE_DEPENSE).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            <select
              className={classeChamp}
              value={f.statut}
              onChange={(e) => setF({ ...f, statut: e.target.value as Depense['statut'] })}
            >
              {Object.entries(LIBELLES_STATUT_DEPENSE).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            <select
              className={classeChamp}
              value={f.poste_id}
              onChange={(e) => setF({ ...f, poste_id: e.target.value })}
            >
              <option value="">Sans poste</option>
              {synthese.postes.map((p) => (
                <option key={p.id} value={p.id}>{p.libelle}</option>
              ))}
            </select>
            <input
              type="date"
              className={classeChamp}
              value={f.date_depense}
              onChange={(e) => setF({ ...f, date_depense: e.target.value })}
            />
            <div className="sm:col-span-2">
              <button
                onClick={ajouter}
                className="flex items-center gap-2 rounded-lg bg-primaire px-4 py-2 text-sm font-semibold text-white hover:bg-primaire-appui"
              >
                <Check size={15} /> Enregistrer
              </button>
              {f.type === 'avenant' && (
                <p className="mt-2 text-xs text-amber-700">
                  Un avenant n&apos;est pas une dépense : il augmente le budget du poste et
                  consomme la réserve d&apos;imprévus.
                </p>
              )}
            </div>
          </div>
        )}

        {erreur && <p className="mb-2 text-xs text-red-600">{erreur}</p>}

        {depenses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
            Aucun devis ni facture enregistré.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {depenses.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    d.type === 'avenant'
                      ? 'bg-amber-100 text-amber-800'
                      : d.type === 'devis'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-primaire-tenue text-primaire'
                  }`}
                >
                  {LIBELLES_TYPE_DEPENSE[d.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-gray-900">{d.libelle}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(d.date_depense).toLocaleDateString('fr-FR')} ·{' '}
                    {LIBELLES_STATUT_DEPENSE[d.statut]}
                  </div>
                </div>
                <div className="shrink-0 tabular-nums text-sm font-medium text-gray-900">
                  {formatMontant(d.montant)}
                </div>
                {!lectureSeule && (
                  <button
                    onClick={() => void retirer(d.id)}
                    className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Supprimer ${d.libelle}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
