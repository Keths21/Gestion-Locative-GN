'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HardHat, Phone, Plus, ShieldAlert, ShieldCheck, ShieldQuestion, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  affecterIntervenant, enregistrerIntervenant, etatDecennale, LIBELLES_DECENNALE,
  LIBELLES_METIER, listerIntervenants, listerInterventions, retirerIntervention,
  type Intervenant, type Intervention, type Metier,
} from '@/lib/intervenants'
import { formatMontant } from '@/lib/utils'
import { LIBELLES_CORPS_ETAT, type CorpsEtat } from '@/lib/constants'

/**
 * Intervenants affectés à un chantier.
 *
 * L'état de la garantie décennale est mis en avant, jamais relégué à une
 * ligne de détail : une assurance expirée le jour du sinistre ne couvre
 * rien, même si elle était valable à la signature du marché.
 */

const classeChamp =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primaire'

export default function Intervenants({
  chantierId,
  lectureSeule,
}: {
  chantierId: string
  lectureSeule?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [interventions, setInterventions] = useState<Intervention[]>([])
  const [annuaire, setAnnuaire] = useState<Intervenant[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [formOuvert, setFormOuvert] = useState(false)
  const [modeNouveau, setModeNouveau] = useState(true)

  const [f, setF] = useState({
    intervenant_id: '',
    nom: '', entreprise: '', metier: 'maconnerie' as Metier,
    telephone: '', decennale_numero: '', decennale_valide_jusqu_au: '',
    lot: 'gros_oeuvre' as CorpsEtat, montant_marche: '',
  })

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const [i, a] = await Promise.all([
        listerInterventions(supabase, chantierId),
        listerIntervenants(supabase).catch(() => []),
      ])
      setInterventions(i)
      setAnnuaire(a)
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setChargement(false)
    }
  }, [supabase, chantierId])

  useEffect(() => { void charger() }, [charger])

  const affecter = async () => {
    try {
      let id = f.intervenant_id
      if (modeNouveau) {
        if (!f.nom.trim()) { setErreur('Le nom est obligatoire.'); return }
        const cree = await enregistrerIntervenant(supabase, {
          nom: f.nom.trim(),
          entreprise: f.entreprise.trim() || null,
          metier: f.metier,
          telephone: f.telephone.trim() || null,
          decennale_numero: f.decennale_numero.trim() || null,
          decennale_valide_jusqu_au: f.decennale_valide_jusqu_au || null,
        })
        id = cree.id
      }
      if (!id) { setErreur('Choisissez un intervenant.'); return }

      await affecterIntervenant(supabase, {
        chantier_id: chantierId,
        intervenant_id: id,
        lot: f.lot,
        montant_marche: f.montant_marche ? Number(f.montant_marche.replace(/\s/g, '')) : null,
        statut: 'en_cours',
      })
      setFormOuvert(false)
      setF({ ...f, intervenant_id: '', nom: '', entreprise: '', telephone: '',
             decennale_numero: '', decennale_valide_jusqu_au: '', montant_marche: '' })
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Affectation impossible')
    }
  }

  const alertes = interventions.filter(
    (i) => i.intervenant && ['expiree', 'absente'].includes(etatDecennale(i.intervenant))
  )

  if (chargement) return <p className="py-8 text-center text-sm text-gray-500">Chargement…</p>

  return (
    <div className="space-y-4">
      {alertes.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <ShieldAlert size={15} className="mr-1.5 inline" />
          {alertes.length} intervenant(s) sans garantie décennale valide.
          <span className="block text-xs text-red-700">
            En cas de sinistre, la couverture s’apprécie à la date des travaux — pas à celle de
            la signature du marché.
          </span>
        </div>
      )}

      {!lectureSeule && !formOuvert && (
        <button onClick={() => setFormOuvert(true)}
                className="flex items-center gap-2 rounded-lg bg-primaire px-3 py-2 text-sm font-semibold text-white hover:bg-primaire-appui">
          <Plus size={15} /> Affecter un intervenant
        </button>
      )}

      {formOuvert && !lectureSeule && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1">
              {([[true, 'Nouveau'], [false, 'Depuis l’annuaire']] as const).map(([v, l]) => (
                <button key={String(v)} onClick={() => setModeNouveau(v)}
                        disabled={!v && annuaire.length === 0}
                        className={`rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${
                          modeNouveau === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                        }`}>{l}</button>
              ))}
            </div>
            <button onClick={() => setFormOuvert(false)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {modeNouveau ? (
              <>
                <input className={classeChamp} placeholder="Nom du responsable" value={f.nom}
                       onChange={(e) => setF({ ...f, nom: e.target.value })} />
                <input className={classeChamp} placeholder="Entreprise" value={f.entreprise}
                       onChange={(e) => setF({ ...f, entreprise: e.target.value })} />
                <select className={classeChamp} value={f.metier}
                        onChange={(e) => setF({ ...f, metier: e.target.value as Metier })}>
                  {Object.entries(LIBELLES_METIER).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <input className={classeChamp} placeholder="Téléphone" value={f.telephone}
                       onChange={(e) => setF({ ...f, telephone: e.target.value })} />
                <input className={classeChamp} placeholder="N° de décennale" value={f.decennale_numero}
                       onChange={(e) => setF({ ...f, decennale_numero: e.target.value })} />
                <div>
                  <input type="date" className={classeChamp} value={f.decennale_valide_jusqu_au}
                         onChange={(e) => setF({ ...f, decennale_valide_jusqu_au: e.target.value })} />
                  <p className="mt-1 text-[11px] text-gray-500">Validité de la décennale</p>
                </div>
              </>
            ) : (
              <select className={`${classeChamp} sm:col-span-2`} value={f.intervenant_id}
                      onChange={(e) => setF({ ...f, intervenant_id: e.target.value })}>
                <option value="">Choisir dans l’annuaire…</option>
                {annuaire.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom}{a.entreprise ? ` — ${a.entreprise}` : ''} ({LIBELLES_METIER[a.metier]})
                  </option>
                ))}
              </select>
            )}

            <select className={classeChamp} value={f.lot}
                    onChange={(e) => setF({ ...f, lot: e.target.value as CorpsEtat })}>
              {Object.entries(LIBELLES_CORPS_ETAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input className={classeChamp} placeholder="Montant du marché (GNF)" inputMode="decimal"
                   value={f.montant_marche} onChange={(e) => setF({ ...f, montant_marche: e.target.value })} />

            <div className="sm:col-span-2">
              <button onClick={affecter}
                      className="rounded-lg bg-primaire px-4 py-2 text-sm font-semibold text-white hover:bg-primaire-appui">
                Affecter
              </button>
            </div>
          </div>
          {erreur && <p className="mt-2 text-xs text-red-600">{erreur}</p>}
        </div>
      )}

      {interventions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
          Aucun intervenant affecté.
        </p>
      ) : (
        <ul className="space-y-2">
          {interventions.map((iv) => {
            const p = iv.intervenant
            const etat = p ? etatDecennale(p) : 'absente'
            const Icone = etat === 'valide' ? ShieldCheck : etat === 'expire_bientot' ? ShieldQuestion : ShieldAlert
            const couleur = etat === 'valide' ? 'text-green-600'
                          : etat === 'expire_bientot' ? 'text-amber-600' : 'text-red-600'
            return (
              <li key={iv.id} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <HardHat size={16} className="text-gray-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">
                      {p?.nom}
                      {p?.entreprise && <span className="text-gray-500"> — {p.entreprise}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>{p ? LIBELLES_METIER[p.metier] : ''}</span>
                      <span>Lot {LIBELLES_CORPS_ETAT[iv.lot as CorpsEtat]}</span>
                      {iv.montant_marche ? <span>{formatMontant(iv.montant_marche)}</span> : null}
                      {p?.telephone && (
                        <a href={`tel:${p.telephone}`} className="inline-flex items-center gap-1 text-primaire">
                          <Phone size={11} /> {p.telephone}
                        </a>
                      )}
                    </div>
                    <div className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium ${couleur}`}>
                      <Icone size={13} />
                      {LIBELLES_DECENNALE[etat]}
                      {p?.decennale_valide_jusqu_au && etat !== 'absente' && (
                        <span className="font-normal text-gray-500">
                          (jusqu’au {new Date(p.decennale_valide_jusqu_au).toLocaleDateString('fr-FR')})
                        </span>
                      )}
                    </div>
                  </div>
                  {!lectureSeule && (
                    <button onClick={async () => { await retirerIntervention(supabase, iv.id); await charger() }}
                            className="shrink-0 rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600"
                            aria-label="Retirer du chantier">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
