'use client'
import { useEffect, useState } from 'react'
import { Plus, Building2, MapPin, DollarSign, Pencil, Trash2, Moon, Home, X, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Bien } from '@/types'
import { formatMontant, isLocataireActif } from '@/lib/utils'

const statusColors: Record<string, string> = {
  'loué': 'bg-green-100 text-green-700',
  'vacant': 'bg-yellow-100 text-yellow-700',
  'travaux': 'bg-gray-100 text-gray-700',
}

const TYPES_BIEN = ['studio', 'appartement', 'maison', 'villa', 'bureau', 'commerce', 'terrain']

const EMPTY_FORM = {
  nom: '', adresse: '', ville: 'Conakry', type: 'appartement',
  mode_location: 'appartement',
  surface: '', nombre_pieces: '', etage: '', description: '',
  date_disponibilite: '', statut: 'vacant',
  // équipements
  meuble: false, parking: false, ascenseur: false, gardien: false,
  eau_incluse: false, electricite_incluse: false, internet_inclus: false, climatisation: false,
  // appartement
  loyer_base: '', charges: '0', duree_min_mois: '', depot_garantie_mois: '',
  // airbnb
  prix_nuit: '', duree_min_nuits: '', max_voyageurs: '', heure_checkin: '', heure_checkout: '', regles_maison: '',
}

type FormState = typeof EMPTY_FORM

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder = '' }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
    />
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition">
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>}
    </div>
  )
}

