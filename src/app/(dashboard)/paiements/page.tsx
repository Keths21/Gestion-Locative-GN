'use client'
import { useEffect, useState } from 'react'
import { Plus, CreditCard, CheckCircle, AlertCircle, Clock, X, FileText, Trash2, Moon, Home, TrendingUp, TrendingDown, Hourglass, CalendarPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Paiement, Locataire, Bien } from '@/types'
import { formatMontant, formatDate, getMoisActuel } from '@/lib/utils'
import toast from 'react-hot-toast'
import { genererQuittance } from '@/lib/pdf'
import { genererEcheancesMensuelles } from '@/lib/echeances'
import { Carte, EnTetePage } from '@/components/ui'

const statutConfig: Record<string, { label: string; color: string; next: string }> = {
  'payé':       { label: 'Payé',       color: 'bg-succes-tenue text-succes',   next: 'impayé' },
  'en_attente': { label: 'En attente', color: 'bg-alerte-tenue text-alerte', next: 'payé' },
  'impayé':     { label: 'Impayé',     color: 'bg-danger-tenue text-danger',       next: 'en_attente' },
}

const EMPTY_FORM = {
  locataire_id: '', bien_id: '', montant: '',
  date_paiement: new Date().toISOString().split('T')[0],
  mois_concerne: getMoisActuel(),
  statut: 'payé', notes: '',
  // Airbnb
  prix_nuit: '', nb_nuits: '', date_debut: '', date_fin: '',
}

function nbNuits(d1: string, d2: string) {
  if (!d1 || !d2) return 0
  return Math.max(0, Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000))
}

