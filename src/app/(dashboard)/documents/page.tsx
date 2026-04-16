'use client'
import { useEffect, useState } from 'react'
import { FileText, Download, FileCheck, Mail, MessageSquare, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Locataire } from '@/types'
import { genererBail, genererRelance } from '@/lib/pdf'
import toast from 'react-hot-toast'

function supprimerFondBlanc(base64: string, seuil = 230): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = imageData.data
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        if (r >= seuil && g >= seuil && b >= seuil) d[i + 3] = 0
      }
      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.src = base64
  })
}

export default function DocumentsPage() {
  const [locataires, setLocataires] = useState<Locataire[]>([])
  const [loading, setLoading] = useState(true)
  const [logo, setLogo] = useState<string | undefined>()
  const [agence, setAgence] = useState<any>(null)
  const [sending, setSending] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const today = new Date().toISOString().split('T')[0]
      const [{ data }, { data: params }] = await Promise.all([
        supabase.from('locataires').select('*, bien:biens(*)')
          .or(`date_sortie.is.null,date_sortie.gt.${today}`),
        supabase.from('parametres').select('*').eq('user_id', user?.id).single(),
      ])
      setLocataires(data || [])
      if (params) setAgence(params)
      setLoading(false)

      try {
        const res = await fetch('/innoveagroup_logo.jpeg')
        if (res.ok) {
          const blob = await res.blob()
          const reader = new FileReader()
          reader.onloadend = async () => {
            const base64 = reader.result as string
            const detoure = await supprimerFondBlanc(base64)
            setLogo(detoure)
          }
          reader.readAsDataURL(blob)
        }
      } catch { /* pas de logo */ }
    }
    load()
  }, [])

  const handleBail = (loc: Locataire) => {
    genererBail(loc, (loc as any).bien, logo, agence)
    toast.success('Bail généré !')
  }

  const handleRelancePDF = async (loc: Locataire) => {
    const { data: impayes } = await supabase.from('paiements')
      .select('*').eq('locataire_id', loc.id).eq('statut', 'impayé')
    if (!impayes || impayes.length === 0) {
      toast.error('Aucun impayé pour ce locataire')
      return
    }
    genererRelance(loc, impayes)
    toast.success('Lettre de relance générée !')
  }

  const handleRelanceSMS = async (loc: Locataire, canal: 'sms' | 'whatsapp') => {
    if (!loc.telephone) {
      toast.error('Numéro de téléphone manquant pour ce locataire')
      return
    }
    const { data: impayes } = await supabase.from('paiements')
      .select('*').eq('locataire_id', loc.id).eq('statut', 'impayé')
    if (!impayes || impayes.length === 0) {
      toast.error('Aucun impayé pour ce locataire')
      return
    }

    const key = `${canal}-relance-${loc.id}`
    setSending(key)
    try {
      const endpoint = canal === 'sms' ? '/api/sms/relance' : '/api/whatsapp/relance'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locataire: loc, paiements: impayes, agence }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur envoi')
      toast.success(`Relance ${canal === 'sms' ? 'SMS' : 'WhatsApp'} envoyée !`)
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'envoi')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-500 mt-1">Générez vos documents officiels en PDF</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: 'Quittances de loyer', desc: 'Générées depuis la page Paiements (icône 📄)', icon: FileCheck, color: 'blue' },
          { title: 'Contrats de bail', desc: 'Générer un bail pour chaque locataire', icon: FileText, color: 'green' },
          { title: 'Lettres de relance', desc: 'PDF, SMS ou WhatsApp pour les impayés', icon: Download, color: 'red' },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.title} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className={`w-10 h-10 rounded-lg bg-${card.color}-100 flex items-center justify-center mb-3`}>
                <Icon className={`h-5 w-5 text-${card.color}-600`} />
              </div>
              <h3 className="font-semibold text-gray-900">{card.title}</h3>
              <p className="text-sm text-gray-500 mt-1 mb-4">{card.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Locataires + actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Générer un document par locataire</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Locataire</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium hidden md:table-cell">Bien</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium hidden lg:table-cell">Téléphone</th>
                  <th className="px-6 py-3 text-gray-600 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {locataires.map(loc => (
                  <tr key={loc.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">{loc.prenom} {loc.nom}</td>
                    <td className="px-6 py-4 text-gray-600 hidden md:table-cell">{(loc as any).bien?.nom || '-'}</td>
                    <td className="px-6 py-4 text-gray-500 hidden lg:table-cell">
                      {loc.telephone ? (
                        <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{loc.telephone}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">Non renseigné</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        {/* Bail PDF */}
                        <button onClick={() => handleBail(loc)}
                          className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition font-medium">
                          <FileText className="h-3.5 w-3.5" /> Bail
                        </button>
                        {/* Relance PDF */}
                        <button onClick={() => handleRelancePDF(loc)}
                          className="flex items-center gap-1.5 text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition font-medium">
                          <Download className="h-3.5 w-3.5" /> PDF
                        </button>
                        {/* Relance SMS */}
                        <button
                          onClick={() => handleRelanceSMS(loc, 'sms')}
                          disabled={sending === `sms-relance-${loc.id}`}
                          className="flex items-center gap-1.5 text-xs bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition font-medium disabled:opacity-50">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {sending === `sms-relance-${loc.id}` ? '...' : 'SMS'}
                        </button>
                        {/* Relance WhatsApp */}
                        <button
                          onClick={() => handleRelanceSMS(loc, 'whatsapp')}
                          disabled={sending === `whatsapp-relance-${loc.id}`}
                          className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition font-medium disabled:opacity-50">
                          <Mail className="h-3.5 w-3.5" />
                          {sending === `whatsapp-relance-${loc.id}` ? '...' : 'WA'}
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
    </div>
  )
}
