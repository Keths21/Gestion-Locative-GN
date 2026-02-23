'use client'
import { useEffect, useState } from 'react'
import { Plus, Users, Phone, Mail, Calendar, Building2, Trash2, Pencil, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Locataire, Bien } from '@/types'
import { formatDate, formatMontant } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function LocatairesPage() {
  const [locataires, setLocataires] = useState<Locataire[]>([])
  const [biens, setBiens] = useState<Bien[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Locataire | null>(null)
  const [form, setForm] = useState({
    nom: '', prenom: '', email: '', telephone: '',
    bien_id: '', date_entree: '', depot_garantie: ''
  })
  const supabase = createClient()

  const fetchData = async () => {
    const [{ data: loc }, { data: bi }] = await Promise.all([
      supabase.from('locataires').select('*, bien:biens(*)').order('created_at', { ascending: false }),
      supabase.from('biens').select('*').eq('statut', 'vacant')
    ])
    setLocataires(loc || [])
    setBiens(bi || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const resetForm = () => {
    setForm({ nom: '', prenom: '', email: '', telephone: '', bien_id: '', date_entree: '', depot_garantie: '' })
    setEditItem(null)
    setShowForm(false)
  }

  const handleEdit = (loc: Locataire) => {
    setEditItem(loc)
    setForm({
      nom: loc.nom, prenom: loc.prenom, email: loc.email || '',
      telephone: loc.telephone || '', bien_id: loc.bien_id || '',
      date_entree: loc.date_entree, depot_garantie: String(loc.depot_garantie || '')
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    const payload = { ...form, user_id: user?.id, depot_garantie: Number(form.depot_garantie) }

    if (editItem) {
      const { error } = await supabase.from('locataires').update(payload).eq('id', editItem.id)
      if (error) { toast.error('Erreur lors de la mise à jour'); return }
      toast.success('Locataire mis à jour !')
    } else {
      const { error } = await supabase.from('locataires').insert(payload)
      if (error) { toast.error('Erreur lors de l\'ajout'); return }
      // Mettre le bien en "loué"
      if (form.bien_id) await supabase.from('biens').update({ statut: 'loué' }).eq('id', form.bien_id)
      toast.success('Locataire ajouté !')
    }
    resetForm()
    fetchData()
  }

  const handleDelete = async (id: string, bien_id?: string) => {
    if (!confirm('Supprimer ce locataire ?')) return
    await supabase.from('locataires').delete().eq('id', id)
    if (bien_id) await supabase.from('biens').update({ statut: 'vacant' }).eq('id', bien_id)
    toast.success('Locataire supprimé')
    fetchData()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Locataires</h1>
          <p className="text-gray-500 mt-1">{locataires.length} locataire(s) actif(s)</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Ajouter un locataire
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">{editItem ? 'Modifier le locataire' : 'Nouveau locataire'}</h2>
            <button onClick={resetForm}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Nom', key: 'nom', type: 'text', placeholder: 'Diallo' },
              { label: 'Prénom', key: 'prenom', type: 'text', placeholder: 'Mamadou' },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'email@example.com' },
              { label: 'Téléphone', key: 'telephone', type: 'tel', placeholder: '+224 620 00 00 00' },
              { label: 'Date d\'entrée', key: 'date_entree', type: 'date', placeholder: '' },
              { label: 'Dépôt de garantie (GNF)', key: 'depot_garantie', type: 'number', placeholder: '3000000' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input
                  type={f.type} placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required={['nom','prenom','date_entree'].includes(f.key)}
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bien associé</label>
              <select
                value={form.bien_id}
                onChange={e => setForm({ ...form, bien_id: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">-- Sélectionner un bien --</option>
                {biens.map(b => <option key={b.id} value={b.id}>{b.nom} - {b.adresse}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium">
                {editItem ? 'Mettre à jour' : 'Enregistrer'}
              </button>
              <button type="button" onClick={resetForm} className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : locataires.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucun locataire enregistré.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Locataire</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium hidden md:table-cell">Contact</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium hidden lg:table-cell">Bien</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium hidden lg:table-cell">Entrée</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium hidden xl:table-cell">Garantie</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {locataires.map(loc => (
                <tr key={loc.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{loc.prenom} {loc.nom}</div>
                    <div className="text-xs text-gray-400 md:hidden">{loc.telephone}</div>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <div className="flex items-center gap-1 text-gray-600"><Phone className="h-3.5 w-3.5" />{loc.telephone || '-'}</div>
                    <div className="flex items-center gap-1 text-gray-400 text-xs mt-0.5"><Mail className="h-3 w-3" />{loc.email || '-'}</div>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Building2 className="h-3.5 w-3.5 text-gray-400" />
                      {(loc as any).bien?.nom || <span className="text-gray-400">Non assigné</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      {formatDate(loc.date_entree)}
                    </div>
                  </td>
                  <td className="px-6 py-4 hidden xl:table-cell text-gray-600">
                    {formatMontant(loc.depot_garantie)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => handleEdit(loc)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(loc.id, loc.bien_id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
