'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, CircleCheck, Info, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  ajouterJalon,
  creerPhasesStandard,
  modifierPhase,
  supprimerJalon,
  syntheseAvancement,
  validerJalon,
  type SyntheseAvancement,
} from '@/lib/chantiers'
import { formatMontant } from '@/lib/utils'

/**
 * Frise d'avancement et jalons.
 *
 * L'avancement global est pondéré par le budget des phases, et la méthode
 * employée est affichée : un pourcentage sans sa méthode invite à le
 * surinterpréter. Compter les phases donnerait 25 % là où la pondération
 * donne 4 % — l'écart n'est pas cosmétique.
 */

const classeChamp =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primaire'

export default function FriseAvancement({
  chantierId,
  lectureSeule,
}: {
  chantierId: string
  lectureSeule?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [s, setS] = useState<SyntheseAvancement | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saisieJalon, setSaisieJalon] = useState<string | null>(null)
  const [j, setJ] = useState({ nom: '', date_prevue: '', montant: '' })

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      setS(await syntheseAvancement(supabase, chantierId))
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

  const valider = async (id: string) => {
    try {
      const r = await validerJalon(supabase, id)
      setMessage(
        r.deja_valide
          ? 'Ce jalon était déjà validé — rien n’a été libéré une seconde fois.'
          : r.montant_libere > 0
            ? `Jalon validé — ${formatMontant(r.montant_libere)} deviennent exigibles.`
            : 'Jalon validé.'
      )
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Validation impossible')
    }
  }

  const majPhase = async (id: string, champ: 'avancement_pct' | 'montant_prevu', valeur: string) => {
    const n = Number(valeur.replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return
    if (champ === 'avancement_pct' && n > 100) return
    await modifierPhase(supabase, id, { [champ]: n })
    await charger()
  }

  const creerJalon = async (phaseId: string) => {
    if (!j.nom.trim()) return
    try {
      await ajouterJalon(supabase, chantierId, {
        nom: j.nom.trim(),
        phase_id: phaseId,
        date_prevue: j.date_prevue || null,
        montant_a_liberer: j.montant ? Number(j.montant.replace(/\s/g, '')) : null,
      })
      setJ({ nom: '', date_prevue: '', montant: '' })
      setSaisieJalon(null)
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ajout impossible')
    }
  }

  if (chargement) return <p className="py-8 text-center text-sm text-gray-500">Chargement…</p>
  if (!s) return <p className="py-8 text-center text-sm text-red-600">{erreur}</p>

  if (s.phases_total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
        <p className="mb-3 text-sm text-gray-500">Aucune phase définie.</p>
        {!lectureSeule && (
          <button
            onClick={async () => {
              await creerPhasesStandard(supabase, chantierId)
              await charger()
            }}
            className="rounded-lg bg-primaire px-4 py-2 text-sm font-semibold text-white hover:bg-primaire-appui"
          >
            Créer les phases usuelles
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-2xl font-semibold tabular-nums text-gray-900">
            {s.avancement_global} %
          </span>
          <span className="text-xs text-gray-500">
            {s.jalons_valides} / {s.jalons_total} jalon(s) validé(s)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-primaire" style={{ width: `${s.avancement_global}%` }} />
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
          <Info size={12} className="mt-0.5 shrink-0" />
          {s.ponderation === 'budget'
            ? 'Pondéré par le budget de chaque phase — une phase peu coûteuse pèse peu.'
            : 'Moyenne simple des phases : renseignez leur montant pour une pondération par le budget.'}
        </p>
      </div>

      {(s.jalons_en_retard > 0 || s.montant_a_venir > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {s.jalons_en_retard > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <span className="font-semibold">{s.jalons_en_retard}</span> jalon(s) en retard
            </div>
          )}
          {s.montant_a_venir > 0 && (
            <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
              <span className="font-semibold">{formatMontant(s.montant_a_venir)}</span> à libérer
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message}</div>
      )}
      {erreur && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</div>}

      <ol className="space-y-3">
        {s.phases.map((p) => (
          <li key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                  {p.ordre}
                </span>
                <span className="font-medium text-gray-900">{p.nom}</span>
                {p.poids_pct !== null && (
                  <span className="text-xs text-gray-400">{p.poids_pct} % du budget</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!lectureSeule && (
                  <>
                    <input
                      defaultValue={p.montant_prevu || ''}
                      onBlur={(e) => void majPhase(p.id, 'montant_prevu', e.target.value)}
                      placeholder="Montant"
                      inputMode="decimal"
                      aria-label={`Montant prévu — ${p.nom}`}
                      className="w-28 rounded border border-gray-200 px-2 py-1 text-right text-xs tabular-nums outline-none focus:ring-2 focus:ring-primaire"
                    />
                    <input
                      defaultValue={p.avancement_pct}
                      onBlur={(e) => void majPhase(p.id, 'avancement_pct', e.target.value)}
                      inputMode="numeric"
                      aria-label={`Avancement — ${p.nom}`}
                      className="w-14 rounded border border-gray-200 px-2 py-1 text-right text-xs tabular-nums outline-none focus:ring-2 focus:ring-primaire"
                    />
                  </>
                )}
                <span className="w-10 text-right text-sm font-medium tabular-nums text-gray-700">
                  {p.avancement_pct} %
                </span>
              </div>
            </div>

            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${p.avancement_pct === 100 ? 'bg-green-500' : 'bg-primaire'}`}
                style={{ width: `${p.avancement_pct}%` }}
              />
            </div>

            {p.jalons.length > 0 && (
              <ul className="space-y-1.5">
                {p.jalons.map((jl) => (
                  <li key={jl.id} className="flex items-center gap-2 text-sm">
                    {jl.date_validation ? (
                      <CircleCheck size={15} className="shrink-0 text-green-600" />
                    ) : (
                      <CalendarClock
                        size={15}
                        className={`shrink-0 ${jl.en_retard ? 'text-amber-600' : 'text-gray-300'}`}
                      />
                    )}
                    <span className={`min-w-0 flex-1 truncate ${jl.date_validation ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                      {jl.nom}
                    </span>
                    {jl.montant_a_liberer ? (
                      <span className="shrink-0 text-xs tabular-nums text-gray-500">
                        {formatMontant(jl.montant_a_liberer)}
                      </span>
                    ) : null}
                    {!jl.date_validation && !lectureSeule && (
                      <button
                        onClick={() => void valider(jl.id)}
                        className="shrink-0 rounded-md bg-primaire px-2 py-1 text-xs font-semibold text-white hover:bg-primaire-appui"
                      >
                        <Check size={12} className="inline" /> Valider
                      </button>
                    )}
                    {!lectureSeule && (
                      <button
                        onClick={async () => {
                          await supprimerJalon(supabase, jl.id)
                          await charger()
                        }}
                        className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Supprimer ${jl.nom}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!lectureSeule && (
              saisieJalon === p.id ? (
                <div className="mt-3 grid gap-2 rounded-lg bg-gray-50 p-2 sm:grid-cols-3">
                  <input className={classeChamp} placeholder="Nom du jalon" value={j.nom}
                         onChange={(e) => setJ({ ...j, nom: e.target.value })} />
                  <input type="date" className={classeChamp} value={j.date_prevue}
                         onChange={(e) => setJ({ ...j, date_prevue: e.target.value })} />
                  <input className={classeChamp} placeholder="Montant à libérer" inputMode="decimal"
                         value={j.montant} onChange={(e) => setJ({ ...j, montant: e.target.value })} />
                  <div className="flex gap-2 sm:col-span-3">
                    <button onClick={() => void creerJalon(p.id)}
                            className="rounded-lg bg-primaire px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaire-appui">
                      Ajouter
                    </button>
                    <button onClick={() => setSaisieJalon(null)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setSaisieJalon(p.id)}
                        className="mt-2 flex items-center gap-1 text-xs text-primaire hover:underline">
                  <Plus size={12} /> Ajouter un jalon
                </button>
              )
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