export default function BiensPage() {
  const [biens, setBiens] = useState<Bien[]>([])
  const [bienIdsActifs, setBienIdsActifs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingBien, setEditingBien] = useState<Bien | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const supabase = createClient()

  const fetchBiens = async () => {
    const [{ data }, { data: locs }] = await Promise.all([
      supabase.from('biens').select('*').order('created_at', { ascending: false }),
      supabase.from('locataires').select('bien_id, date_sortie'),
    ])
    setBiens(data || [])
    const actifs = new Set((locs || []).filter(isLocataireActif).map(l => l.bien_id).filter(Boolean))
    setBienIdsActifs(actifs)
    setLoading(false)
  }

  useEffect(() => { fetchBiens() }, [])

  const set = (key: keyof FormState, value: string | boolean) => setForm(f => ({ ...f, [key]: value }))

  const openAdd = () => { setEditingBien(null); setForm(EMPTY_FORM); setSubmitError(''); setShowModal(true) }
  const openEdit = (bien: Bien) => {
    setEditingBien(bien)
    setForm({
      nom: bien.nom, adresse: bien.adresse, ville: bien.ville, type: bien.type,
      mode_location: bien.mode_location,
      surface: bien.surface?.toString() || '', nombre_pieces: bien.nombre_pieces?.toString() || '',
      etage: bien.etage?.toString() || '', description: bien.description || '',
      date_disponibilite: bien.date_disponibilite || '', statut: bien.statut,
      meuble: bien.meuble || false, parking: bien.parking || false, ascenseur: bien.ascenseur || false,
      gardien: bien.gardien || false, eau_incluse: bien.eau_incluse || false,
      electricite_incluse: bien.electricite_incluse || false, internet_inclus: bien.internet_inclus || false,
      climatisation: bien.climatisation || false,
      loyer_base: bien.loyer_base?.toString() || '', charges: bien.charges?.toString() || '0',
      duree_min_mois: bien.duree_min_mois?.toString() || '', depot_garantie_mois: bien.depot_garantie_mois?.toString() || '',
      prix_nuit: bien.prix_nuit?.toString() || '', duree_min_nuits: bien.duree_min_nuits?.toString() || '',
      max_voyageurs: bien.max_voyageurs?.toString() || '', heure_checkin: bien.heure_checkin || '',
      heure_checkout: bien.heure_checkout || '', regles_maison: bien.regles_maison || '',
    })
    setShowModal(true)
  }

  const toNum = (v: string) => v ? Number(v) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()

    const payload: Record<string, unknown> = {
      nom: form.nom, adresse: form.adresse, ville: form.ville, type: form.type,
      mode_location: form.mode_location, statut: form.statut, user_id: user?.id,
      surface: toNum(form.surface), nombre_pieces: toNum(form.nombre_pieces),
      etage: toNum(form.etage), description: form.description || null,
      date_disponibilite: form.date_disponibilite || null,
      meuble: form.meuble, parking: form.parking, ascenseur: form.ascenseur,
      gardien: form.gardien, eau_incluse: form.eau_incluse, electricite_incluse: form.electricite_incluse,
      internet_inclus: form.internet_inclus, climatisation: form.climatisation,
    }

    if (form.mode_location === 'appartement') {
      payload.loyer_base = toNum(form.loyer_base)
      payload.charges = toNum(form.charges)
      payload.duree_min_mois = toNum(form.duree_min_mois)
      payload.depot_garantie_mois = toNum(form.depot_garantie_mois)
    } else {
      payload.prix_nuit = toNum(form.prix_nuit)
      payload.duree_min_nuits = toNum(form.duree_min_nuits)
      payload.max_voyageurs = toNum(form.max_voyageurs)
      payload.heure_checkin = form.heure_checkin || null
      payload.heure_checkout = form.heure_checkout || null
      payload.regles_maison = form.regles_maison || null
    }

    let error
    if (editingBien) {
      ({ error } = await supabase.from('biens').update(payload).eq('id', editingBien.id))
    } else {
      ({ error } = await supabase.from('biens').insert(payload))
    }

    setSubmitting(false)
    if (error) {
      setSubmitError(error.message)
      return
    }
    setShowModal(false)
    fetchBiens()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce bien ?')) return
    await supabase.from('biens').delete().eq('id', id)
    fetchBiens()
  }

  const isAirbnb = form.mode_location === 'airbnb'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Biens</h1>
          <p className="text-gray-500 mt-1">{biens.length} bien(s) enregistré(s)</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition text-sm font-medium">
          <Plus className="h-4 w-4" /> Ajouter un bien
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
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
                <div className="flex items-start gap-2">
                  <div className={`p-1.5 rounded-lg ${bien.mode_location === 'airbnb' ? 'bg-pink-100' : 'bg-blue-100'}`}>
                    {bien.mode_location === 'airbnb' ? <Moon className="h-4 w-4 text-pink-600" /> : <Home className="h-4 w-4 text-blue-600" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 leading-tight">{bien.nom}</h3>
                    <span className="text-xs capitalize text-gray-400">{bien.type} · {bien.mode_location === 'airbnb' ? 'Airbnb' : 'Location longue durée'}</span>
                  </div>
                </div>
                {(() => {
                  const statut = bienIdsActifs.has(bien.id) ? 'loué' : bien.statut
                  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize shrink-0 ${statusColors[statut]}`}>{statut}</span>
                })()}
              </div>
              <div className="space-y-1.5 text-sm text-gray-600">
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400 shrink-0" />{bien.adresse}, {bien.ville}</div>
                {bien.mode_location === 'airbnb' ? (
                  <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-gray-400" />{formatMontant(bien.prix_nuit || 0)} / nuit</div>
                ) : (
                  <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-gray-400" />{formatMontant(bien.loyer_base || 0)} / mois</div>
                )}
                <div className="text-gray-400 text-xs flex flex-wrap gap-2 mt-1">
                  {bien.surface && <span>{bien.surface} m²</span>}
                  {bien.nombre_pieces && <span>{bien.nombre_pieces} pièces</span>}
                  {bien.meuble && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Meublé</span>}
                  {bien.parking && <span className="bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded">Parking</span>}
                  {bien.climatisation && <span className="bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded">Clim</span>}
                </div>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                <button onClick={() => openEdit(bien)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
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

      {/* Modal formulaire */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">{editingBien ? 'Modifier le bien' : 'Nouveau bien'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              {/* Choix du mode de location */}
              <div className="grid grid-cols-2 gap-3">
                {(['appartement', 'airbnb'] as const).map(mode => (
                  <button key={mode} type="button" onClick={() => set('mode_location', mode)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${form.mode_location === mode ? (mode === 'airbnb' ? 'border-pink-500 bg-pink-50' : 'border-blue-500 bg-blue-50') : 'border-gray-200 hover:border-gray-300'}`}>
                    {mode === 'airbnb' ? <Moon className={`h-6 w-6 ${form.mode_location === mode ? 'text-pink-500' : 'text-gray-400'}`} /> : <Home className={`h-6 w-6 ${form.mode_location === mode ? 'text-blue-500' : 'text-gray-400'}`} />}
                    <div>
                      <p className="font-semibold text-sm">{mode === 'airbnb' ? 'Airbnb / Court séjour' : 'Location longue durée'}</p>
                      <p className="text-xs text-gray-500">{mode === 'airbnb' ? 'Paiement à la nuit' : 'Paiement au mois'}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Informations générales */}
              <Section title="Informations générales">
                <Field label="Nom du bien *">
                  <Input value={form.nom} onChange={v => set('nom', v)} placeholder="Ex: Appartement Kaloum T3" />
                </Field>
                <Field label="Type de bien">
                  <select value={form.type} onChange={e => set('type', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                    {TYPES_BIEN.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </Field>
                <Field label="Adresse *">
                  <Input value={form.adresse} onChange={v => set('adresse', v)} placeholder="Rue, numéro" />
                </Field>
                <Field label="Ville *">
                  <Input value={form.ville} onChange={v => set('ville', v)} placeholder="Conakry" />
                </Field>
                <Field label="Surface (m²)">
                  <Input value={form.surface} onChange={v => set('surface', v)} type="number" placeholder="65" />
                </Field>
                <Field label="Nombre de pièces">
                  <Input value={form.nombre_pieces} onChange={v => set('nombre_pieces', v)} type="number" placeholder="3" />
                </Field>
                <Field label="Étage">
                  <Input value={form.etage} onChange={v => set('etage', v)} type="number" placeholder="2" />
                </Field>
                <Field label="Statut">
                  <select value={form.statut} onChange={e => set('statut', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                    {['loué', 'vacant', 'travaux'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Date de disponibilité">
                  <Input value={form.date_disponibilite} onChange={v => set('date_disponibilite', v)} type="date" />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Description">
                    <textarea value={form.description} onChange={e => set('description', e.target.value)}
                      placeholder="Description du bien, caractéristiques particulières..."
                      rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none" />
                  </Field>
                </div>
              </Section>

              {/* Tarification */}
              <Section title={isAirbnb ? 'Tarification (Airbnb)' : 'Tarification (Location mensuelle)'}>
                {isAirbnb ? (
                  <>
                    <Field label="Prix par nuit (GNF) *">
                      <Input value={form.prix_nuit} onChange={v => set('prix_nuit', v)} type="number" placeholder="150000" />
                    </Field>
                    <Field label="Durée minimum (nuits)">
                      <Input value={form.duree_min_nuits} onChange={v => set('duree_min_nuits', v)} type="number" placeholder="2" />
                    </Field>
                    <Field label="Nombre max de voyageurs">
                      <Input value={form.max_voyageurs} onChange={v => set('max_voyageurs', v)} type="number" placeholder="4" />
                    </Field>
                    <div />
                    <Field label="Heure de check-in">
                      <Input value={form.heure_checkin} onChange={v => set('heure_checkin', v)} type="time" />
                    </Field>
                    <Field label="Heure de check-out">
                      <Input value={form.heure_checkout} onChange={v => set('heure_checkout', v)} type="time" />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Règles de la maison">
                        <textarea value={form.regles_maison} onChange={e => set('regles_maison', e.target.value)}
                          placeholder="Non-fumeur, pas d'animaux, fêtes interdites..."
                          rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none" />
                      </Field>
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="Loyer mensuel (GNF) *">
                      <Input value={form.loyer_base} onChange={v => set('loyer_base', v)} type="number" placeholder="1500000" />
                    </Field>
                    <Field label="Charges mensuelles (GNF)">
                      <Input value={form.charges} onChange={v => set('charges', v)} type="number" placeholder="50000" />
                    </Field>
                    <Field label="Durée minimum (mois)">
                      <Input value={form.duree_min_mois} onChange={v => set('duree_min_mois', v)} type="number" placeholder="12" />
                    </Field>
                    <Field label="Dépôt de garantie (mois)">
                      <Input value={form.depot_garantie_mois} onChange={v => set('depot_garantie_mois', v)} type="number" placeholder="2" />
                    </Field>
                  </>
                )}
              </Section>

              {/* Équipements */}
              <Section title="Équipements & Services" defaultOpen={false}>
                <Toggle label="Meublé" checked={form.meuble} onChange={v => set('meuble', v)} />
                <Toggle label="Parking" checked={form.parking} onChange={v => set('parking', v)} />
                <Toggle label="Ascenseur" checked={form.ascenseur} onChange={v => set('ascenseur', v)} />
                <Toggle label="Gardien / Vigile" checked={form.gardien} onChange={v => set('gardien', v)} />
                <Toggle label="Eau incluse" checked={form.eau_incluse} onChange={v => set('eau_incluse', v)} />
                <Toggle label="Électricité incluse" checked={form.electricite_incluse} onChange={v => set('electricite_incluse', v)} />
                <Toggle label="Internet inclus" checked={form.internet_inclus} onChange={v => set('internet_inclus', v)} />
                <Toggle label="Climatisation" checked={form.climatisation} onChange={v => set('climatisation', v)} />
              </Section>

              {/* Actions */}
              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{submitError}</div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50">
                  {submitting ? 'Enregistrement...' : editingBien ? 'Enregistrer les modifications' : 'Ajouter le bien'}
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
