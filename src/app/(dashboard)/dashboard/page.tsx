'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Users, CreditCard, AlertTriangle, TrendingUp, CheckCircle, Clock, Moon, Home, ArrowUpRight, ArrowDownRight, BellRing } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatMontant, formatDate, isLocataireActif } from '@/lib/utils'
import { Carte, EnTetePage, Pastille, Tuile, RienAAfficher, type Ton } from '@/components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const MOIS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc']

// Le camembert porte des ÉTATS : ses couleurs doivent donc dire quelque chose.
// L'ancienne suite bleu/ambre/gris laissait « loué » et « vacant » également
// neutres, alors que l'un est la situation voulue et l'autre celle qui appelle
// une action.
const COULEURS_ETAT: Record<string, string> = {
  'Loués': 'var(--succes)',
  'Vacants': 'var(--alerte)',
  'Travaux': 'var(--info)',
}

// Les barres, elles, portent des CATÉGORIES sans hiérarchie : deux teintes
// simplement distinctes, choisies hors du vert/ambre/rouge déjà réservés aux
// états de paiement, et distinguables en cas de daltonisme.
const COULEURS_BARRE = { appartement: '#0f766e', airbnb: '#4f46e5' }

const TON_STATUT: Record<string, Ton> = {
  'payé': 'succes',
  'en_attente': 'alerte',
  'impayé': 'danger',
}
const statutLabel: Record<string, string> = {
  'payé': 'Payé', 'en_attente': 'En attente', 'impayé': 'Impayé'
}

/** En-tête d'un panneau : même composition partout, une seule définition. */
function TitrePanneau({
  icone: Icone,
  children,
  compteur,
  ton = 'neutre',
  lien,
}: {
  icone: LucideIcon
  children: React.ReactNode
  compteur?: number
  ton?: Ton
  lien?: { href: string; libelle: string }
}) {
  return (
    <div className="flex items-center gap-2 border-b border-bordure px-5 py-3.5">
      <Icone className="h-4 w-4 text-texte-faible" aria-hidden />
      <h2 className="text-sm font-semibold text-texte">{children}</h2>
      {compteur !== undefined && compteur > 0 && (
        <Pastille ton={ton} className="ml-auto">{compteur}</Pastille>
      )}
      {lien && (
        <Link
          href={lien.href}
          className="ml-auto text-xs font-medium text-primaire hover:underline"
        >
          {lien.libelle}
        </Link>
      )}
    </div>
  )
}

