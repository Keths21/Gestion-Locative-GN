'use client'
import { useEffect, useState } from 'react'
import { FileText, Download, FileCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Locataire, Bien } from '@/types'
import { genererBail, genererRelance } from '@/lib/pdf'
import toast from 'react-hot-toast'

export default function DocumentsPage() {
  const [locataires, setLocataires] = useState<Locataire[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('locataires').select('*, bien:biens(*)').is('date_sortie', null)
      setLocataires(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const handleBail = (loc: Locataire) => {
    genererBail(loc, (loc as any).bien)
    toast.success('Bail généré !')
  }

  const handleRelance = async (loc: Locataire) => {
    const { data: impayes } = await supabase.from('paiements')
      .select('*').eq('locataire_id', loc.id).eq('statut', 'impayé')
    if (!impayes || impayes.length === 0) {
      toast.error('Aucun impayé pour ce locataire')
      return
    }
    genererRelance(loc, impayes)
    toast.success('Lettre de relance générée !')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-500 mt-1">Générez vos documents officiels en PDF</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: 'Quittances de loyer', desc: 'Générées depuis la page Paiements (icône 📄)', icon: FileCheck, color: 'blue', action: null },
          { title: 'Contrats de bail', desc: 'Générer un bail pour chaque locataire', icon: FileText, color: 'green', action: 'bail' },
          { title: 'Lettres de relance', desc: 'Pour les locataires avec impayés', icon: Download, color: 'red', action: 'relance' },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.title} className={`bg-white rounded-xl border border-gray-100 p-5 shadow-sm`}>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Locataire</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium hidden md:table-cell">Bien</th>
                <th className="px-6 py-3 text-gray-600 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {locataires.map(loc => (
                <tr key={loc.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-medium text-gray-900">{loc.prenom} {loc.nom}</td>
                  <td className="px-6 py-4 text-gray-600 hidden md:table-cell">{(loc as any).bien?.nom || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => handleBail(loc)}
                        className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition font-medium">
                        <FileText className="h-3.5 w-3.5" /> Bail PDF
                      </button>
                      <button onClick={() => handleRelance(loc)}
                        className="flex items-center gap-1.5 text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition font-medium">
                        <Download className="h-3.5 w-3.5" /> Relance PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
