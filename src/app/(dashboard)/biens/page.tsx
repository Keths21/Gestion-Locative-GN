'use client'
import { useEffect, useState } from 'react'
import { Plus, Building2, MapPin, DollarSign, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Bien } from '@/types'
import { formatMontant } from '@/lib/utils'

const statusColors: Record<string, string> = {
  'loué': 'bg-green-100 text-green-700',
  'vacant': 'bg-yellow-100 text-yellow-700',
  'travaux': 'bg-gray-100 text-gray-700',
}

export default function BiensPage() {
  const [biens, setBiens] = useState<Bien[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nom: '', adresse: '', ville: '', type: 'appartement', surface: '', loyer_base: '', charges: '0', statut: 'vacant' })
  const supabase = createClient()

  const fetchBiens = async () => {
    const { data } = await supabase.from('biens').select('*').order('created_at', { ascending: false })
    setBiens(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchBiens() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('biens').insert({ ...form, user_id: user?.id, surface: Number(form.surface), loyer_base: Number(form.loyer_base), charges: Number(form.charges) })
    setShowForm(false)
    setForm({ nom: '', adresse: '', ville: '', type: 'appartement', surface: '', loyer_base: '', charges: '0', statut: 'vacant' })
    fetchBiens()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce bien ?')) return
    await supabase.from('biens').delete().eq('id', id)
    fetchBiens()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Biens</h1>
          <p className="text-gray-500 mt-1">{biens.length} bien(s) enregistré(s)</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition text-sm font-medium">
          <Plus className="h-4 w-4" /> Ajouter un bien
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Nouveau bien</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Nom du bien', key: 'nom', type: 'text', placeholder: 'Ex: Appartement Kaloum' },
              { label: 'Adresse', key: 'adresse', type: 'text', placeholder: 'Rue, numéro' },
              { label: 'Ville', key: 'ville', type: 'text', placeholder: 'Conakry' },
              { label: 'Surface (m²)', key: 'surface', type: 'number', placeholder: '65' },
              { label: 'Loyer de base (GNF)', key: 'loyer_base', type: 'number', placeholder: '1500000' },
              { label: 'Charges (GNF)', key: 'charges', type: 'number', placeholder: '50000' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
                  onChange={e => setForm({...form, [f.key]: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                {['appartement','maison','bureau','commerce','terrain'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select value={form.statut} onChange={e => setForm({...form, statut: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                {['loué','vacant','travaux'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium">Enregistrer</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition">Annuler</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>
      ) : biens.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucun bien enregistré. Ajoutez votre premier bien !</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {biens.map(bien => (
            <div key={bien.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{bien.nom}</h3>
                  <span className="text-xs capitalize text-gray-400">{bien.type}</span>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[bien.statut]}`}>{bien.statut}</span>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" />{bien.adresse}, {bien.ville}</div>
                <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-gray-400" />{formatMontant(bien.loyer_base)} / mois</div>
                <div className="text-gray-400">{bien.surface} m² · Charges: {formatMontant(bien.charges)}</div>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                <button className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <Pencil className="h-3.5 w-3.5" /> Modifier
                </button>
                <button onClick={() => handleDelete(bien.id)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium ml-auto">
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
