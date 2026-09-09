'use client'
import { useCallback, useEffect, useState } from 'react'
import { UserPlus, Trash2, Loader2, Clock, CheckCircle2, Users, KeyRound, Copy, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Carte } from '@/components/ui'

/**
 * Gestion des collaborateurs.
 *
 * Les droits sont accordés par DOMAINE et non par page, parce que plusieurs
 * pages lisent les mêmes tables : Tableau de bord, Relances et Documents
 * interrogent toutes `locataires` et `paiements`. Autoriser l'une en refusant
 * l'autre n'aurait masqué qu'un menu, la donnée restant lisible autrement.
 */

type Droit = 'aucun' | 'lecture' | 'ecriture'

type Collaborateur = {
  id: string
  email: string
  user_id: string | null
  droit_locatif: Droit
  droit_foncier: Droit
  droit_chantiers: Droit
  cree_le: string
}

const DOMAINES = [
  { cle: 'droit_locatif'   as const, titre: 'Locatif',   detail: 'Biens, locataires, paiements, relances, documents' },
  { cle: 'droit_foncier'   as const, titre: 'Foncier',   detail: 'Carte et parcelles' },
  { cle: 'droit_chantiers' as const, titre: 'Chantiers', detail: 'Chantiers, budget, intervenants' },
]

const NIVEAUX: { valeur: Droit; libelle: string }[] = [
  { valeur: 'aucun',    libelle: 'Aucun accès' },
  { valeur: 'lecture',  libelle: 'Lecture seule' },
  { valeur: 'ecriture', libelle: 'Lecture et écriture' },
]

const VIDE = {
  email: '', nom: '', creer_compte: true,
  droit_locatif: 'aucun', droit_foncier: 'aucun', droit_chantiers: 'aucun',
} as const

/** Identifiants fraîchement créés, montrés une seule fois. */
type Identifiants = { email: string; motDePasse: string }