function BarreOccupation({ taux }: { taux: number }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-texte-faible">Taux d&apos;occupation</span>
        <span className="chiffres font-semibold text-primaire">{taux}%</span>
      </div>
      {/* role/aria : sans eux, la barre ne dit rien à un lecteur d'écran —
          l'information n'existait que visuellement. */}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-appuyee"
        role="progressbar"
        aria-valuenow={taux}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Taux d'occupation"
      >
        <div className="h-full rounded-full bg-primaire transition-all" style={{ width: `${taux}%` }} />
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
    <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-bordure border-t-primaire" />
      <span className="sr-only">Chargement du tableau de bord…</span>
    </div>
  )

  const d = data
  const moisNom = MOIS[new Date().getMonth()]

  return (
    <div className="space-y-6">

      <EnTetePage
        titre="Tableau de bord"
        sous={`Vue d'ensemble — ${moisNom} ${new Date().getFullYear()}`}
      />

      {/* Chiffres clés */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tuile
          libelle="Biens"
          valeur={d.totalBiens}
          icone={Building2}
          className="col-span-2 lg:col-span-1"
          accessoire={
            <div className="flex gap-1.5">
              <Pastille ton="info" icone={Moon}>{d.nbAirbnb}</Pastille>
              <Pastille ton="neutre" icone={Home}>{d.nbAppt}</Pastille>
            </div>
          }
        >
          <BarreOccupation taux={d.tauxOccupation} />
        </Tuile>

        <Tuile
          libelle="Locataires actifs"
          valeur={d.totalLocataires}
          icone={Users}
          detail={`${d.biensVacants} bien(s) vacant(s)`}
        />

        <Tuile
          libelle="Encaissé ce mois"
          valeur={formatMontant(d.encaisseMois)}
          icone={CheckCircle}
          ton="succes"
          detail={`Total : ${formatMontant(d.totalEncaisse)}`}
          accessoire={d.evolutionMois !== null && (
            <span className={`flex items-center gap-1 text-xs font-medium ${d.evolutionMois >= 0 ? 'text-succes' : 'text-danger'}`}>
              {d.evolutionMois >= 0
                ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
              {/* La flèche seule ne suffit pas : la direction doit être dite,
                  pas seulement dessinée. */}
              <span className="sr-only">{d.evolutionMois >= 0 ? 'En hausse de' : 'En baisse de'}</span>
              {Math.abs(d.evolutionMois)}%
            </span>
          )}
        />

        <Tuile
          libelle="Impayés"
          valeur={formatMontant(d.totalImpayes)}
          icone={AlertTriangle}
          ton="danger"
          accent="danger"
          detail={`${d.alertesImpayes.length} paiement(s) en retard`}
          accessoire={d.totalAttente > 0 && (
            <Pastille ton="alerte">{formatMontant(d.totalAttente)} en attente</Pastille>
          )}
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Barres */}
        <Carte className="p-5 lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-texte-faible" aria-hidden />
              <h2 className="text-sm font-semibold text-texte">Revenus {new Date().getFullYear()}</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-texte-doux">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COULEURS_BARRE.appartement }} />
                Appartement
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COULEURS_BARRE.airbnb }} />
                Airbnb
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.barData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bordure)" vertical={false} />
              <XAxis
                dataKey="mois"
                tick={{ fontSize: 11, fill: 'var(--texte-faible)' }}
                axisLine={{ stroke: 'var(--bordure)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--texte-faible)' }}
                tickFormatter={v => v > 0 ? `${(v / 1000000).toFixed(1)}M` : '0'}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: any) => formatMontant(Number(v))}
                cursor={{ fill: 'var(--surface-appuyee)' }}
                contentStyle={{
                  borderRadius: 'var(--rayon)',
                  border: '1px solid var(--bordure)',
                  boxShadow: 'var(--ombre-flottante)',
                  fontSize: '0.8125rem',
                }}
              />
              <Bar dataKey="appartement" fill={COULEURS_BARRE.appartement} radius={[3, 3, 0, 0]} name="Appartement" stackId="a" />
              <Bar dataKey="airbnb" fill={COULEURS_BARRE.airbnb} radius={[3, 3, 0, 0]} name="Airbnb" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </Carte>

        {/* Pie */}
        <Carte className="p-5">
          <div className="mb-5 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-texte-faible" aria-hidden />
            <h2 className="text-sm font-semibold text-texte">État des biens</h2>
          </div>
          {d.pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={d.pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                    {d.pieData.map((item: any) => (
                      <Cell key={item.name} fill={COULEURS_ETAT[item.name] ?? 'var(--texte-faible)'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 'var(--rayon)',
                      border: '1px solid var(--bordure)',
                      boxShadow: 'var(--ombre-flottante)',
                      fontSize: '0.8125rem',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* La légende double le camembert en texte : elle reste lisible
                  quand les couleurs ne se distinguent pas, et se survole mal
                  au doigt sur un petit écran. */}
              <ul className="mt-2 space-y-2">
                {d.pieData.map((item: any) => (
                  <li key={item.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: COULEURS_ETAT[item.name] ?? 'var(--texte-faible)' }}
                      />
                      <span className="text-texte-doux">{item.name}</span>
                    </span>
                    <span className="chiffres font-semibold text-texte">{item.value}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <RienAAfficher icone={Building2} titre="Aucun bien enregistré" />
          )}
        </Carte>
      </div>

      {/* Alertes + Biens vacants */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        <Carte className="overflow-hidden">
          <TitrePanneau icone={BellRing} compteur={d.alertesImpayes.length} ton="danger">
            Alertes impayés
          </TitrePanneau>
          {d.alertesImpayes.length === 0 ? (
            <RienAAfficher icone={CheckCircle} titre="Aucun impayé en cours" />
          ) : (
            <ul className="divide-y divide-bordure">
              {d.alertesImpayes.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-texte">{p.locataire?.prenom} {p.locataire?.nom}</p>
                    <p className="truncate text-xs text-texte-faible">{p.bien?.nom} · {p.mois_concerne}</p>
                  </div>
                  <span className="chiffres shrink-0 text-sm font-semibold text-danger">{formatMontant(p.montant)}</span>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <Carte className="overflow-hidden">
          <TitrePanneau icone={Building2} compteur={d.biensVacantsList.length} ton="alerte">
            Biens vacants
          </TitrePanneau>
          {d.biensVacantsList.length === 0 ? (
            <RienAAfficher icone={CheckCircle} titre="Tous les biens sont occupés" />
          ) : (
            <ul className="divide-y divide-bordure">
              {d.biensVacantsList.map((b: any) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`shrink-0 rounded-[var(--rayon)] border p-1.5 ${b.mode_location === 'airbnb' ? 'border-info/20 bg-info-tenue' : 'border-bordure bg-surface-appuyee'}`}
                      aria-hidden
                    >
                      {b.mode_location === 'airbnb'
                        ? <Moon className="h-3.5 w-3.5 text-info" />
                        : <Home className="h-3.5 w-3.5 text-texte-doux" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-texte">{b.nom}</p>
                      <p className="truncate text-xs text-texte-faible">{b.adresse}, {b.ville}</p>
                    </div>
                  </div>
                  <span className="chiffres shrink-0 text-sm font-semibold text-texte-doux">
                    {b.mode_location === 'airbnb' ? formatMontant(b.prix_nuit || 0) + '/nuit' : formatMontant(b.loyer_base || 0) + '/mois'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </div>

      {/* Paiements récents */}
      <Carte className="overflow-hidden">
        <TitrePanneau icone={CreditCard} lien={{ href: '/paiements', libelle: 'Voir tout →' }}>
          Paiements récents
        </TitrePanneau>
        {d.recentsPaiements.length === 0 ? (
          <RienAAfficher icone={CreditCard} titre="Aucun paiement enregistré" />
        ) : (
          // overflow-x-auto : un tableau plus large que l'écran doit défiler
          // dans son cadre, jamais pousser la page entière de côté.
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {/* En-têtes réels : sans eux, la colonne de montants n'était
                  identifiable qu'à l'œil, et pas du tout au lecteur d'écran. */}
              <thead className="sr-only">
                <tr>
                  <th scope="col">Locataire</th>
                  <th scope="col">Mois concerné</th>
                  <th scope="col">Montant</th>
                  <th scope="col">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {d.recentsPaiements.map((p: any) => (
                  <tr key={p.id} className="transition-colors hover:bg-surface-appuyee">
                    <td className="px-5 py-3">
                      <p className="font-medium text-texte">{p.locataire?.prenom} {p.locataire?.nom}</p>
                      <p className="mt-0.5 hidden text-xs text-texte-faible md:block">{p.bien?.nom}</p>
                    </td>
                    <td className="chiffres hidden px-5 py-3 text-xs text-texte-doux lg:table-cell">{p.mois_concerne}</td>
                    <td className="chiffres whitespace-nowrap px-5 py-3 font-semibold text-texte">{formatMontant(p.montant)}</td>
                    <td className="px-5 py-3">
                      <Pastille ton={TON_STATUT[p.statut] ?? 'alerte'}>
                        {statutLabel[p.statut] || 'En attente'}
                      </Pastille>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

    </div>
  )
}
