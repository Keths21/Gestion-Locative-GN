'use client'
import { useEffect, useState } from 'react'
import { Plus, CreditCard, CheckCircle, AlertCircle, Clock, X, FileText, Trash2, Moon, Home, TrendingUp, TrendingDown, Hourglass, CalendarPlus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Paiement, Locataire, Bien } from '@/types'
import { formatMontant, formatDate, getMoisActuel } from '@/lib/utils'
import toast from 'react-hot-toast'
import { genererQuittance } from '@/lib/pdf'
import { genererEcheancesMensuelles } from '@/lib/echeances'
import { Carte, EnTetePage } from '@/components/ui'

const statutConfig: Record<string, { label: string; color: string; next: string }> = {
  'payé':       { label: 'Payé',       color: 'bg-succes-tenue text-succes',   next: 'impayé' },
  'en_attente': { label: 'En attente', color: 'bg-alerte-tenue text-alerte', next: 'payé' },
  'impayé':     { label: 'Impayé',     color: 'bg-danger-tenue text-danger',       next: 'en_attente' },
}

const EMPTY_FORM = {
  locataire_id: '', bien_id: '', montant: '',
  date_paiement: new Date().toISOString().split('T')[0],
  mois_concerne: getMoisActuel(),
  statut: 'payé', notes: '',
  // Airbnb
  prix_nuit: '', nb_nuits: '', date_debut: '', date_fin: '',
}

function nbNuits(d1: string, d2: string) {
  if (!d1 || !d2) return 0
  return Math.max(0, Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000))
}

