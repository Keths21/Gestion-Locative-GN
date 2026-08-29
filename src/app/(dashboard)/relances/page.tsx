'use client'
import { useEffect, useState } from 'react'
import { Bell, Mail, Phone, AlertTriangle, CheckCircle, Send, RefreshCw, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatMontant } from '@/lib/utils'
import { envoyerRelanceMultiCanal, estRelancable } from '@/lib/relances'
import toast from 'react-hot-toast'
import { Carte, EnTetePage } from '@/components/ui'

type LocataireImpayes = {
  locataire: any
  paiements: any[]
  total: number
}

function joursDepuis(iso: string): string {
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (jours <= 0) return "aujourd'hui"
  if (jours === 1) return 'il y a 1 jour'
  return `il y a ${jours} jours`
}

// Suffixe indiquant les canaux qui seront utilisés, ex: " (SMS + email)"
function canauxDispo(loc: { email?: string | null; telephone?: string | null }): string {
  const canaux = []
  if (loc.telephone) canaux.push('SMS')
  if (loc.email) canaux.push('email')
  return canaux.length ? ` (${canaux.join(' + ')})` : ''
}

export default function RelancesPage() {
  const [impayes, setImpayes] = useState<LocataireImpayes[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [bulkSending, setBulkSending] = useState(false)
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

  const marquerRelance = async (locId: string) => {
    await supabase.from('locataires').update({ derniere_relance: new Date().toISOString() }).eq('id', locId)
  }

  // Relance d'un locataire sur tous ses canaux disponibles (email + SMS)
  const envoyerRelance = async (item: LocataireImpayes) => {
    if (!item.locataire.email && !item.locataire.telephone) {
      toast.error('Ce locataire n\'a ni email ni téléphone')
      return
    }
    setSending(item.locataire.id)
    try {
      const results = await envoyerRelanceMultiCanal(item, agence)
      const ok = results.filter(r => r.ok)
      const ko = results.filter(r => !r.ok)
      if (ok.length > 0) {
        await marquerRelance(item.locataire.id)
        const canaux = ok.map(r => (r.canal === 'sms' ? 'SMS' : 'email')).join(' + ')
        toast.success(`Relance envoyée (${canaux})`)
      }
      if (ko.length > 0) {
        toast.error(ok.length === 0
          ? (ko[0].error || 'Échec de l\'envoi')
          : `Échec partiel : ${ko.map(r => r.canal).join(', ')}`)
      }
    } finally {
      setSending(null)
      fetchData()
    }
  }

  // Relance groupée : tous les impayés éligibles (non relancés depuis DELAI_RELANCE_JOURS)
  const relancerTous = async () => {
    const cibles = impayes.filter(i => estRelancable(i.locataire))
    if (cibles.length === 0) return
    setBulkSending(true)
    let tenants = 0, sms = 0, email = 0, fails = 0
    for (const item of cibles) {
      const results = await envoyerRelanceMultiCanal(item, agence)
      const ok = results.filter(r => r.ok)
      ok.forEach(r => { if (r.canal === 'sms') sms++; else email++ })
      fails += results.filter(r => !r.ok).length
      if (ok.length > 0) { tenants++; await marquerRelance(item.locataire.id) }
    }
    if (tenants > 0) toast.success(`${tenants} locataire(s) relancé(s) — ${sms} SMS, ${email} email`)
    if (fails > 0) toast.error(`${fails} envoi(s) en échec`)
    setBulkSending(false)
    fetchData()
  }

  const totalImpayes = impayes.reduce((s, i) => s + i.total, 0)
  const eligibles = impayes.filter(i => estRelancable(i.locataire))

  return (
    <div className="space-y-6">
      <EnTetePage titre="Relances" sous={`${impayes.length} locataire(s) avec impayés`}>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="flex items-center gap-2 text-sm text-texte-doux border border-bordure px-4 py-2 rounded-[var(--rayon)] hover:bg-surface-appuyee transition">
            <RefreshCw className="h-4 w-4" /> Actualiser
          </button>
          <button onClick={relancerTous} disabled={bulkSending || eligibles.length === 0}
            title={eligibles.length === 0 ? 'Aucun locataire à relancer (déjà relancés récemment ou sans contact)' : 'Envoyer une relance SMS + email à tous les impayés éligibles'}
            className="flex items-center gap-2 bg-danger text-white px-4 py-2.5 rounded-[var(--rayon)] hover:brightness-110 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
            {bulkSending
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Envoi en cours...</>
              : <><Zap className="h-4 w-4" /> Relancer tous les impayés ({eligibles.length})</>}
          </button>
        </div>
      </EnTetePage>

      {/* Résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-danger-tenue border border-danger/20 rounded-[var(--rayon)] p-4">
          <p className="text-sm text-danger font-medium">Total impayés</p>
          <p className="text-2xl font-bold text-danger mt-1">{formatMontant(totalImpayes)}</p>
        </div>
        <div className="bg-alerte-tenue border border-alerte/20 rounded-[var(--rayon)] p-4">
          <p className="text-sm text-alerte font-medium">Locataires concernés</p>
          <p className="text-2xl font-bold text-alerte mt-1">{impayes.length}</p>
        </div>
        <div className="bg-primaire-tenue border border-primaire/20 rounded-[var(--rayon)] p-4">
          <p className="text-sm text-primaire font-medium">Paiements en retard</p>
          <p className="text-2xl font-bold text-primaire mt-1">{impayes.reduce((s, i) => s + i.paiements.length, 0)}</p>
        </div>
      </div>

      {/* Avertissement config email */}
      <div className="bg-alerte-tenue border border-alerte/20 rounded-[var(--rayon)] p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-alerte flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-alerte">Configuration email requise</p>
          <p className="text-xs text-alerte mt-1">
            Pour envoyer des emails, ajoute ta clé <code className="bg-alerte-tenue px-1 rounded">RESEND_API_KEY</code> dans <code className="bg-alerte-tenue px-1 rounded">.env.local</code>.
            Crée ton compte gratuit sur <a href="https://resend.com" target="_blank" className="underline font-medium">resend.com</a> → API Keys → Create API Key.
          </p>
        </div>
      </div>

      {/* Liste des impayés */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primaire"></div>
        </div>
      ) : impayes.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-[var(--rayon)] border border-bordure">
          <CheckCircle className="h-12 w-12 text-succes mx-auto mb-4" />
          <p className="text-texte font-semibold">Aucun impayé 🎉</p>
          <p className="text-texte-faible text-sm mt-1">Tous les loyers sont à jour !</p>
        </div>
      ) : (
        <div className="space-y-4">
          {impayes.map(item => (
            <Carte key={item.locataire.id} className="border-danger/20 overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-bordure">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-danger-tenue rounded-full flex items-center justify-center">
                    <span className="text-danger font-bold text-sm">
                      {item.locataire.prenom?.[0]}{item.locataire.nom?.[0]}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-texte">{item.locataire.prenom} {item.locataire.nom}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      <span className="text-xs text-texte-faible flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {item.locataire.email || <span className="text-texte-faible">—</span>}
                      </span>
                      <span className="text-xs text-texte-faible flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {item.locataire.telephone || <span className="text-texte-faible">—</span>}
                      </span>
                      {item.locataire.derniere_relance && (
                        <span className="text-xs text-texte-faible flex items-center gap-1">
                          <Bell className="h-3 w-3" />
                          Relancé {joursDepuis(item.locataire.derniere_relance)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-danger text-lg">{formatMontant(item.total)}</p>
                  <p className="text-xs text-texte-faible">{item.paiements.length} mois impayé(s)</p>
                </div>
              </div>

              {/* Liste des mois impayés */}
              <div className="px-5 py-3 bg-danger-tenue">
                <div className="flex flex-wrap gap-2">
                  {item.paiements.map(p => (
                    <span key={p.id} className="text-xs bg-danger-tenue text-danger px-2.5 py-1 rounded-full font-medium">
                      {p.mois_concerne} — {formatMontant(p.montant)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 flex gap-3">
                <button
                  onClick={() => envoyerRelance(item)}
                  disabled={sending === item.locataire.id || (!item.locataire.email && !item.locataire.telephone)}
                  title={!item.locataire.email && !item.locataire.telephone ? 'Aucun email ni téléphone' : 'Envoyer par SMS et/ou email'}
                  className="flex items-center gap-2 bg-danger text-white text-sm px-4 py-2 rounded-[var(--rayon)] hover:brightness-110 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending === item.locataire.id
                    ? <><RefreshCw className="h-4 w-4 animate-spin" /> Envoi...</>
                    : <><Send className="h-4 w-4" /> Relancer{canauxDispo(item.locataire)}</>
                  }
                </button>
                <button
                  onClick={async () => { await marquerRelance(item.locataire.id); toast.success('Marqué comme contacté'); fetchData() }}
                  className="flex items-center gap-2 text-sm border border-bordure px-4 py-2 rounded-[var(--rayon)] hover:bg-surface-appuyee transition text-texte-doux">
                  <Bell className="h-4 w-4" /> Marquer comme contacté
                </button>
              </div>
            </Carte>
          ))}
        </div>
      )}
    </div>
  )
}
