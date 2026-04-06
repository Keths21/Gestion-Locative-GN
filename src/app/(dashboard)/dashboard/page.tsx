'use client'
import { useEffect, useState } from 'react'
import { Building2, Users, CreditCard, AlertTriangle, TrendingUp, CheckCircle, Clock, Moon, Home, ArrowUpRight, ArrowDownRight, BellRing } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatMontant, formatDate, isLocataireActif } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const MOIS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc']
const COLORS_PIE = ['#3b82f6','#f59e0b','#6b7280']
const COLORS_BAR = { appartement: '#3b82f6', airbnb: '#ec4899' }

const statutBadge: Record<string, string> = {
  'payé': 'bg-green-100 text-green-700',
  'en_attente': 'bg-yellow-100 text-yellow-700',
  'impayé': 'bg-red-100 text-red-700',
}
const statutLabel: Record<string, string> = {
  'payé': 'Payé', 'en_attente': 'En attente', 'impayé': 'Impayé'
}

function StatCard({ label, value, sub, icon: Icon, iconBg, trend, trendUp }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className={`${iconBg} p-2.5 rounded-lg`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trendUp ? 'text-green-600' : 'text-red-500'}`}>
            {trendUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {trend}
          </div>
        )}
      </div>
      <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function OccupationBar({ taux }: { taux: number }) {
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Taux d'occupation</span>
        <span className="font-semibold text-blue-600">{taux}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${taux}%` }} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchAll() {
      const now = new Date()
      const annee = now.getFullYear()
      const moisCourant = `${annee}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const moisPrecedent = now.getMonth() === 0
        ? `${annee - 1}-12`
        : `${annee}-${String(now.getMonth()).padStart(2, '0')}`

      const [{ data: biens }, { data: locataires }, { data: paiements }] = await Promise.all([
        supabase.from('biens').select('*'),
        supabase.from('locataires').select('*, bien:biens(nom, mode_location)'),
        supabase.from('paiements').select('*, locataire:locataires(nom,prenom), bien:biens(nom, mode_location)').order('created_at', { ascending: false })
      ])

      // Stats biens
      const totalBiens = biens?.length || 0
      // On considère loué = statut loué OU bien avec locataire actif
      const todayStr = new Date().toISOString().split('T')[0]
      const bienIdsActifs = new Set(
        (locataires || [])
          .filter(l => !l.date_sortie || l.date_sortie > todayStr)
          .map(l => l.bien_id)
      )
      const biensLoues = biens?.filter(b => b.statut === 'loué' || bienIdsActifs.has(b.id)).length || 0
      const biensVacants = biens?.filter(b => b.statut === 'vacant' && !bienIdsActifs.has(b.id)).length || 0
      const biensTravaux = biens?.filter(b => b.statut === 'travaux').length || 0
      const tauxOccupation = totalBiens > 0 ? Math.round((biensLoues / totalBiens) * 100) : 0

      // Locataires
      const locActifs = locataires?.filter(l => isLocataireActif(l)) || []
      const checkoutsSemaine = locataires?.filter(l => {
        if (!l.date_sortie) return false
        const diff = (new Date(l.date_sortie).getTime() - now.getTime()) / 86400000
        return diff >= 0 && diff <= 7
      }) || []

      // Paiements
      const paye = paiements?.filter(p => p.statut === 'payé') || []
      const impayes = paiements?.filter(p => p.statut === 'impayé') || []
      const attente = paiements?.filter(p => p.statut === 'en_attente') || []

      const totalEncaisse = paye.reduce((s, p) => s + p.montant, 0)
      const totalImpayes = impayes.reduce((s, p) => s + p.montant, 0)
      const totalAttente = attente.reduce((s, p) => s + p.montant, 0)

      const encaisseMois = paye.filter(p => p.mois_concerne?.startsWith(moisCourant)).reduce((s, p) => s + p.montant, 0)
      const encaisseMoisPrec = paye.filter(p => p.mois_concerne?.startsWith(moisPrecedent)).reduce((s, p) => s + p.montant, 0)
      const evolutionMois = encaisseMoisPrec > 0 ? Math.round(((encaisseMois - encaisseMoisPrec) / encaisseMoisPrec) * 100) : null

      // Graphe barres par mois (Airbnb + Appartement)
      const barData = MOIS.map((m, i) => {
        const moisStr = `${annee}-${String(i + 1).padStart(2, '0')}`
        const appt = paye.filter(p => p.mois_concerne?.startsWith(moisStr) && (p as any).bien?.mode_location !== 'airbnb').reduce((s, p) => s + p.montant, 0)
        const airbnb = paye.filter(p => {
          if ((p as any).bien?.mode_location !== 'airbnb') return false
          // Pour Airbnb, on utilise date_paiement
          return p.date_paiement?.startsWith(moisStr)
        }).reduce((s, p) => s + p.montant, 0)
        return { mois: m, appartement: appt, airbnb }
      })

      // Pie biens
      const pieData = [
        { name: 'Loués', value: biensLoues },
        { name: 'Vacants', value: biensVacants },
        { name: 'Travaux', value: biensTravaux },
      ].filter(d => d.value > 0)

      // Alertes : locataires avec impayés
      const alertesImpayes = impayes.slice(0, 5)

      // Biens vacants : statut vacant ET aucun locataire actif dessus
      const today2 = new Date()
      const bienIdsAvecLocataireActif = new Set(
        (locataires || [])
          .filter(l => isLocataireActif(l) && l.bien_id)
          .map(l => l.bien_id)
      )
      const biensVacantsList = biens?.filter(b =>
        b.statut === 'vacant' && !bienIdsAvecLocataireActif.has(b.id)
      ).slice(0, 4) || []

      setData({
        totalBiens, biensLoues, biensVacants, tauxOccupation,
        totalLocataires: locActifs.length, checkoutsSemaine,
        totalEncaisse, totalImpayes, totalAttente,
        encaisseMois, evolutionMois,
        barData, pieData,
        recentsPaiements: paiements?.slice(0, 5) || [],
        alertesImpayes, biensVacantsList,
        nbAirbnb: biens?.filter(b => b.mode_location === 'airbnb').length || 0,
        nbAppt: biens?.filter(b => b.mode_location === 'appartement').length || 0,
      })
      setLoading(false)
    }
    fetchAll()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  )

  const d = data
  const moisNom = MOIS[new Date().getMonth()]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 mt-1">Vue d'ensemble — {moisNom} {new Date().getFullYear()}</p>
      </div>

      {/* Stats principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-blue-500 p-2.5 rounded-lg">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="flex gap-1.5">
              <span className="flex items-center gap-1 text-xs bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded-full font-medium">
                <Moon className="h-2.5 w-2.5" />{d.nbAirbnb}
              </span>
              <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                <Home className="h-2.5 w-2.5" />{d.nbAppt}
              </span>
            </div>
          </div>
          <p className="text-xl font-bold text-gray-900">{d.totalBiens}</p>
          <p className="text-sm text-gray-500 mt-0.5">Biens</p>
          <OccupationBar taux={d.tauxOccupation} />
        </div>

        <StatCard label="Locataires actifs" value={d.totalLocataires} icon={Users} iconBg="bg-emerald-500"
          sub={`${d.biensVacants} bien(s) vacant(s)`} />

        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-green-500 p-2.5 rounded-lg">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
            {d.evolutionMois !== null && (
              <div className={`flex items-center gap-1 text-xs font-medium ${d.evolutionMois >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {d.evolutionMois >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(d.evolutionMois)}%
              </div>
            )}
          </div>
          <p className="text-xl font-bold text-gray-900">{formatMontant(d.encaisseMois)}</p>
          <p className="text-sm text-gray-500 mt-0.5">Encaissé ce mois</p>
          <p className="text-xs text-gray-400 mt-1">Total : {formatMontant(d.totalEncaisse)}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-red-500 p-2.5 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            {d.totalAttente > 0 && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{formatMontant(d.totalAttente)} en attente</span>
            )}
          </div>
          <p className="text-xl font-bold text-red-600">{formatMontant(d.totalImpayes)}</p>
          <p className="text-sm text-gray-500 mt-0.5">Impayés</p>
          <p className="text-xs text-gray-400 mt-1">{d.alertesImpayes.length} paiement(s) en retard</p>
        </div>
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Barres */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <h2 className="font-semibold text-gray-900">Revenus {new Date().getFullYear()}</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />Appartement</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-pink-400 inline-block" />Airbnb</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.barData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v > 0 ? `${(v / 1000000).toFixed(1)}M` : '0'} />
              <Tooltip formatter={(v: any) => formatMontant(Number(v))} />
              <Bar dataKey="appartement" fill={COLORS_BAR.appartement} radius={[3, 3, 0, 0]} name="Appartement" stackId="a" />
              <Bar dataKey="airbnb" fill={COLORS_BAR.airbnb} radius={[3, 3, 0, 0]} name="Airbnb" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-5">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">État des biens</h2>
          </div>
          {d.pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={d.pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                    {d.pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS_PIE[i % COLORS_PIE.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {d.pieData.map((item: any, i: number) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLORS_PIE[i] }} />
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Aucun bien enregistré</div>
          )}
        </div>
      </div>

      {/* Alertes + Biens vacants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Alertes impayés */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <BellRing className="h-4 w-4 text-red-500" />
            <h2 className="font-semibold text-gray-900">Alertes impayés</h2>
            {d.alertesImpayes.length > 0 && (
              <span className="ml-auto text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{d.alertesImpayes.length}</span>
            )}
          </div>
          {d.alertesImpayes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <CheckCircle className="h-8 w-8 mb-2 text-green-400" />
              <p className="text-sm">Aucun impayé en cours</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {d.alertesImpayes.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{p.locataire?.prenom} {p.locataire?.nom}</p>
                    <p className="text-xs text-gray-400">{p.bien?.nom} · {p.mois_concerne}</p>
                  </div>
                  <span className="font-semibold text-red-600 text-sm">{formatMontant(p.montant)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Biens vacants */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Building2 className="h-4 w-4 text-yellow-500" />
            <h2 className="font-semibold text-gray-900">Biens vacants</h2>
            {d.biensVacantsList.length > 0 && (
              <span className="ml-auto text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{d.biensVacants}</span>
            )}
          </div>
          {d.biensVacantsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <CheckCircle className="h-8 w-8 mb-2 text-green-400" />
              <p className="text-sm">Tous les biens sont occupés</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {d.biensVacantsList.map((b: any) => (
                <li key={b.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${b.mode_location === 'airbnb' ? 'bg-pink-100' : 'bg-blue-100'}`}>
                      {b.mode_location === 'airbnb'
                        ? <Moon className="h-3.5 w-3.5 text-pink-500" />
                        : <Home className="h-3.5 w-3.5 text-blue-500" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{b.nom}</p>
                      <p className="text-xs text-gray-400">{b.adresse}, {b.ville}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    {b.mode_location === 'airbnb' ? formatMontant(b.prix_nuit || 0) + '/nuit' : formatMontant(b.loyer_base || 0) + '/mois'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Paiements récents */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-blue-600" />
            <h2 className="font-semibold text-gray-900">Paiements récents</h2>
          </div>
          <a href="/paiements" className="text-xs text-blue-600 hover:underline font-medium">Voir tout →</a>
        </div>
        {d.recentsPaiements.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Aucun paiement enregistré</div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {d.recentsPaiements.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{p.locataire?.prenom} {p.locataire?.nom}</p>
                    <p className="text-xs text-gray-400 mt-0.5 hidden md:block">{p.bien?.nom}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell text-xs">{p.mois_concerne}</td>
                  <td className="px-5 py-3 font-semibold text-gray-900">{formatMontant(p.montant)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statutBadge[p.statut] || statutBadge['en_attente']}`}>
                      {statutLabel[p.statut] || 'En attente'}
                    </span>
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