export default function PaiementsPage() {
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [locataires, setLocataires] = useState<Locataire[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filtre, setFiltre] = useState<'tous' | 'payé' | 'impayé' | 'en_attente'>('tous')
  const [filtreLocataire, setFiltreLocataire] = useState<string>('tous')
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [modeAirbnb, setModeAirbnb] = useState(false)
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()

  const fetchData = async () => {
    const [{ data: pai }, { data: loc }] = await Promise.all([
      supabase.from('paiements').select('*, locataire:locataires(nom, prenom), bien:biens(nom, mode_location)').order('created_at', { ascending: false }),
      supabase.from('locataires').select('*, bien:biens(*)')
        .or(`date_sortie.is.null,date_sortie.gt.${new Date().toISOString().split('T')[0]}`),
    ])
    setPaiements(pai || [])
    setLocataires(loc || [])
    setLoading(false)
  }

  // Génère les échéances du mois + promeut les impayés échus.
  // silent = true : auto au chargement (pas de toast si rien à faire).
  const runGeneration = async (silent = false) => {
    setGenerating(true)
    try {
      const { crees, promus } = await genererEcheancesMensuelles(supabase)
      if (!silent) {
        if (crees || promus) {
          toast.success(
            `${crees} loyer(s) généré(s)${promus ? ` · ${promus} passé(s) en impayé` : ''}`
          )
        } else {
          toast.success('Échéances déjà à jour')
        }
      }
      if (crees || promus) await fetchData()
    } catch {
      if (!silent) toast.error('Erreur lors de la génération des loyers')
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    (async () => {
      await runGeneration(true) // génération auto silencieuse
      await fetchData()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  const handleLocataireChange = (locId: string) => {
    const loc = locataires.find(l => l.id === locId)
    const bien = (loc as any)?.bien
    const isAirbnb = bien?.mode_location === 'airbnb'
    setModeAirbnb(isAirbnb)
    setForm(f => ({
      ...f,
      locataire_id: locId,
      bien_id: loc?.bien_id || '',
      montant: isAirbnb ? '' : String(bien?.loyer_base || ''),
      prix_nuit: isAirbnb ? String(bien?.prix_nuit || '') : '',
    }))
  }

  // Recalcul montant Airbnb quand dates changent
  const handleDateChange = (key: 'date_debut' | 'date_fin', val: string) => {
    const updated = { ...form, [key]: val }
    const nuits = nbNuits(
      key === 'date_debut' ? val : form.date_debut,
      key === 'date_fin' ? val : form.date_fin
    )
    const total = nuits > 0 && Number(form.prix_nuit) ? nuits * Number(form.prix_nuit) : 0
    setForm({ ...updated, nb_nuits: nuits > 0 ? String(nuits) : '', montant: total > 0 ? String(total) : '' })
  }

  const handlePrixNuitChange = (val: string) => {
    const nuits = nbNuits(form.date_debut, form.date_fin)
    const total = nuits > 0 && Number(val) ? nuits * Number(val) : 0
    setForm(f => ({ ...f, prix_nuit: val, montant: total > 0 ? String(total) : '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const moisConcerne = modeAirbnb && form.date_debut && form.date_fin
      ? `${form.date_debut} → ${form.date_fin}`
      : form.mois_concerne

    const payload = {
      locataire_id: form.locataire_id,
      bien_id: form.bien_id,
      montant: Number(form.montant),
      date_paiement: form.date_paiement,
      mois_concerne: moisConcerne,
      statut: form.statut,
      notes: form.notes || null,
    }

    // En location mensuelle, une échéance peut déjà exister pour ce mois
    // (générée automatiquement) : on la met à jour au lieu de créer un doublon.
    let error: { message: string } | null = null
    if (!modeAirbnb) {
      const { data: existant } = await supabase
        .from('paiements')
        .select('id')
        .eq('locataire_id', form.locataire_id)
        .eq('mois_concerne', moisConcerne)
        .limit(1)
      if (existant && existant.length > 0) {
        ({ error } = await supabase.from('paiements').update(payload).eq('id', existant[0].id))
      } else {
        ({ error } = await supabase.from('paiements').insert(payload))
      }
    } else {
      ({ error } = await supabase.from('paiements').insert(payload))
    }

    if (error) { toast.error('Erreur : ' + error.message); setSubmitting(false); return }
    toast.success('Paiement enregistré !')
    setShowModal(false)
    setForm(EMPTY_FORM)
    setModeAirbnb(false)
    setSubmitting(false)
    fetchData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce paiement ?')) return
    await supabase.from('paiements').delete().eq('id', id)
    toast.success('Paiement supprimé')
    fetchData()
  }

  const handleStatutChange = async (p: Paiement) => {
    const next = statutConfig[p.statut]?.next || 'payé'
    const update: Record<string, unknown> = { statut: next }
    // En passant à "payé", on date l'encaissement si l'échéance n'était pas encore réglée
    if (next === 'payé' && !p.date_paiement) {
      update.date_paiement = new Date().toISOString().split('T')[0]
    }
    await supabase.from('paiements').update(update).eq('id', p.id)
    fetchData()
  }

  const handleQuittance = async (paiement: Paiement) => {
    // Les coordonnées de l'agence figurent en tête du reçu : sans elles, le
    // document sortirait au nom générique de l'application.
    const { data: agence } = await supabase
      .from('parametres')
      .select('nom_agence, adresse, ville, telephone, email')
      .maybeSingle()

    await genererQuittance(paiement, agence)
    toast.success('Reçu généré')
  }

  // Le locataire restreint la page entière — totaux, compteurs et liste. Des
  // cartes qui resteraient globales pendant qu'on regarde un seul dossier
  // répondraient à une autre question que celle qu'on est en train de poser.
  const perimetre = filtreLocataire === 'tous'
    ? paiements
    : paiements.filter(p => p.locataire_id === filtreLocataire)

  const paiementsFiltres = filtre === 'tous' ? perimetre : perimetre.filter(p => p.statut === filtre)
  const moisCourant = getMoisActuel()

  const locataireChoisi = locataires.find(l => l.id === filtreLocataire)

  const totalEncaisse = perimetre.filter(p => p.statut === 'payé').reduce((s, p) => s + p.montant, 0)
  const totalImpayes = perimetre.filter(p => p.statut === 'impayé').reduce((s, p) => s + p.montant, 0)
  const totalAttente = perimetre.filter(p => p.statut === 'en_attente').reduce((s, p) => s + p.montant, 0)
  const totalMois = perimetre.filter(p => p.statut === 'payé' && p.mois_concerne?.startsWith(moisCourant)).reduce((s, p) => s + p.montant, 0)

  // Trié par nom : une liste déroulante dans l'ordre d'insertion en base est
  // inutilisable dès la dizaine de locataires.
  const locatairesTries = [...locataires].sort((a, b) =>
    `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))

  const inputCls = 'w-full px-4 py-2.5 border border-bordure-forte rounded-[var(--rayon)] focus:ring-2 focus:ring-primaire outline-none text-sm'

  // Statut et actions servent deux fois : dans le tableau (ordinateur) et dans
  // les fiches (téléphone). Une seule définition, pour qu'ils ne divergent pas.
  const boutonStatut = (p: Paiement) => {
    const s = statutConfig[p.statut] || statutConfig['en_attente']
    return (
      <button
        onClick={() => handleStatutChange(p)}
        title="Cliquer pour changer le statut"
        className={`inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition ${s.color}`}>
        {p.statut === 'payé' && <CheckCircle className="h-3 w-3" />}
        {p.statut === 'en_attente' && <Clock className="h-3 w-3" />}
        {p.statut === 'impayé' && <AlertCircle className="h-3 w-3" />}
        {s.label}
      </button>
    )
  }

  // taille : sur téléphone, cible de 44 px — l'icône seule se rate au pouce.
  const boutonsActions = (p: Paiement, taille: 'compacte' | 'tactile') => {
    const cls = taille === 'tactile'
      ? 'inline-flex h-11 w-11 items-center justify-center rounded-[var(--rayon)] transition'
      : 'p-1.5 rounded-[var(--rayon)] transition'
    return (
      <div className="flex items-center gap-1 justify-end">
        {p.statut === 'payé' && (
          <button onClick={() => handleQuittance(p)} title="Générer quittance" aria-label="Générer la quittance"
            className={`${cls} hover:bg-primaire-tenue text-primaire`}>
            <FileText className="h-4 w-4" />
          </button>
        )}
        <button onClick={() => handleDelete(p.id)} title="Supprimer" aria-label="Supprimer le paiement"
          className={`${cls} hover:bg-danger-tenue text-danger`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      <EnTetePage
        titre="Paiements"
        sous={locataireChoisi
          ? `${perimetre.length} paiement(s) — ${locataireChoisi.prenom} ${locataireChoisi.nom}`
          : `${paiements.length} paiement(s) enregistré(s)`}>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => runGeneration(false)} disabled={generating}
            title="Créer les échéances de loyer du mois pour les locataires mensuels"
            className="flex items-center gap-2 whitespace-nowrap border border-bordure text-texte px-4 py-2.5 rounded-[var(--rayon)] hover:bg-surface-appuyee transition text-sm font-medium disabled:opacity-50">
            <CalendarPlus className={`h-4 w-4 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? 'Génération...' : 'Générer les loyers'}
          </button>
          <button onClick={() => { setForm(EMPTY_FORM); setModeAirbnb(false); setShowModal(true) }}
            className="flex items-center gap-2 whitespace-nowrap bg-primaire text-white px-4 py-2.5 rounded-[var(--rayon)] hover:bg-primaire-appui transition text-sm font-medium">
            <Plus className="h-4 w-4" /> Enregistrer un paiement
          </button>
        </div>
      </EnTetePage>

      {/* Stats — text-base sur téléphone : en demi-largeur, un total à neuf
          chiffres en text-lg touchait le bord de sa carte. Quatre de front
          seulement à 1280 px : à 1024, la barre latérale ne laisse que 720 px.
          Une seule colonne sous 360 px, où même text-base ne tient plus. */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Carte className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 shrink-0 text-succes" />
            <p className="text-xs text-texte-doux font-medium">Total encaissé</p>
          </div>
          <p className="text-base sm:text-lg font-bold text-succes">{formatMontant(totalEncaisse)}</p>
        </Carte>
        <Carte className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs text-texte-doux font-medium">Impayés</p>
          </div>
          <p className="text-base sm:text-lg font-bold text-danger">{formatMontant(totalImpayes)}</p>
        </Carte>
        <Carte className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Hourglass className="h-4 w-4 shrink-0 text-alerte" />
            <p className="text-xs text-texte-doux font-medium">En attente</p>
          </div>
          <p className="text-base sm:text-lg font-bold text-alerte">{formatMontant(totalAttente)}</p>
        </Carte>
        <Carte className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4 shrink-0 text-primaire" />
            <p className="text-xs text-texte-doux font-medium">Ce mois-ci</p>
          </div>
          <p className="text-base sm:text-lg font-bold text-primaire">{formatMontant(totalMois)}</p>
        </Carte>
      </div>

      {/* Filtres. Sur téléphone : le locataire sur sa ligne, les statuts sur
          une rangée qui défile au doigt — en flex-wrap, ils prenaient trois
          lignes à eux seuls. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-texte-doux" />
          <select
            value={filtreLocataire}
            onChange={e => setFiltreLocataire(e.target.value)}
            aria-label="Filtrer par locataire"
            className="min-w-0 flex-1 px-3 py-2 border border-bordure rounded-[var(--rayon)] bg-surface text-sm text-texte
                       focus:ring-2 focus:ring-primaire outline-none sm:flex-none sm:max-w-[16rem]">
            <option value="tous">Tous les locataires</option>
            {locatairesTries.map(l => (
              <option key={l.id} value={l.id}>{l.nom} {l.prenom}</option>
            ))}
          </select>

          {filtreLocataire !== 'tous' && (
            <button onClick={() => setFiltreLocataire('tous')}
              aria-label="Retirer le filtre locataire"
              className="flex shrink-0 items-center gap-1.5 px-3 py-2 rounded-[var(--rayon)] text-sm
                         text-texte-doux border border-bordure hover:bg-surface-appuyee transition">
              <X className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Retirer le filtre</span>
            </button>
          )}
        </div>

        <span className="w-px self-stretch bg-bordure mx-1 hidden sm:block" />

        <div className="sans-barre -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {([
          { key: 'tous', label: 'Tous', count: perimetre.length },
          { key: 'payé', label: 'Payés', count: perimetre.filter(p => p.statut === 'payé').length },
          { key: 'en_attente', label: 'En attente', count: perimetre.filter(p => p.statut === 'en_attente').length },
          { key: 'impayé', label: 'Impayés', count: perimetre.filter(p => p.statut === 'impayé').length },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFiltre(f.key)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-[var(--rayon)] text-sm font-medium transition flex items-center gap-2 ${filtre === f.key ? 'bg-primaire text-white' : 'bg-surface border border-bordure text-texte-doux hover:bg-surface-appuyee'}`}>
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${filtre === f.key ? 'bg-surface/20 text-white' : 'bg-surface-appuyee text-texte-doux'}`}>{f.count}</span>
          </button>
        ))}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primaire" /></div>
      ) : paiementsFiltres.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-[var(--rayon)] border border-bordure">
          <CreditCard className="h-12 w-12 text-texte-faible mx-auto mb-4" />
          <p className="text-texte-doux">
            {locataireChoisi
              ? `Aucun paiement pour ${locataireChoisi.prenom} ${locataireChoisi.nom}${filtre === 'tous' ? '' : ' dans cette catégorie'}.`
              : 'Aucun paiement trouvé.'}
          </p>
        </div>
      ) : (
        <Carte className="overflow-hidden">
          {/* Sous 1280 px : une fiche par paiement. Le tableau y était rogné
              par sa carte — statut coupé, boutons quittance et suppression
              introuvables sur téléphone, et encore hors cadre à 1024 px, où
              la barre latérale ne laisse que 720 px aux sept colonnes. */}
          <ul className="divide-y divide-bordure xl:hidden">
            {paiementsFiltres.map(p => {
              const isAirbnb = p.bien?.mode_location === 'airbnb'
              return (
                <li key={p.id} className="px-4 pt-3.5 pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-texte">{p.locataire?.prenom} {p.locataire?.nom}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-texte-doux">
                        {isAirbnb
                          ? <Moon className="h-3.5 w-3.5 text-info shrink-0" />
                          : <Home className="h-3.5 w-3.5 text-texte-faible shrink-0" />}
                        {/* Seul le nom du bien s'abrège : la période est ce
                            qu'on cherche dans la liste. */}
                        <span className="truncate">{p.bien?.nom || '-'}</span>
                        <span className="shrink-0">· {p.mois_concerne}</span>
                      </p>
                    </div>
                    <p className="chiffres shrink-0 text-sm font-semibold text-texte">{formatMontant(p.montant)}</p>
                  </div>
                  {p.notes && <p className="text-xs text-texte-faible mt-1 italic">{p.notes}</p>}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {boutonStatut(p)}
                      <span className="truncate text-xs text-texte-faible">
                        {p.date_paiement ? formatDate(p.date_paiement) : <span className="italic">Non réglé</span>}
                      </span>
                    </div>
                    {boutonsActions(p, 'tactile')}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* overflow-x-auto : filet de sécurité si un nom de bien très long
              élargit le tableau — il défile alors dans son cadre. */}
          <div className="hidden overflow-x-auto xl:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-appuyee border-b border-bordure">
                <th className="text-left px-5 py-3 text-texte-doux font-medium">Locataire</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium hidden md:table-cell">Bien</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium">Montant</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium hidden lg:table-cell">Période</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium hidden lg:table-cell">Date</th>
                <th className="text-left px-5 py-3 text-texte-doux font-medium">Statut</th>
                <th className="px-5 py-3 text-right text-texte-doux font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bordure">
              {paiementsFiltres.map(p => {
                const isAirbnb = (p as any).bien?.mode_location === 'airbnb'
                return (
                  <tr key={p.id} className="hover:bg-surface-appuyee transition">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-texte">{(p as any).locataire?.prenom} {(p as any).locataire?.nom}</p>
                      {(p as any).notes && <p className="text-xs text-texte-faible mt-0.5 italic">{(p as any).notes}</p>}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-texte-doux">
                        {isAirbnb
                          ? <Moon className="h-3.5 w-3.5 text-info shrink-0" />
                          : <Home className="h-3.5 w-3.5 text-texte-faible shrink-0" />}
                        {(p as any).bien?.nom || '-'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-texte whitespace-nowrap">{formatMontant(p.montant)}</td>
                    <td className="px-5 py-3.5 text-texte-doux hidden lg:table-cell text-xs">
                      {p.mois_concerne?.includes('→')
                        ? p.mois_concerne
                        : p.mois_concerne}
                    </td>
                    <td className="px-5 py-3.5 text-texte-doux hidden lg:table-cell text-xs">
                      {p.date_paiement
                        ? formatDate(p.date_paiement)
                        : <span className="italic text-texte-faible">Non réglé</span>}
                    </td>
                    <td className="px-5 py-3.5">{boutonStatut(p)}</td>
                    <td className="px-5 py-3.5">{boutonsActions(p, 'compacte')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </Carte>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-bordure">
              <h2 className="font-bold text-texte text-lg">Nouveau paiement</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-surface-appuyee rounded-[var(--rayon)] transition">
                <X className="h-5 w-5 text-texte-doux" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              {/* Locataire */}
              <div>
                <label className="block text-sm font-medium text-texte mb-1">Locataire *</label>
                <select value={form.locataire_id} onChange={e => handleLocataireChange(e.target.value)} required className={inputCls}>
                  <option value="">-- Sélectionner un locataire --</option>
                  {locataires.map(l => {
                    const mode = (l as any).bien?.mode_location
                    return (
                      <option key={l.id} value={l.id}>
                        {l.prenom} {l.nom} {mode === 'airbnb' ? '(Airbnb)' : mode === 'appartement' ? '(Mensuel)' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Badge mode */}
              {form.locataire_id && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-[var(--rayon)] text-sm font-medium ${modeAirbnb ? 'bg-info-tenue text-info' : 'bg-primaire-tenue text-primaire'}`}>
                  {modeAirbnb ? <Moon className="h-4 w-4" /> : <Home className="h-4 w-4" />}
                  {modeAirbnb ? 'Location Airbnb — paiement calculé par nuit' : 'Location mensuelle — loyer mensuel'}
                </div>
              )}

              {modeAirbnb ? (
                <>
                  {/* Airbnb */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Date d'arrivée *</label>
                      <input type="date" value={form.date_debut} onChange={e => handleDateChange('date_debut', e.target.value)} required className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Date de départ *</label>
                      <input type="date" value={form.date_fin} onChange={e => handleDateChange('date_fin', e.target.value)} required className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Prix / nuit (GNF)</label>
                      <input type="number" value={form.prix_nuit} onChange={e => handlePrixNuitChange(e.target.value)} placeholder="150 000" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Nombre de nuits</label>
                      <input type="text" value={form.nb_nuits} readOnly placeholder="Auto" className={`${inputCls} bg-surface-appuyee text-texte-doux`} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-texte mb-1">Montant total (GNF) *</label>
                    <input type="number" value={form.montant} onChange={e => set('montant', e.target.value)} required placeholder="Calculé automatiquement" className={inputCls} />
                  </div>
                </>
              ) : (
                <>
                  {/* Appartement */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Montant (GNF) *</label>
                      <input type="number" value={form.montant} onChange={e => set('montant', e.target.value)} required className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-texte mb-1">Mois concerné *</label>
                      <input type="month" value={form.mois_concerne} onChange={e => set('mois_concerne', e.target.value)} required className={inputCls} />
                    </div>
                  </div>
                </>
              )}

              {/* Communs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-texte mb-1">Date de paiement *</label>
                  <input type="date" value={form.date_paiement} onChange={e => set('date_paiement', e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-texte mb-1">Statut</label>
                  <select value={form.statut} onChange={e => set('statut', e.target.value)} className={inputCls}>
                    <option value="payé">Payé</option>
                    <option value="en_attente">En attente</option>
                    <option value="impayé">Impayé</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-texte mb-1">Notes (optionnel)</label>
                <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Espèces, virement, chèque..." className={inputCls} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 bg-primaire text-white py-3 rounded-[var(--rayon)] hover:bg-primaire-appui transition font-semibold disabled:opacity-50">
                  {submitting ? 'Enregistrement...' : 'Enregistrer le paiement'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 border border-bordure-forte rounded-[var(--rayon)] hover:bg-surface-appuyee transition text-sm font-medium">
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
