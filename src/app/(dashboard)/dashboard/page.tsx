'use client'
import { useEffect, useState } from 'react'
import { Building2, Users, CreditCard, AlertTriangle, TrendingUp, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatMontant } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalBiens: 0,
    biensLoues: 0,
    totalLocataires: 0,
    loyersEncaisses: 0,
    loyersImpayes: 0,
    tauxOccupation: 0,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      const { data: biens } = await supabase.from('biens').select('*')
      const { data: locataires } = await supabase.from('locataires').select('*').is('date_sortie', null)
      const { data: paiements } = await supabase.from('paiements').select('*')

      const totalBiens = biens?.length || 0
      const biensLoues = biens?.filter(b => b.statut === 'loué').length || 0
      const loyersEncaisses = paiements?.filter(p => p.statut === 'payé').reduce((s, p) => s + p.montant, 0) || 0
      const loyersImpayes = paiements?.filter(p => p.statut === 'impayé').reduce((s, p) => s + p.montant, 0) || 0

      setStats({
        totalBiens,
        biensLoues,
        totalLocataires: locataires?.length || 0,
        loyersEncaisses,
        loyersImpayes,
        tauxOccupation: totalBiens > 0 ? Math.round((biensLoues / totalBiens) * 100) : 0,
      })
      setLoading(false)
    }
    fetchStats()
  }, [])

  const statCards = [
    { label: 'Total Biens', value: stats.totalBiens, icon: Building2, color: 'bg-blue-500', sub: `${stats.biensLoues} loués` },
    { label: 'Locataires actifs', value: stats.totalLocataires, icon: Users, color: 'bg-green-500', sub: `Taux: ${stats.tauxOccupation}%` },
    { label: 'Loyers encaissés', value: formatMontant(stats.loyersEncaisses), icon: CreditCard, color: 'bg-purple-500', sub: 'Ce mois' },
    { label: 'Impayés', value: formatMontant(stats.loyersImpayes), icon: AlertTriangle, color: 'bg-red-500', sub: 'À relancer' },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 mt-1">Bienvenue sur votre espace de gestion locative</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <ArrowUpRight className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500 mt-1">{card.label}</p>
              <p className="text-xs text-blue-600 mt-1 font-medium">{card.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Graphique placeholder */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900">Évolution des encaissements</h2>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={[
            { mois: 'Jan', montant: 0 },
            { mois: 'Fév', montant: 0 },
            { mois: 'Mar', montant: 0 },
            { mois: 'Avr', montant: 0 },
            { mois: 'Mai', montant: 0 },
            { mois: 'Juin', montant: 0 },
          ]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mois" />
            <YAxis />
            <Tooltip formatter={(v) => formatMontant(Number(v))} />
            <Bar dataKey="montant" fill="#3b82f6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
