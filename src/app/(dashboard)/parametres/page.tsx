'use client'
import { useEffect, useState } from 'react'
import { Settings, Save, Building2, Mail, Phone, MapPin, DollarSign, Loader2, User, Globe, FileText, Shield, Eye, CheckCircle, AlertCircle, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const DEVISES = [
  { value: 'GNF', label: 'GNF — Franc Guinéen' },
  { value: 'USD', label: 'USD — Dollar américain' },
  { value: 'EUR', label: 'EUR — Euro' },
]

const EMPTY_FORM = {
  nom_agence: '', email: '', telephone: '', adresse: '', ville: 'Conakry',
  devise: 'GNF', site_web: '', description: '', rccm: '', nif: '',
}

function InputField({ label, icon: Icon, value, onChange, type = 'text', placeholder = '' }: {
  label: string; icon: any; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type={type} value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primaire outline-none text-sm"
        />
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-gray-50">
        <Icon className="h-4 w-4 text-primaire" />
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function CompletionBar({ form }: { form: typeof EMPTY_FORM }) {
  const champs = [
    { key: 'nom_agence', label: 'Nom agence' },
    { key: 'email', label: 'Email' },
    { key: 'telephone', label: 'Téléphone' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'ville', label: 'Ville' },
    { key: 'description', label: 'Description' },
    { key: 'site_web', label: 'Site web' },
  ]
  const remplis = champs.filter(c => (form as any)[c.key]).length
  const pct = Math.round((remplis / champs.length) * 100)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">Profil complété</span>
        <span className={`text-sm font-bold ${pct === 100 ? 'text-green-600' : pct >= 60 ? 'text-primaire' : 'text-yellow-600'}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-primaire' : 'bg-yellow-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {champs.map(c => {
          const ok = !!(form as any)[c.key]
          return (
            <span key={c.key} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              {ok ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {c.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function AperçuDocument({ form }: { form: typeof EMPTY_FORM }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-gray-50">
        <Eye className="h-4 w-4 text-primaire" />
        <h2 className="font-semibold text-gray-900 text-sm">Aperçu dans les documents PDF</h2>
      </div>
      <div className="p-6">
        <div className="border border-dashed border-gray-200 rounded-lg p-4 bg-gray-50 text-sm space-y-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 bg-primaire rounded-lg flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900">{form.nom_agence || 'Nom de votre agence'}</p>
              <p className="text-xs text-gray-500">Bailleur / Agence immobilière</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
            {form.adresse && <span>📍 {form.adresse}</span>}
            {form.ville && <span>🏙 {form.ville}</span>}
            {form.telephone && <span>📞 {form.telephone}</span>}
            {form.email && <span>✉️ {form.email}</span>}
            {form.site_web && <span>🌐 {form.site_web}</span>}
            {form.rccm && <span>📋 RCCM : {form.rccm}</span>}
            {form.nif && <span>🔖 NIF : {form.nif}</span>}
          </div>
          {form.description && (
            <p className="text-xs text-gray-500 italic mt-2 border-t border-gray-200 pt-2">{form.description}</p>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">Ces informations apparaissent dans les bails et quittances</p>
      </div>
    </div>
  )
}

export default function ParametresPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function fetchParams() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || '')
      setUserId(user?.id || '')

      const { data } = await supabase.from('parametres').select('*').eq('user_id', user?.id).single()
      if (data) {
        setForm({
          nom_agence: data.nom_agence || '',
          email: data.email || '',
          telephone: data.telephone || '',
          adresse: data.adresse || '',
          ville: data.ville || 'Conakry',
          devise: data.devise || 'GNF',
          site_web: data.site_web || '',
          description: data.description || '',
          rccm: data.rccm || '',
          nif: data.nif || '',
        })
      }
      setLoading(false)
    }
    fetchParams()
  }, [])

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('parametres').upsert(
      { user_id: userId, ...form, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    if (error) { toast.error('Erreur : ' + error.message); setSaving(false); return }
    toast.success('Paramètres sauvegardés !')
    setSaving(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primaire" />
    </div>
  )

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500 mt-1">Configurez les informations de votre agence</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Colonne gauche */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">

            {/* Identité agence */}
            <Section title="Identité de l'agence" icon={Building2}>
              <div className="space-y-4">
                <InputField label="Nom de l'agence *" icon={Building2} value={form.nom_agence} onChange={v => set('nom_agence', v)} placeholder="InnoveaGroup Immobilier" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={form.description} onChange={e => set('description', e.target.value)}
                    placeholder="Spécialiste de la gestion locative à Conakry..."
                    rows={2} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primaire outline-none text-sm resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="RCCM" icon={FileText} value={form.rccm} onChange={v => set('rccm', v)} placeholder="GN-CON-2024-B-1234" />
                  <InputField label="NIF" icon={Shield} value={form.nif} onChange={v => set('nif', v)} placeholder="123456789" />
                </div>
              </div>
            </Section>

            {/* Contact */}
            <Section title="Coordonnées" icon={Phone}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Email professionnel" icon={Mail} value={form.email} onChange={v => set('email', v)} type="email" placeholder="contact@agence.com" />
                  <InputField label="Téléphone" icon={Phone} value={form.telephone} onChange={v => set('telephone', v)} placeholder="+224 620 00 00 00" />
                </div>
                <InputField label="Site web" icon={Globe} value={form.site_web} onChange={v => set('site_web', v)} placeholder="www.monagence.com" />
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Adresse" icon={MapPin} value={form.adresse} onChange={v => set('adresse', v)} placeholder="Rue, Quartier" />
                  <InputField label="Ville" icon={MapPin} value={form.ville} onChange={v => set('ville', v)} placeholder="Conakry" />
                </div>
              </div>
            </Section>

            {/* Préférences */}
            <Section title="Préférences" icon={Settings}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Devise principale</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select value={form.devise} onChange={e => set('devise', e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primaire outline-none text-sm appearance-none">
                    {DEVISES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>
            </Section>

            <button type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-primaire hover:bg-primaire-appui text-white font-semibold py-3 rounded-lg transition disabled:opacity-50">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {saving ? 'Sauvegarde en cours...' : 'Sauvegarder les paramètres'}
            </button>
          </form>
        </div>

        {/* Colonne droite */}
        <div className="space-y-6">

          {/* Complétion */}
          <CompletionBar form={form} />

          {/* Aperçu PDF */}
          <AperçuDocument form={form} />

          {/* Compte */}
          <Section title="Mon compte" icon={User}>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-400 mb-0.5">Email de connexion</p>
                <p className="text-sm font-medium text-gray-900 truncate">{userEmail}</p>
              </div>
              <button onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition text-sm font-medium">
                <LogOut className="h-4 w-4" /> Se déconnecter
              </button>
            </div>
          </Section>

          {/* Emails */}
          <div className="bg-primaire-tenue border border-primaire/20 rounded-xl p-5">
            <h3 className="font-semibold text-primaire mb-3 flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4" /> Emails — Resend
            </h3>
            <ol className="space-y-1.5 text-xs text-primaire">
              <li className="flex gap-2"><span className="font-bold">1.</span> Crée un compte sur <strong>resend.com</strong></li>
              <li className="flex gap-2"><span className="font-bold">2.</span> Dashboard → API Keys → Create</li>
              <li className="flex gap-2"><span className="font-bold">3.</span> Copie la clé dans <code className="bg-primaire-tenue px-1 rounded">.env.local</code></li>
              <li className="flex gap-2"><span className="font-bold">4.</span> <code className="bg-primaire-tenue px-1 rounded">RESEND_API_KEY=re_xxx</code></li>
              <li className="flex gap-2"><span className="font-bold">5.</span> Redémarre <code className="bg-primaire-tenue px-1 rounded">npm run dev</code></li>
            </ol>
            <p className="text-xs text-primaire mt-3 font-medium">3 000 emails/mois gratuits</p>
          </div>
        </div>
      </div>
    </div>
  )
}
