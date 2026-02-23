'use client'
import { useEffect, useState } from 'react'
import { Plus, CreditCard, CheckCircle, AlertCircle, Clock, X, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Paiement, Locataire, Bien } from '@/types'
import { formatMontant, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { genererQuittance } from '@/lib/pdf'

const statutConfig: Record<string, { label: string; color: string; icon: any }> = {
  'payé':       { label: 'Payé',       color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  'en_attente': { label: 'En attente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  'impayé':     { label: 'Impayé',     color: 'bg-red-100 text-red-700',      icon: AlertCircle },
}

export default function PaiementsPage() {
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [locataires, setLocataires] = useState<Locataire[]>([])
  const [biens, setBiens] = useState<Bien[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filtre, setFiltre] = useState<'tous' | 'payé' | 'impayé' | 'en_attente'>('tous')
  const [form, setForm] = useState({
    locataire_id: '', bien_id: '', montant: '',
    date_paiement: new Date().toISOString().split('T')[0],
    mois_concerne: new Date().toISOString().slice(0, 7),
    statut: 'payé', notes: ''
  })
  const supabase = createClient()

  const fetchData = async () => {
    const [{ data: pai }, { data: loc }, { data: bi }] = await Promise.all([
      supabase.from('paiements').select('*, locataire:locataires(*), bien:biens(*)').order('created_at', { ascending: false }),
      supabase.from('locataires').select('*, bien:biens(*)').is('date_sortie', null),
      supabase.from('biens').select('*'),
    ])
    setPaiements(pai || [])
    setLocataires(loc || [])
    setBiens(bi || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleLocataireChange = (locId: string) => {
    const loc = locataires.find(l => l.id === locId)
    setForm(f => ({
      ...f,
      locataire_id: locId,
      bien_id: loc?.bien_id || '',
      montant: String((loc as any)?.bien?.loyer_base || '')
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { ...form, montant: Number(form.montant) }
    const { error } = await supabase.from('paiements').insert(payload)
    if (error) { toast.error('Erreur lors de l\'enregistrement'); return }
    toast.success('Paiement enregistré !')
    setShowForm(false)
    setForm({ locataire_id: '', bien_id: '', montant: '', date_paiement: new Date().toISOString().split('T')[0], mois_concerne: new Date().toISOString().slice(0, 7), statut: 'payé', notes: '' })
    fetchData()
  }

  const handleQuittance = (paiement: Paiement) => {
    genererQuittance(paiement)
    toast.success('Quittance générée !')
  }

  const paiementsFiltres = filtre === 'tous' ? paiements : paiements.filter(p => p.statut === filtre)

  const totalEncaisse = paiements.filter(p => p.statut === 'payé').reduce((s, p) => s + p.montant, 0)
  const totalImpayes = paiements.filter(p => p.statut === 'impayé').reduce((s, p) => s + p.montant, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paiements</h1>
          <p className="text-gray-500 mt-1">{paiements.length} paiement(s) enregistré(s)</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Enregistrer un paiement
        </button>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-sm text-green-600 font-medium">Total encaissé</p>
          <p className="text-xl font-bold text-green-700 mt-1">{formatMontant(totalEncaisse)}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-sm text-red-600 font-medium">Total impayés</p>
          <p className="text-xl font-bold text-red-700 mt-1">{formatMontant(totalImpayes)}</p>
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Nouveau paiement</h2>
            <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Locataire</label>
              <select
                value={form.locataire_id}
                onChange={e => handleLocataireChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                required
              >
                <option value="">-- Sélectionner --</option>
                {locataires.map(l => <option key={l.id} value={l.id}>{l.prenom} {l.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant (GNF)</label>
              <input type="number" value={form.montant} onChange={e => setForm(f => ({...f, montant: e.target.value}))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de paiement</label>
              <input type="date" value={form.date_paiement} onChange={e => setForm(f => ({...f, date_paiement: e.target.value}))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mois concerné</label>
              <input type="month" value={form.mois_concerne} onChange={e => setForm(f => ({...f, mois_concerne: e.target.value}))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select value={form.statut} onChange={e => setForm(f => ({...f, statut: e.target.value}))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="payé">Payé</option>
                <option value="en_attente">En attente</option>
                <option value="impayé">Impayé</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optionnel)</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                placeholder="Paiement espèces, virement..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium">Enregistrer</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition">Annuler</button>
            </div>
          </form>
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {(['tous', 'payé', 'en_attente', 'impayé'] as const).map(f => (
          <button key={f} onClick={() => setFiltre(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${filtre === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f === 'tous' ? 'Tous' : f === 'en_attente' ? 'En attente' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : paiementsFiltres.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucun paiement trouvé.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Locataire</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium hidden md:table-cell">Bien</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Montant</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium hidden lg:table-cell">Mois</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium hidden lg:table-cell">Date</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Statut</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paiementsFiltres.map(p => {
                const s = statutConfig[p.statut] || statutConfig['en_attente']
                const Icon = s.icon
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {(p as any).locataire?.prenom} {(p as any).locataire?.nom}
                    </td>
                    <td className="px-6 py-4 text-gray-600 hidden md:table-cell">
                      {(p as any).bien?.nom || '-'}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {formatMontant(p.montant)}
                    </td>
                    <td className="px-6 py-4 text-gray-600 hidden lg:table-cell">{p.mois_concerne}</td>
                    <td className="px-6 py-4 text-gray-600 hidden lg:table-cell">{formatDate(p.date_paiement)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>
                        <Icon className="h-3 w-3" />{s.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {p.statut === 'payé' && (
                        <button onClick={() => handleQuittance(p)} title="Générer quittance"
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition">
                          <FileText className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
