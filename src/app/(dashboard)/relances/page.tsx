'use client'
import { useEffect, useState } from 'react'
import { Bell, Mail, AlertTriangle, CheckCircle, Send, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatMontant } from '@/lib/utils'
import toast from 'react-hot-toast'

type LocataireImpayes = {
  locataire: any
  paiements: any[]
  total: number
}

export default function RelancesPage() {
  const [impayes, setImpayes] = useState<LocataireImpayes[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [agence, setAgence] = useState<any>(null)
  const supabase = createClient()

  const fetchData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const [{ data: paiements }, { data: params }] = await Promise.all([
      supabase.from('paiements').select('*, locataire:locataires(*), bien:biens(*)').eq('statut', 'impayé'),
      supabase.from('parametres').select('*').eq('user_id', user?.id).single()
    ])

    // Grouper par locataire
    const grouped: Record<string, LocataireImpayes> = {}
    for (const p of paiements || []) {
      const id = p.locataire?.id
      if (!id) continue
      if (!grouped[id]) grouped[id] = { locataire: p.locataire, paiements: [], total: 0 }
      grouped[id].paiements.push(p)
      grouped[id].total += p.montant
    }

    setImpayes(Object.values(grouped))
    setAgence(params)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const envoyerRelance = async (item: LocataireImpayes) => {
    if (!item.locataire.email) {
      toast.error('Ce locataire n\'a pas d\'email enregistré')
      return
    }
    setSending(item.locataire.id)
    try {
      const res = await fetch('/api/email/relance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locataire: item.locataire, paiements: item.paiements, agence })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message || 'Erreur')
      toast.success(`Relance envoyée à ${item.locataire.email} !`)
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'envoi')
    } finally {
      setSending(null)
    }
  }

  const totalImpayes = impayes.reduce((s, i) => s + i.total, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relances</h1>
          <p className="text-gray-500 mt-1">{impayes.length} locataire(s) avec impayés</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition">
          <RefreshCw className="h-4 w-4" /> Actualiser
        </button>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-sm text-red-600 font-medium">Total impayés</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{formatMontant(totalImpayes)}</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
          <p className="text-sm text-orange-600 font-medium">Locataires concernés</p>
          <p className="text-2xl font-bold text-orange-700 mt-1">{impayes.length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-sm text-blue-600 font-medium">Paiements en retard</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{impayes.reduce((s, i) => s + i.paiements.length, 0)}</p>
        </div>
      </div>

      {/* Avertissement config email */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-yellow-800">Configuration email requise</p>
          <p className="text-xs text-yellow-700 mt-1">
            Pour envoyer des emails, ajoute ta clé <code className="bg-yellow-100 px-1 rounded">RESEND_API_KEY</code> dans <code className="bg-yellow-100 px-1 rounded">.env.local</code>.
            Crée ton compte gratuit sur <a href="https://resend.com" target="_blank" className="underline font-medium">resend.com</a> → API Keys → Create API Key.
          </p>
        </div>
      </div>

      {/* Liste des impayés */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : impayes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <p className="text-gray-700 font-semibold">Aucun impayé 🎉</p>
          <p className="text-gray-400 text-sm mt-1">Tous les loyers sont à jour !</p>
        </div>
      ) : (
        <div className="space-y-4">
          {impayes.map(item => (
            <div key={item.locataire.id} className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <span className="text-red-600 font-bold text-sm">
                      {item.locataire.prenom?.[0]}{item.locataire.nom?.[0]}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{item.locataire.prenom} {item.locataire.nom}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {item.locataire.email || <span className="text-red-400">Pas d&apos;email</span>}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-red-600 text-lg">{formatMontant(item.total)}</p>
                  <p className="text-xs text-gray-400">{item.paiements.length} mois impayé(s)</p>
                </div>
              </div>

              {/* Liste des mois impayés */}
              <div className="px-5 py-3 bg-red-50">
                <div className="flex flex-wrap gap-2">
                  {item.paiements.map(p => (
                    <span key={p.id} className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-medium">
                      {p.mois_concerne} — {formatMontant(p.montant)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 flex gap-3">
                <button
                  onClick={() => envoyerRelance(item)}
                  disabled={sending === item.locataire.id || !item.locataire.email}
                  className="flex items-center gap-2 bg-red-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending === item.locataire.id
                    ? <><RefreshCw className="h-4 w-4 animate-spin" /> Envoi...</>
                    : <><Send className="h-4 w-4" /> Envoyer relance par email</>
                  }
                </button>
                <button className="flex items-center gap-2 text-sm border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition text-gray-600">
                  <Bell className="h-4 w-4" /> Marquer comme contacté
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
