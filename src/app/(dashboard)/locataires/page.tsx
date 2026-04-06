'use client'
import { useEffect, useState } from 'react'
import { Plus, Users, Phone, Mail, Calendar, Building2, Trash2, Pencil, X, Search, Moon, Home, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Locataire, Bien } from '@/types'
import { formatDate, formatMontant, isLocataireActif } from '@/lib/utils'
import toast from 'react-hot-toast'

const EMPTY_FORM = {
  nom: '', prenom: '', email: '', telephone: '',
  bien_id: '', date_entree: '', date_sortie: '', depot_garantie: ''
}

function Avatar({ prenom, nom }: { prenom: string; nom: string }) {
  const initiales = `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase()
  const couleurs = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500']
  const idx = (prenom.charCodeAt(0) || 0) % couleurs.length
  return (
    <div className={`w-10 h-10 rounded-full ${couleurs[idx]} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
      {initiales}
    </div>
  )
}

export default function LocatairesPage() {
  const [locataires, setLocataires] = useState<Locataire[]>([])
  const [biens, setBiens] = useState<Bien[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Locataire | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const supabase = createClient()

  const fetchData = async () => {
    const [{ data: loc }, { data: bi }] = await Promise.all([
      supabase.from('locataires').select('*, bien:biens(*)').order('created_at', { ascending: false }),
      supabase.from('biens').select('*')
    ])
    setLocataires(loc || [])
    setBiens(bi || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setShowModal(true) }
  const openEdit = (loc: Locataire) => {
    setEditItem(loc)
    setForm({
      nom: loc.nom, prenom: loc.prenom, email: loc.email || '',
      telephone: loc.telephone || '', bien_id: loc.bien_id || '',
      date_entree: loc.date_entree, date_sortie: loc.date_sortie || '',
      depot_garantie: String(loc.depot_garantie || '')
    })
    setShowModal(true)
  }

  // Pour l'édition : afficher le bien actuel du locataire + les biens vacants
  const biensDisponibles = editItem
    ? biens.filter(b => b.statut === 'vacant' || b.id === editItem.bien_id)
    : biens.filter(b => b.statut === 'vacant')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      ...form,
      user_id: user?.id,
      depot_garantie: Number(form.depot_garantie) || 0,
      date_sortie: form.date_sortie || null,
    }

    if (editItem) {
      const ancienBienId = editItem.bien_id
      const { error } = await supabase.from('locataires').update(payload).eq('id', editItem.id)
      if (error) { toast.error('Erreur lors de la mise à jour'); setSubmitting(false); return }
      // Si le bien a changé, remettre l'ancien en vacant et passer le nouveau en loué
      if (form.bien_id !== ancienBienId) {
        if (ancienBienId) await supabase.from('biens').update({ statut: 'vacant' }).eq('id', ancienBienId)
        if (form.bien_id) await supabase.from('biens').update({ statut: 'loué' }).eq('id', form.bien_id)
      }
      // Libérer le bien seulement si date_sortie est dans le passé
      if (form.date_sortie && form.bien_id) {
        const estSorti = new Date(form.date_sortie) <= new Date()
        await supabase.from('biens').update({ statut: estSorti ? 'vacant' : 'loué' }).eq('id', form.bien_id)
      }
      toast.success('Locataire mis à jour !')
    } else {
      const { error } = await supabase.from('locataires').insert(payload)
      if (error) { toast.error('Erreur lors de l\'ajout'); setSubmitting(false); return }
      if (form.bien_id) await supabase.from('biens').update({ statut: 'loué' }).eq('id', form.bien_id)
      toast.success('Locataire ajouté !')
    }

    setSubmitting(false)
    setShowModal(false)
    fetchData()
  }

  const handleDelete = async (id: string, bien_id?: string) => {
    if (!confirm('Supprimer ce locataire ?')) return
    await supabase.from('locataires').delete().eq('id', id)
    if (bien_id) await supabase.from('biens').update({ statut: 'vacant' }).eq('id', bien_id)
    toast.success('Locataire supprimé')
    fetchData()
  }

  const filtered = locataires.filter(l =>
    `${l.prenom} ${l.nom} ${l.telephone} ${l.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const actifs = locataires.filter(l => isLocataireActif(l)).length
  const sortis = locataires.filter(l => !isLocataireActif(l)).length

  const getBienMode = (loc: Locataire) => (loc as any).bien?.mode_location

  const inputCls = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm'

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Locataires</h1>
          <p className="text-gray-500 mt-1">{locataires.length} locataire(s) enregistré(s)</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition text-sm font-medium">
          <Plus className="h-4 w-4" /> Ajouter un locataire
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: locataires.length, icon: Users, color: 'blue' },
          { label: 'Actifs', value: actifs, icon: Home, color: 'green' },
          { label: 'Sortis', value: sortis, icon: LogOut, color: 'gray' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-${color}-100`}>
              <Icon className={`h-5 w-5 text-${color}-600`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text" placeholder="Rechercher par nom, téléphone, email..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">{search ? 'Aucun résultat trouvé.' : 'Aucun locataire enregistré.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(loc => {
            const actif = isLocataireActif(loc)
            const mode = getBienMode(loc)
            return (
              <div key={loc.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition">
                {/* Top */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Avatar prenom={loc.prenom} nom={loc.nom} />
                    <div>
                      <p className="font-semibold text-gray-900">{loc.prenom} {loc.nom}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {actif ? 'Actif' : 'Sorti'}
                        </span>
                        {mode && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${mode === 'airbnb' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>
                            {mode === 'airbnb' ? <Moon className="h-2.5 w-2.5" /> : <Home className="h-2.5 w-2.5" />}
                            {mode === 'airbnb' ? 'Airbnb' : 'Mensuel'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Infos */}
                <div className="space-y-1.5 text-sm text-gray-600 mb-3">
                  {loc.telephone && (
                    <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />{loc.telephone}</div>
                  )}
                  {loc.email && (
                    <div className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" /><span className="truncate">{loc.email}</span></div>
                  )}
                  {(loc as any).bien?.nom && (
                    <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />{(loc as any).bien.nom}</div>
                  )}
                  <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    Entrée : {formatDate(loc.date_entree)}
                    {loc.date_sortie && <> · Sortie : {formatDate(loc.date_sortie)}</>}
                  </div>
                  {loc.depot_garantie > 0 && (
                    <div className="text-xs text-gray-400">Garantie : {formatMontant(loc.depot_garantie)}</div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button onClick={() => openEdit(loc)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    <Pencil className="h-3.5 w-3.5" /> Modifier
                  </button>
                  <button onClick={() => handleDelete(loc.id, loc.bien_id)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium ml-auto">
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">{editItem ? 'Modifier le locataire' : 'Nouveau locataire'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Identité */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Identité</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                    <input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Mamadou" required className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                    <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Diallo" required className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contact</p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                    <input value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="+224 620 00 00 00" type="tel" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemple.com" type="email" className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Bien & Dates */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Logement & Séjour</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bien associé</label>
                    <select value={form.bien_id} onChange={e => set('bien_id', e.target.value)} className={inputCls}>
                      <option value="">-- Sélectionner un bien --</option>
                      {biensDisponibles.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.nom} — {b.adresse} {b.mode_location === 'airbnb' ? '(Airbnb)' : '(Mensuel)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date d'entrée *</label>
                      <input value={form.date_entree} onChange={e => set('date_entree', e.target.value)} type="date" required className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date de sortie</label>
                      <input value={form.date_sortie} onChange={e => set('date_sortie', e.target.value)} type="date" className={inputCls} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Finances */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Finances</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dépôt de garantie (GNF)</label>
                  <input value={form.depot_garantie} onChange={e => set('depot_garantie', e.target.value)} type="number" placeholder="3 000 000" className={inputCls} />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50">
                  {submitting ? 'Enregistrement...' : editItem ? 'Enregistrer les modifications' : 'Ajouter le locataire'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-medium">
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
