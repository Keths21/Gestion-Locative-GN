'use client'
import { useEffect, useState } from 'react'
import { Building2, Users, CreditCard, AlertTriangle, TrendingUp, ArrowUpRight, CheckCircle, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatMontant } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'

const MOIS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc']
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalBiens: 0, biensLoues: 0, totalLocataires: 0, loyersEncaisses: 0, loyersImpayes: 0, loyersAttente: 0, tauxOccupation: 0 })
  const [chartBar, setChartBar] = useState<any[]>([])
  const [chartPie, setChartPie] = useState<any[]>([])
  const [recentsPaiements, setRecentsPaiements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchAll() {
      const [{ data: biens }, { data: locataires }, { data: paiements }] = await Promise.all([
        supabase.from('biens').select('*'),
        supabase.from('locataires').select('*').is('date_sortie', null),
        supabase.from('paiements').select('*, locataire:locataires(nom,prenom), bien:biens(nom)').order('created_at', { ascending: false })
      ])

      const totalBiens = biens?.length || 0
      const biensLoues = biens?.filter(b => b.statut === 'loué').length || 0
      const loyersEncaisses = paiements?.filter(p => p.statut === 'payé').reduce((s, p) => s + p.montant, 0) || 0
      const loyersImpayes = paiements?.filter(p => p.statut === 'impayé').reduce((s, p) => s + p.montant, 0) || 0
      const loyersAttente = paiements?.filter(p => p.statut === 'en_attente').reduce((s, p) => s + p.montant, 0) || 0

      // Graphe barres - encaissements par mois (année courante)
      const annee = new Date().getFullYear()
      const barData = MOIS.map((m, i) => {
        const moisStr = `${annee}-${String(i + 1).padStart(2, '0')}`
        const montant = paiements?.filter(p => p.mois_concerne === moisStr && p.statut === 'payé').reduce((s, p) => s + p.montant, 0) || 0
        return { mois: m, montant }
      })

      // Pie chart - répartition statuts biens
      const biensVacants = biens?.filter(b => b.statut === 'vacant').length || 0
      const biensTravaux = biens?.filter(b => b.statut === 'travaux').length || 0
      setChartPie([
        { name: 'Loués', value: biensLoues },
        { name: 'Vacants', value: biensVacants },
        { name: 'Travaux', value: biensTravaux },
      ].filter(d => d.value > 0))

      setStats({ totalBiens, biensLoues, totalLocataires: locataires?.length || 0, loyersEncaisses, loyersImpayes, loyersAttente, tauxOccupation: totalBiens > 0 ? Math.round((biensLoues / totalBiens) * 100) : 0 })
      setChartBar(barData)
      setRecentsPaiements(paiements?.slice(0, 6) || [])
      setLoading(false)
    }
    fetchAll()
  }, [])

  const statCards = [
    { label: 'Total Biens', value: stats.totalBiens, icon: Building2, color: 'bg-blue-500', sub: `${stats.tauxOccupation}% occupés` },
    { label: 'Locataires actifs', value: stats.totalLocataires, icon: Users, color: 'bg-emerald-500', sub: `${stats.biensLoues} biens loués` },
    { label: 'Loyers encaissés', value: formatMontant(stats.loyersEncaisses), icon: CheckCircle, color: 'bg-green-500', sub: 'Total encaissé' },
    { label: 'Impayés', value: formatMontant(stats.loyersImpayes), icon: AlertTriangle, color: 'bg-red-500', sub: 'À relancer' },
  ]

  const statutConfig: Record<string, any> = {
    'payé': { label: 'Payé', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    'en_attente': { label: 'En attente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
    'impayé': { label: 'Impayé', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 mt-1">Vue d&apos;ensemble de votre gestion locative</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className={`${card.color} p-2.5 rounded-lg`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-gray-300" />
              </div>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
              <p className="text-xs text-blue-600 mt-1 font-medium">{card.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Barres - encaissements */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">Encaissements {new Date().getFullYear()}</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartBar}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v > 0 ? `${(v/1000000).toFixed(1)}M` : '0'} />
              <Tooltip formatter={(v: any) => formatMontant(Number(v))} />
              <Bar dataKey="montant" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Encaissé" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie - répartition biens */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-5">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">État des biens</h2>
          </div>
          {chartPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={chartPie} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {chartPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend formatter={v => <span style={{ fontSize: 12 }}>{v}</span>} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Aucun bien enregistré</div>
          )}
        </div>
      </div>

      {/* Paiements récents */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">Paiements récents</h2>
          </div>
          <a href="/paiements" className="text-sm text-blue-600 hover:underline">Voir tout →</a>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {recentsPaiements.length === 0 ? (
              <tr><td className="px-6 py-8 text-center text-gray-400">Aucun paiement enregistré</td></tr>
            ) : recentsPaiements.map(p => {
              const s = statutConfig[p.statut] || statutConfig['en_attente']
              const Icon = s.icon
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-3 font-medium text-gray-900">{p.locataire?.prenom} {p.locataire?.nom}</td>
                  <td className="px-6 py-3 text-gray-500 hidden md:table-cell">{p.bien?.nom}</td>
                  <td className="px-6 py-3 text-gray-500 hidden lg:table-cell">{p.mois_concerne}</td>
                  <td className="px-6 py-3 font-semibold text-gray-900">{formatMontant(p.montant)}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>
                      <Icon className="h-3 w-3" />{s.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
