'use client'
import { useEffect, useState } from 'react'
import { Settings, Save, Building2, Mail, Phone, MapPin, DollarSign, Loader2, User } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function ParametresPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [form, setForm] = useState({
    nom_agence: '',
    email: '',
    telephone: '',
    adresse: '',
    ville: 'Conakry',
    devise: 'GNF',
  })
  const supabase = createClient()

  useEffect(() => {
    async function fetchParams() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || '')

      const { data } = await supabase.from('parametres').select('*').eq('user_id', user?.id).single()
      if (data) {
        setForm({
          nom_agence: data.nom_agence || '',
          email: data.email || '',
          telephone: data.telephone || '',
          adresse: data.adresse || '',
          ville: data.ville || 'Conakry',
          devise: data.devise || 'GNF',
        })
      }
      setLoading(false)
    }
    fetchParams()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('parametres').upsert({
      user_id: user?.id,
      ...form,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

    if (error) { toast.error('Erreur lors de la sauvegarde'); setSaving(false); return }
    toast.success('Paramètres sauvegardés !')
    setSaving(false)
  }

  const fields = [
    { label: 'Nom de l\'agence', key: 'nom_agence', icon: Building2, placeholder: 'Mon Agence Immobilière' },
    { label: 'Email professionnel', key: 'email', icon: Mail, placeholder: 'contact@monagence.com', type: 'email' },
    { label: 'Téléphone', key: 'telephone', icon: Phone, placeholder: '+224 620 00 00 00' },
    { label: 'Adresse', key: 'adresse', icon: MapPin, placeholder: 'Rue, Quartier' },
    { label: 'Ville', key: 'ville', icon: MapPin, placeholder: 'Conakry' },
  ]

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500 mt-1">Configurez les informations de votre agence</p>
      </div>

      {/* Infos compte */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900">Mon compte</h2>
        </div>
        <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
          <span className="font-medium">Email de connexion :</span> {userEmail}
        </div>
      </div>

      {/* Infos agence */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900">Informations de l&apos;agence</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {fields.map(f => {
            const Icon = f.icon
            return (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <div className="relative">
                  <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={f.type || 'text'}
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
              </div>
            )
          })}

          {/* Devise */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Devise principale</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={form.devise}
                onChange={e => setForm({ ...form, devise: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm appearance-none"
              >
                <option value="GNF">GNF - Franc Guinéen</option>
                <option value="USD">USD - Dollar américain</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
          </button>
        </form>
      </div>

      {/* Guide Resend */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Mail className="h-5 w-5" /> Configuration emails (Resend)
        </h3>
        <ol className="space-y-2 text-sm text-blue-800">
          <li className="flex gap-2"><span className="font-bold">1.</span> Va sur <a href="https://resend.com" target="_blank" className="underline font-medium">resend.com</a> et crée un compte gratuit</li>
          <li className="flex gap-2"><span className="font-bold">2.</span> Dans le dashboard → <strong>API Keys</strong> → <strong>Create API Key</strong></li>
          <li className="flex gap-2"><span className="font-bold">3.</span> Copie la clé et colle-la dans <code className="bg-blue-100 px-1 rounded">.env.local</code></li>
          <li className="flex gap-2"><span className="font-bold">4.</span> <code className="bg-blue-100 px-1 rounded">RESEND_API_KEY=re_ta_clé_ici</code></li>
          <li className="flex gap-2"><span className="font-bold">5.</span> Redémarre le serveur : <code className="bg-blue-100 px-1 rounded">npm run dev</code></li>
        </ol>
        <p className="text-xs text-blue-600 mt-3">✅ Resend offre 3 000 emails/mois gratuits — largement suffisant pour démarrer !</p>
      </div>
    </div>
  )
}
