'use client'
import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { Bouton, Carte, EnTetePage } from '@/components/ui'

/**
 * Mon compte — changer son mot de passe.
 *
 * Jusqu'à l'audit de sécurité du 11/10/2026, personne ne pouvait changer son
 * mot de passe dans l'application. Le cas qui comptait le plus : le
 * collaborateur créé avec un mot de passe provisoire, transmis par SMS ou
 * WhatsApp, et qui le gardait faute de moyen d'en changer. La page est
 * ouverte à tout compte approuvé — Paramètres, réservé au propriétaire, ne
 * convenait pas — et reste joignable après expiration de l'abonnement.
 */

// 10 et non les 6 de Supabase : le compte ouvre les données de toute une
// agence, locataires et paiements compris.
const LONGUEUR_MIN = 10

export default function ComptePage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [provisoire, setProvisoire] = useState(false)
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? '')
      setProvisoire(user?.user_metadata?.mot_de_passe_provisoire === true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const erreurSaisie =
    nouveau && nouveau.length < LONGUEUR_MIN ? `Au moins ${LONGUEUR_MIN} caractères.`
    : confirmation && confirmation !== nouveau ? 'Les deux saisies ne correspondent pas.'
    : null

  const changer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (erreurSaisie || !nouveau || nouveau !== confirmation) return
    setEnCours(true)
    const { error } = await supabase.auth.updateUser({
      password: nouveau,
      // Lève le bandeau « mot de passe provisoire » posé à la création du compte.
      data: { mot_de_passe_provisoire: false },
    })
    setEnCours(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setNouveau('')
    setConfirmation('')
    setProvisoire(false)
    toast.success('Mot de passe changé.')
  }

  const champ = 'w-full rounded-[var(--rayon)] border border-bordure-forte px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primaire'

  return (
    <div className="max-w-xl space-y-6">
      <EnTetePage titre="Mon compte" sous={email} />

      {provisoire && (
        <div className="rounded-[var(--rayon)] border border-alerte/20 bg-alerte-tenue px-4 py-3 text-sm text-alerte">
          Votre compte a été créé avec un mot de passe provisoire. Choisissez le vôtre : seul
          vous devez le connaître.
        </div>
      )}

      <Carte className="p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-texte">
          <KeyRound className="h-4 w-4 text-primaire" aria-hidden /> Changer de mot de passe
        </h2>
        <form onSubmit={changer} className="space-y-4">
          <div>
            <label htmlFor="nouveau" className="mb-1 block text-sm font-medium text-texte">Nouveau mot de passe</label>
            <input id="nouveau" type="password" autoComplete="new-password" value={nouveau}
              onChange={(e) => setNouveau(e.target.value)} className={champ} required minLength={LONGUEUR_MIN} />
            <p className="mt-1 text-xs text-texte-doux">Au moins {LONGUEUR_MIN} caractères.</p>
          </div>
          <div>
            <label htmlFor="confirmation" className="mb-1 block text-sm font-medium text-texte">Confirmation</label>
            <input id="confirmation" type="password" autoComplete="new-password" value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)} className={champ} required />
          </div>
          {erreurSaisie && <p className="text-sm text-danger" role="alert">{erreurSaisie}</p>}
          <Bouton type="submit" disabled={enCours || !!erreurSaisie || !nouveau || !confirmation}>
            {enCours ? 'Enregistrement…' : 'Changer le mot de passe'}
          </Bouton>
        </form>
      </Carte>
    </div>
  )
}