export default function PaiementsPage() {
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [locataires, setLocataires] = useState<Locataire[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filtre, setFiltre] = useState<'tous' | 'payé' | 'impayé' | 'en_attente'>('tous')
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [modeAirbnb, setModeAirbnb] = useState(false)
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()

  const fetchData = async () => {
    const [{ data: pai }, { data: loc }] = await Promise.all([
      supabase.from('paiements').select('*, locataire:locataires(nom, prenom), bien:biens(nom, mode_location)').order('created_at', { ascending: false }),
      supabase.from('locataires').select('*, bien:biens(*)')
        .or(`date_sortie.is.null,date_sortie.gt.${new Date().toISOString().split('T')[0]}`),
    ])
    setPaiements(pai || [])
    setLocataires(loc || [])
    setLoading(false)
  }

  // Génère les échéances du mois + promeut les impayés échus.
  // silent = true : auto au chargement (pas de toast si rien à faire).
  const runGeneration = async (silent = false) => {
    setGenerating(true)
    try {
      const { crees, promus } = await genererEcheancesMensuelles(supabase)
      if (!silent) {
        if (crees || promus) {
          toast.success(
            `${crees} loyer(s) généré(s)${promus ? ` · ${promus} passé(s) en impayé` : ''}`
          )
        } else {
          toast.success('Échéances déjà à jour')
        }
      }
      if (crees || promus) await fetchData()
    } catch {
      if (!silent) toast.error('Erreur lors de la génération des loyers')
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    (async () => {
      await runGeneration(true) // génération auto silencieuse
      await fetchData()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  const handleLocataireChange = (locId: string) => {
    const loc = locataires.find(l => l.id === locId)
    const bien = (loc as any)?.bien
    const isAirbnb = bien?.mode_location === 'airbnb'
    setModeAirbnb(isAirbnb)
    setForm(f => ({
      ...f,
      locataire_id: locId,
      bien_id: loc?.bien_id || '',
      montant: isAirbnb ? '' : String(bien?.loyer_base || ''),
      prix_nuit: isAirbnb ? String(bien?.prix_nuit || '') : '',
    }))
  }

  // Recalcul montant Airbnb quand dates changent
  const handleDateChange = (key: 'date_debut' | 'date_fin', val: string) => {
    const updated = { ...form, [key]: val }
    const nuits = nbNuits(
      key === 'date_debut' ? val : form.date_debut,
      key === 'date_fin' ? val : form.date_fin
    )
    const total = nuits > 0 && Number(form.prix_nuit) ? nuits * Number(form.prix_nuit) : 0
    setForm({ ...updated, nb_nuits: nuits > 0 ? String(nuits) : '', montant: total > 0 ? String(total) : '' })
  }

  const handlePrixNuitChange = (val: string) => {
    const nuits = nbNuits(form.date_debut, form.date_fin)
    const total = nuits > 0 && Number(val) ? nuits * Number(val) : 0
    setForm(f => ({ ...f, prix_nuit: val, montant: total > 0 ? String(total) : '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const moisConcerne = modeAirbnb && form.date_debut && form.date_fin
      ? `${form.date_debut} → ${form.date_fin}`
      : form.mois_concerne

    const payload = {
      locataire_id: form.locataire_id,
      bien_id: form.bien_id,
      montant: Number(form.montant),
      date_paiement: form.date_paiement,
      mois_concerne: moisConcerne,
      statut: form.statut,
      notes: form.notes || null,
    }

    // En location mensuelle, une échéance peut déjà exister pour ce mois
    // (générée automatiquement) : on la met à jour au lieu de créer un doublon.
    let error: { message: string } | null = null
    if (!modeAirbnb) {
      const { data: existant } = await supabase
        .from('paiements')
        .select('id')
        .eq('locataire_id', form.locataire_id)
        .eq('mois_concerne', moisConcerne)
        .limit(1)
      if (existant && existant.length > 0) {
        ({ error } = await supabase.from('paiements').update(payload).eq('id', existant[0].id))
      } else {
        ({ error } = await supabase.from('paiements').insert(payload))
      }
    } else {
      ({ error } = await supabase.from('paiements').insert(payload))
    }

    if (error) { toast.error('Erreur : ' + error.message); setSubmitting(false); return }
    toast.success('Paiement enregistré !')
    setShowModal(false)
    setForm(EMPTY_FORM)
    setModeAirbnb(false)
    setSubmitting(false)
    fetchData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce paiement ?')) return
    await supabase.from('paiements').delete().eq('id', id)
    toast.success('Paiement supprimé')
    fetchData()
  }

  const handleStatutChange = async (p: Paiement) => {
    const next = statutConfig[p.statut]?.next || 'payé'
    const update: Record<string, unknown> = { statut: next }
    // En passant à "payé", on date l'encaissement si l'échéance n'était pas encore réglée
    if (next === 'payé' && !p.date_paiement) {
      update.date_paiement = new Date().toISOString().split('T')[0]
    }
    await supabase.from('paiements').update(update).eq('id', p.id)
    fetchData()
  }

  const handleQuittance = async (paiement: Paiement) => {
    // Les coordonnées de l'agence figurent en tête du reçu : sans elles, le
    // document sortirait au nom générique de l'application.
    const { data: agence } = await supabase
      .from('parametres')
      .select('nom_agence, adresse, ville, telephone, email')
      .maybeSingle()

    await genererQuittance(paiement, agence)
    toast.success('Reçu généré')
  }

  const paiementsFiltres = filtre === 'tous' ? paiements : paiements.filter(p => p.statut === filtre)
  const moisCourant = getMoisActuel()

  const totalEncaisse = paiements.filter(p => p.statut === 'payé').reduce((s, p) => s + p.montant, 0)
  const totalImpayes = paiements.filter(p => p.statut === 'impayé').reduce((s, p) => s + p.montant, 0)
  const totalAttente = paiements.filter(p => p.statut === 'en_attente').reduce((s, p) => s + p.montant, 0)
  const totalMois = paiements.filter(p => p.statut === 'payé' && p.mois_concerne?.startsWith(moisCourant)).reduce((s, p) => s + p.montant, 0)

  const inputCls = 'w-full px-4 py-2.5 border border-bordure-forte rounded-[var(--rayon)] focus:ring-2 focus:ring-primaire outline-none text-sm'

  return (
    <div className="space-y-6">

      <EnTetePage titre="Paiements" sous={`${paiements.length} paiement(s) enregistré(s)`}>
        <div className="flex items-center gap-2">
          <button onClick={() => runGeneration(false)} disabled={generating}
            title="Créer les échéances de loyer du mois pour les locataires mensuels"
            className="flex items-center gap-2 border border-bordure text-texte px-4 py-2.5 rounded-[var(--rayon)] hover:bg-surface-appuyee transition text-sm font-medium disabled:opacity-50">
            <CalendarPlus className={`h-4 w-4 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? 'Génération...' : 'Générer les loyers'}
          </button>
          <button onClick={() => { setForm(EMPTY_FORM); setModeAirbnb(false); setShowModal(true) }}
            className="flex items-center gap-2 bg-primaire text-white px-4 py-2.5 rounded-[var(--rayon)] hover:bg-primaire-appui transition text-sm font-medium">
            <Plus className="h-4 w-4" /> Enregistrer un paiement
          </button>
        </div>
      </EnTetePage>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Carte className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-succes" />
            <p className="text-xs text-texte-doux font-medium">Total encaissé</p>
          </div>
          <p className="text-lg font-bold text-succes">{formatMontant(totalEncaisse)}</p>
        </Carte>
        <Carte className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-danger" />
            <p className="text-xs text-texte-doux font-medium">Impayés</p>
          </div>
          <p className="text-lg font-bold text-danger">{formatMontant(totalImpayes)}</p>
        </Carte>
        <Carte className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Hourglass className="h-4 w-4 text-alerte" />
            <p className="text-xs text-texte-doux font-medium">En attente</p>
          </div>
          <p className="text-lg font-bold text-alerte">{formatMontant(totalAttente)}</p>
        </Carte>
        <Carte className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4 text-primaire" />
            <p className="text-xs text-texte-doux font-medium">Ce mois-ci</p>
          </div>
          <p className="text-lg font-bold text-primaire">{formatMontant(totalMois)}</p>
        </Carte>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'tous', label: 'Tous', count: paiements.length },
          { key: 'payé', label: 'Payés', count: paiements.filter(p => p.statut === 'payé').length },
          { key: 'en_attente', label: 'En attente', count: paiements.filter(p => p.statut === 'en_attente').length },
          { key: 'impayé', label: 'Impayés', count: paiements.filter(p => p.statut === 'impayé').length },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFiltre(f.key)}
            className={`px-4 py-2 rounded-[var(--rayon)] text-sm font-medium transition flex items-center gap-2 ${filtre === f.key ? 'bg-primaire text-white' : 'bg-surface border border-bordure text-texte-doux hover:bg-surface-appuyee'}`}>
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${filtre === f.key ? 'bg-surface/20 text-white' : 'bg-surface-appuyee text-texte-doux'}`}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primaire" /></div>
      ) : paiementsFiltres.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-[var(--rayon)] border border-bordure">
          <CreditCard className="h-12 w-12 text-texte-faible mx-auto mb-4" />
          <p className="text-texte-doux">Aucun paiement trouvé.</p>
        </div>
      ) : (
        <Carte className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-appuyee border-b border-bordure">
                <th className="text-left px-5 py-3 text-texte-doux font-medium">Locataire</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium hidden md:table-cell">Bien</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium">Montant</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium hidden lg:table-cell">Période</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium hidden lg:table-cell">Date</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium">Statut</th>
                <th className="px-5 py-3 text-right text-texte-doux font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bordure">
              {paiementsFiltres.map(p => {
                const s = statutConfig[p.statut] || statutConfig['en_attente']
                const isAirbnb = (p as any).bien?.mode_location === 'airbnb'
                return (
                  <tr key={p.id} className="hover:bg-surface-appuyee transition">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-texte">{(p as any).locataire?.prenom} {(p as any).locataire?.nom}</p>
                      {(p as any).notes && <p className="text-xs text-texte-faible mt-0.5 italic">{(p as any).notes}</p>}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-texte-doux">
                        {isAirbnb
                          ? <Moon className="h-3.5 w-3.5 text-info shrink-0" />
                          : <Home className="h-3.5 w-3.5 text-texte-faible shrink-0" />}
                        {(p as any).bien?.nom || '-'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-texte">{formatMontant(p.montant)}</td>
                    <td className="px-5 py-3.5 text-texte-doux hidden lg:table-cell text-xs">
                      {p.mois_concerne?.includes('→')
                        ? p.mois_concerne
                        : p.mois_concerne}
                    </td>
                    <td className="px-5 py-3.5 text-texte-doux hidden lg:table-cell text-xs">
                      {p.date_paiement
                        ? formatDate(p.date_paiement)
                        : <span className="italic text-texte-faible">Non réglé</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => handleStatutChange(p)}
                        title="Cliquer pour changer le statut"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition ${s.color}`}>
                        {p.statut === 'payé' && <CheckCircle className="h-3 w-3" />}
                        {p.statut === 'en_attente' && <Clock className="h-3 w-3" />}
                        {p.statut === 'impayé' && <AlertCircle className="h-3 w-3" />}
                        {s.label}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        {p.statut === 'payé' && (
                          <button onClick={() => handleQuittance(p)} title="Générer quittance"
                            className="p-1.5 hover:bg-primaire-tenue rounded-[var(--rayon)] text-primaire transition">
                            <FileText className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(p.id)} title="Supprimer"
                          className="p-1.5 hover:bg-danger-tenue rounded-[var(--rayon)] text-danger transition">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Carte>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-bordure">
              <h2 className="font-bold text-texte text-lg">Nouveau paiement</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-surface-appuyee rounded-[var(--rayon)] transition">
                <X className="h-5 w-5 text-texte-doux" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              {/* Locataire */}
              <div>
                <label className="block text-sm font-medium text-texte mb-1">Locataire *</label>
                <select value={form.locataire_id} onChange={e => handleLocataireChange(e.target.value)} required className={inputCls}>
                  <option value="">-- Sélectionner un locataire --</option>
                  {locataires.map(l => {
                    const mode = (l as any).bien?.mode_location
                    return (
                      <option key={l.id} value={l.id}>
                        {l.prenom} {l.nom} {mode === 'airbnb' ? '(Airbnb)' : mode === 'appartement' ? '(Mensuel)' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Badge mode */}
              {form.locataire_id && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-[var(--rayon)] text-sm font-medium ${modeAirbnb ? 'bg-info-tenue text-info' : 'bg-primaire-tenue text-primaire'}`}>
                  {modeAirbnb ? <Moon className="h-4 w-4" /> : <Home className="h-4 w-4" />}
                  {modeAirbnb ? 'Location Airbnb — paiement calculé par nuit' : 'Location mensuelle — loyer mensuel'}
                </div>
              )}

              {modeAirbnb ? (
                <>
                  {/* Airbnb */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Date d'arrivée *</label>
                      <input type="date" value={form.date_debut} onChange={e => handleDateChange('date_debut', e.target.value)} required className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Date de départ *</label>
                      <input type="date" value={form.date_fin} onChange={e => handleDateChange('date_fin', e.target.value)} required className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Prix / nuit (GNF)</label>
                      <input type="number" value={form.prix_nuit} onChange={e => handlePrixNuitChange(e.target.value)} placeholder="150 000" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Nombre de nuits</label>
                      <input type="text" value={form.nb_nuits} readOnly placeholder="Auto" className={`${inputCls} bg-surface-appuyee text-texte-doux`} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-texte mb-1">Montant total (GNF) *</label>
                    <input type="number" value={form.montant} onChange={e => set('montant', e.target.value)} required placeholder="Calculé automatiquement" className={inputCls} />
                  </div>
                </>
              ) : (
                <>
                  {/* Appartement */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Montant (GNF) *</label>
                      <input type="number" value={form.montant} onChange={e => set('montant', e.target.value)} required className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Mois concerné *</label>
                      <input type="month" value={form.mois_concerne} onChange={e => set('mois_concerne', e.target.value)} required className={inputCls} />
                    </div>
                  </div>
                </>
              )}

              {/* Communs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-texte mb-1">Date de paiement *</label>
                  <input type="date" value={form.date_paiement} onChange={e => set('date_paiement', e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-texte mb-1">Statut</label>
                  <select value={form.statut} onChange={e => set('statut', e.target.value)} className={inputCls}>
                    <option value="payé">Payé</option>
                    <option value="en_attente">En attente</option>
                    <option value="impayé">Impayé</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-texte mb-1">Notes (optionnel)</label>
                <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Espèces, virement, chèque..." className={inputCls} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 bg-primaire text-white py-3 rounded-[var(--rayon)] hover:bg-primaire-appui transition font-semibold disabled:opacity-50">
                  {submitting ? 'Enregistrement...' : 'Enregistrer le paiement'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 border border-bordure-forte rounded-[var(--rayon)] hover:bg-surface-appuyee transition text-sm font-medium">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