export default function Collaborateurs() {
  const [liste, setListe] = useState<Collaborateur[]>([])
  const [chargement, setChargement] = useState(true)
  const [form, setForm] = useState<{
    email: string; nom: string; creer_compte: boolean
    droit_locatif: Droit; droit_foncier: Droit; droit_chantiers: Droit
  }>({ ...VIDE })
  const [identifiants, setIdentifiants] = useState<Identifiants | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [enCours, setEnCours] = useState<string | null>(null)
  const [refuse, setRefuse] = useState(false)

  const charger = useCallback(async () => {
    const r = await fetch('/api/collaborateurs')
    if (r.status === 403) { setRefuse(true); setChargement(false); return }
    const d = await r.json()
    setListe(d.collaborateurs ?? [])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const inviter = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnvoi(true)
    try {
      const r = await fetch('/api/collaborateurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? "L'invitation a échoué."); return }

      if (d.mot_de_passe) {
        // Affiché une seule fois : il n'est stocké nulle part, ni ici ni en base.
        setIdentifiants({ email: form.email, motDePasse: d.mot_de_passe })
        toast.success('Compte créé.')
      } else {
        toast.success(d.message ?? `${form.email} a été invité.`)
      }
      setForm({ ...VIDE })
      charger()
    } finally {
      setEnvoi(false)
    }
  }

  const modifier = async (c: Collaborateur, cle: typeof DOMAINES[number]['cle'], valeur: Droit) => {
    setEnCours(c.id)
    // Optimiste : le réglage suit le doigt. En cas d'échec on recharge, ce qui
    // remet la vérité du serveur.
    setListe(l => l.map(x => (x.id === c.id ? { ...x, [cle]: valeur } : x)))
    try {
      const r = await fetch('/api/collaborateurs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: c.id,
          droit_locatif: c.droit_locatif,
          droit_foncier: c.droit_foncier,
          droit_chantiers: c.droit_chantiers,
          [cle]: valeur,
        }),
      })
      if (!r.ok) { toast.error('La modification a échoué.'); charger() }
    } finally {
      setEnCours(null)
    }
  }

  const retirer = async (c: Collaborateur) => {
    setEnCours(c.id)
    try {
      const r = await fetch(`/api/collaborateurs?id=${c.id}`, { method: 'DELETE' })
      if (!r.ok) { toast.error('La suppression a échoué.'); return }
      toast.success(`${c.email} n'a plus accès.`)
      setListe(l => l.filter(x => x.id !== c.id))
    } finally {
      setEnCours(null)
    }
  }

  if (refuse) return null

  return (
    <Carte className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-5 w-5 text-primaire" />
        <h3 className="font-semibold text-texte">Collaborateurs</h3>
      </div>
      <p className="text-sm text-texte-doux mb-5">
        Invitez quelqu&apos;un par son adresse et choisissez ce qu&apos;il peut voir ou modifier.
        L&apos;accès s&apos;active à sa première connexion.
      </p>

      {/* Identifiants fraîchement créés — une seule occasion de les relever */}
      {identifiants && (
        <div className="mb-6 border border-succes/40 bg-succes-tenue rounded-[var(--rayon)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <KeyRound className="h-5 w-5 text-succes flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-succes text-sm">Compte créé</p>
                <p className="text-xs text-texte-doux mt-0.5">
                  Transmettez ces identifiants par SMS ou WhatsApp. Le mot de passe
                  n&apos;est affiché <strong>qu&apos;une fois</strong> : il n&apos;est
                  conservé nulle part.
                </p>
              </div>
            </div>
            <button onClick={() => setIdentifiants(null)}
              className="text-texte-doux hover:text-texte flex-shrink-0" aria-label="Masquer">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {[
              { label: 'Adresse', valeur: identifiants.email },
              { label: 'Mot de passe provisoire', valeur: identifiants.motDePasse },
            ].map(({ label, valeur }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-texte-doux w-40 flex-shrink-0">{label}</span>
                <code className="flex-1 bg-surface border border-bordure rounded px-3 py-1.5
                                 text-sm font-mono text-texte truncate">{valeur}</code>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(valeur)
                      .then(() => toast.success('Copié'))
                      .catch(() => toast.error('Copie impossible'))
                  }}
                  className="p-2 text-texte-doux hover:text-texte hover:bg-surface-appuyee rounded transition flex-shrink-0"
                  aria-label={`Copier : ${label}`}>
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <p className="text-xs text-texte-faible mt-3">
            Demandez-lui de le changer après sa première connexion.
          </p>
        </div>
      )}

      {/* Invitation */}
      <form onSubmit={inviter} className="space-y-4 border border-bordure rounded-[var(--rayon)] p-4 mb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="email" required placeholder="adresse@exemple.com"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full px-4 py-2.5 border border-bordure-forte rounded-[var(--rayon)]
                       focus:ring-2 focus:ring-primaire outline-none text-sm"
          />
          <input
            type="text" placeholder="Nom (facultatif)"
            value={form.nom}
            onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
            className="w-full px-4 py-2.5 border border-bordure-forte rounded-[var(--rayon)]
                       focus:ring-2 focus:ring-primaire outline-none text-sm"
          />
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox" checked={form.creer_compte}
            onChange={e => setForm(f => ({ ...f, creer_compte: e.target.checked }))}
            className="mt-0.5 h-4 w-4 accent-[var(--primaire)]"
          />
          <span className="text-sm text-texte">
            Créer le compte maintenant
            <span className="block text-xs text-texte-doux">
              Un mot de passe provisoire est tiré au sort et affiché une fois, à lui transmettre
              vous-même. Sans cette case, la personne devra s&apos;inscrire elle-même avec cette adresse.
            </span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {DOMAINES.map(d => (
            <div key={d.cle}>
              <label className="block text-xs font-medium text-texte-doux mb-1">{d.titre}</label>
              <select
                value={form[d.cle]}
                onChange={e => setForm(f => ({ ...f, [d.cle]: e.target.value as Droit }))}
                className="w-full px-3 py-2 border border-bordure rounded-[var(--rayon)] bg-surface text-sm">
                {NIVEAUX.map(n => <option key={n.valeur} value={n.valeur}>{n.libelle}</option>)}
              </select>
              <p className="text-[11px] text-texte-faible mt-1">{d.detail}</p>
            </div>
          ))}
        </div>
        <button type="submit" disabled={envoi}
          className="flex items-center gap-2 bg-primaire text-white px-4 py-2.5 rounded-[var(--rayon)]
                     hover:bg-primaire-appui transition text-sm font-medium disabled:opacity-50">
          {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Inviter
        </button>
      </form>

      {/* Liste */}
      {chargement ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-texte-doux" />
        </div>
      ) : liste.length === 0 ? (
        <p className="text-sm text-texte-doux text-center py-6">
          Aucun collaborateur. Vous êtes seul sur cette agence.
        </p>
      ) : (
        <div className="space-y-3">
          {liste.map(c => (
            <div key={c.id} className="border border-bordure rounded-[var(--rayon)] p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="font-medium text-texte truncate">{c.email}</p>
                  <p className="text-xs mt-0.5 flex items-center gap-1.5">
                    {c.user_id ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-succes" /><span className="text-succes">Compte actif</span></>
                    ) : (
                      <><Clock className="h-3.5 w-3.5 text-alerte" /><span className="text-alerte">En attente de sa première connexion</span></>
                    )}
                  </p>
                </div>
                <button onClick={() => retirer(c)} disabled={enCours === c.id}
                  className="text-danger hover:bg-danger-tenue p-2 rounded-[var(--rayon)] transition flex-shrink-0"
                  aria-label={`Retirer ${c.email}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {DOMAINES.map(d => (
                  <div key={d.cle}>
                    <label className="block text-[11px] font-medium text-texte-doux mb-1">{d.titre}</label>
                    <select
                      value={c[d.cle]}
                      disabled={enCours === c.id}
                      onChange={e => modifier(c, d.cle, e.target.value as Droit)}
                      className="w-full px-2.5 py-1.5 border border-bordure rounded-[var(--rayon)] bg-surface text-sm disabled:opacity-50">
                      {NIVEAUX.map(n => <option key={n.valeur} value={n.valeur}>{n.libelle}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Carte>
  )
}
