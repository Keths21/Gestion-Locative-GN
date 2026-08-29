'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, CalendarClock, Check, Loader2, Lock, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  ajouterEcheance, enregistrerVersement, LIBELLES_STATUT_ECHEANCE,
  supprimerEcheance, syntheseEcheancier, type SyntheseEcheancier,
} from '@/lib/echeancier'
import { syntheseAvancement, type SyntheseAvancement } from '@/lib/chantiers'
import { formatMontant } from '@/lib/utils'

/**
 * Échéancier de paiement.
 *
 * Une échéance liée à un jalon reste verrouillée tant que l'ouvrage n'est pas
 * réceptionné : c'est la garantie qu'on ne décaisse pas d'avance. Le cadenas
 * est explicite, plutôt qu'un statut qu'il faudrait interpréter.
 */

const classeChamp =
  'w-full rounded-[var(--rayon)] border border-bordure-forte px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primaire'

export default function Echeancier({
  chantierId,
  lectureSeule,
}: {
  chantierId: string
  lectureSeule?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [s, setS] = useState<SyntheseEcheancier | null>(null)
  const [avancement, setAvancement] = useState<SyntheseAvancement | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saisie, setSaisie] = useState(false)
  const [alerteEnCours, setAlerteEnCours] = useState(false)

  const [f, setF] = useState({
    libelle: '', montant: '', date_echeance: '', jalon_id: '',
  })

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const [e, a] = await Promise.all([
        syntheseEcheancier(supabase, chantierId),
        syntheseAvancement(supabase, chantierId).catch(() => null),
      ])
      setS(e)
      setAvancement(a)
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setChargement(false)
    }
  }, [supabase, chantierId])

  useEffect(() => { void charger() }, [charger])

  const ajouter = async () => {
    const montant = Number(f.montant.replace(/\s/g, '').replace(',', '.'))
    if (!f.libelle.trim() || !Number.isFinite(montant) || montant <= 0 || !f.date_echeance) {
      setErreur('Libellé, montant et date sont requis.')
      return
    }
    try {
      await ajouterEcheance(supabase, {
        chantier_id: chantierId,
        libelle: f.libelle.trim(),
        montant,
        date_echeance: f.date_echeance,
        jalon_id: f.jalon_id || null,
      })
      setF({ libelle: '', montant: '', date_echeance: '', jalon_id: '' })
      setSaisie(false)
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ajout impossible')
    }
  }

  const alerter = async () => {
    setAlerteEnCours(true)
    setMessage(null)
    try {
      const res = await fetch('/api/chantiers/alerte-echeance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jours: 7 }),
      })
      const data = await res.json().catch(() => ({}))
      setMessage(res.ok
        ? (data.message ?? `${data.alertees} échéance(s) signalée(s).`)
        : (data.erreur ?? 'Envoi impossible'))
    } catch {
      setMessage('Envoi impossible — vérifiez la connexion.')
    } finally {
      setAlerteEnCours(false)
    }
  }

  if (chargement) return <p className="py-8 text-center text-sm text-texte-doux">Chargement…</p>
  if (!s) return <p className="py-8 text-center text-sm text-danger">{erreur}</p>

  const jalonsDisponibles = avancement?.phases.flatMap((p) => p.jalons) ?? []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ['Total prévu', s.total_prevu, 'text-texte'],
          ['Déjà versé', s.total_paye, 'text-succes'],
          ['Exigible', s.exigible_maintenant, 'text-alerte'],
          ['Reste à payer', s.reste_a_payer, 'text-primaire'],
        ] as const).map(([libelle, valeur, couleur]) => (
          <div key={libelle} className="rounded-[var(--rayon)] border border-bordure bg-surface px-3 py-3">
            <div className={`text-base font-semibold tabular-nums ${couleur}`}>
              {formatMontant(valeur)}
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-texte-doux">{libelle}</div>
          </div>
        ))}
      </div>

      {s.en_retard_nombre > 0 && (
        <div className="rounded-[var(--rayon)] bg-danger-tenue px-3 py-2.5 text-sm text-danger">
          <CalendarClock size={15} className="mr-1.5 inline" />
          {s.en_retard_nombre} échéance(s) dépassée(s) et non soldée(s).
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!lectureSeule && (
          <button onClick={() => setSaisie(!saisie)}
                  className="flex items-center gap-1.5 rounded-[var(--rayon)] bg-primaire px-3 py-2 text-sm font-semibold text-white hover:bg-primaire-appui">
            <Plus size={15} /> Ajouter une échéance
          </button>
        )}
        {!lectureSeule && (s.a_venir_7j > 0 || s.en_retard_nombre > 0) && (
          <button onClick={alerter} disabled={alerteEnCours}
                  className="flex items-center gap-1.5 rounded-[var(--rayon)] border border-bordure-forte px-3 py-2 text-sm text-texte hover:bg-surface-appuyee disabled:opacity-50">
            {alerteEnCours ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />}
            Envoyer un rappel
          </button>
        )}
      </div>

      {message && <div className="rounded-[var(--rayon)] bg-primaire-tenue px-3 py-2 text-sm text-primaire">{message}</div>}
      {erreur && <div className="rounded-[var(--rayon)] bg-danger-tenue px-3 py-2 text-sm text-danger">{erreur}</div>}

      {saisie && !lectureSeule && (
        <div className="grid gap-2 rounded-[var(--rayon)] border border-bordure bg-surface-appuyee p-3 sm:grid-cols-2">
          <input className={classeChamp} placeholder="Libellé (ex. Appel de fonds tranche 3)"
                 value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} />
          <input className={classeChamp} placeholder="Montant" inputMode="decimal"
                 value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value })} />
          <input type="date" className={classeChamp} value={f.date_echeance}
                 onChange={(e) => setF({ ...f, date_echeance: e.target.value })} />
          <select className={classeChamp} value={f.jalon_id}
                  onChange={(e) => setF({ ...f, jalon_id: e.target.value })}>
            <option value="">Échéance calendaire</option>
            {jalonsDisponibles.map((j) => (
              <option key={j.id} value={j.id}>Conditionnée par : {j.nom}</option>
            ))}
          </select>
          <p className="text-xs text-texte-doux sm:col-span-2">
            Une échéance conditionnée par un jalon reste verrouillée jusqu’à la réception de
            l’ouvrage : elle ne devient exigible qu’à la validation.
          </p>
          <div className="sm:col-span-2">
            <button onClick={ajouter}
                    className="rounded-[var(--rayon)] bg-primaire px-4 py-2 text-sm font-semibold text-white hover:bg-primaire-appui">
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {s.echeances.length === 0 ? (
        <p className="rounded-[var(--rayon)] border border-dashed border-bordure-forte py-10 text-center text-sm text-texte-doux">
          Aucune échéance planifiée.
        </p>
      ) : (
        <ul className="divide-y divide-bordure rounded-[var(--rayon)] border border-bordure bg-surface">
          {s.echeances.map((e) => {
            const solde = e.montant_paye >= e.montant
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-texte">{e.libelle}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      e.statut === 'payee' ? 'bg-succes-tenue text-succes'
                      : e.statut === 'exigible' ? 'bg-alerte-tenue text-alerte'
                      : e.statut === 'annulee' ? 'bg-surface-appuyee text-texte-doux'
                      : 'bg-surface-appuyee text-texte-doux'}`}>
                      {LIBELLES_STATUT_ECHEANCE[e.statut]}
                    </span>
                    {e.bloquee_par_jalon && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-texte-doux">
                        <Lock size={11} /> {e.jalon_nom}
                      </span>
                    )}
                  </div>
                  <div className={`text-xs ${e.en_retard ? 'font-medium text-danger' : 'text-texte-doux'}`}>
                    {new Date(e.date_echeance).toLocaleDateString('fr-FR')}
                    {e.en_retard && ' — dépassée'}
                    {e.montant_paye > 0 && !solde && ` · ${formatMontant(e.montant_paye)} déjà versés`}
                  </div>
                </div>

                <div className="shrink-0 text-right tabular-nums text-sm font-medium text-texte">
                  {formatMontant(e.montant)}
                </div>

                {!lectureSeule && !solde && e.statut !== 'annulee' && (
                  <button onClick={async () => {
                            await enregistrerVersement(supabase, e.id, e.montant, e.montant)
                            await charger()
                          }}
                          disabled={e.bloquee_par_jalon}
                          title={e.bloquee_par_jalon
                            ? 'Le jalon correspondant n’est pas encore validé'
                            : 'Marquer comme payée'}
                          className="shrink-0 rounded-md bg-succes px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-appuyee disabled:text-texte-faible">
                    <Check size={12} className="inline" /> Payée
                  </button>
                )}
                {!lectureSeule && (
                  <button onClick={async () => { await supprimerEcheance(supabase, e.id); await charger() }}
                          className="shrink-0 rounded p-1.5 text-texte-faible hover:bg-danger-tenue hover:text-danger"
                          aria-label={`Supprimer ${e.libelle}`}>
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
