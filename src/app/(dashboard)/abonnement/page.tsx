'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CreditCard, CheckCircle, AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { formatMontant, formatDate } from '@/lib/utils'
import { Carte, EnTetePage } from '@/components/ui'

/**
 * Page d'abonnement.
 *
 * Elle sert trois moments qu'il ne faut pas confondre : l'essai en cours, où il
 * n'y a rien à faire ; l'accès expiré, où l'application est fermée ; et le
 * retour depuis SASPay, où l'on ne sait pas encore si le paiement a abouti.
 *
 * Le troisième est le plus délicat. SASPay redirige le client dès qu'il quitte
 * sa page, sans garantie que la transaction soit réglée — et son webhook peut
 * arriver après. On ne se fie donc ni à l'un ni à l'autre : on interroge notre
 * propre API, qui relit la session chez SASPay.
 */

type Etat = {
  acces_jusqu_au: string
  abonnement_actif: boolean
  a_deja_paye: boolean
} | null

type Paiement = {
  id: string
  montant: number
  devise: string
  statut: string
  periode_debut: string | null
  periode_fin: string | null
  cree_le: string
  paye_le: string | null
}

const libelleStatut: Record<string, { texte: string; classe: string }> = {
  reussi:     { texte: 'Réglé',     classe: 'bg-succes-tenue text-succes' },
  en_attente: { texte: 'En attente', classe: 'bg-alerte-tenue text-alerte' },
  echoue:     { texte: 'Échoué',    classe: 'bg-danger-tenue text-danger' },
  annule:     { texte: 'Annulé',    classe: 'bg-surface-appuyee text-texte-doux' },
}

export default function AbonnementPage() {
  const supabase = createClient()
  const params = useSearchParams()
  const [etat, setEtat] = useState<Etat>(null)
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [verification, setVerification] = useState(false)

  const expire = params.get('expire') === '1'
  const retour = params.get('retour') === '1'

  const charger = useCallback(async () => {
    const [{ data: acces }, { data: histo }] = await Promise.all([
      supabase.rpc('etat_acces').single(),
      supabase
        .from('paiements_abonnement')
        .select('id, montant, devise, statut, periode_debut, periode_fin, cree_le, paye_le')
        .order('cree_le', { ascending: false })
        .limit(12),
    ])
    setEtat(acces as Etat)
    setPaiements((histo ?? []) as Paiement[])
    setChargement(false)
  }, [supabase])

  useEffect(() => { charger() }, [charger])

  // Au retour de SASPay, on demande à notre API de relire la session. Le
  // paiement peut mettre quelques secondes à être confirmé côté opérateur :
  // on réessaie plutôt que de conclure trop vite à un échec.
  useEffect(() => {
    if (!retour) return
    let annule = false
    ;(async () => {
      setVerification(true)
      for (let essai = 0; essai < 5 && !annule; essai++) {
        const r = await fetch('/api/abonnement/verifier', { method: 'POST' })
        const d = await r.json().catch(() => ({}))
        if (d?.creditees > 0) {
          toast.success('Paiement confirmé, merci !')
          break
        }
        await new Promise(r => setTimeout(r, 3000))
      }
      if (!annule) { setVerification(false); charger() }
    })()
    return () => { annule = true }
  }, [retour, charger])

  const payer = async () => {
    setEnvoi(true)
    try {
      const r = await fetch('/api/abonnement/checkout', { method: 'POST' })
      const d = await r.json()
      if (!r.ok || !d.checkout_url) {
        toast.error(d.error || "Le paiement n'a pas pu être ouvert.")
        return
      }
      // On quitte l'application pour la page hébergée SASPay.
      window.location.href = d.checkout_url
    } catch {
      toast.error('Le service de paiement est injoignable.')
    } finally {
      setEnvoi(false)
    }
  }

  const jours = etat
    ? Math.max(0, Math.ceil((new Date(etat.acces_jusqu_au).getTime() - Date.now()) / 86400000))
    : 0

  return (
    <div className="space-y-6 max-w-3xl">
      <EnTetePage titre="Abonnement" sous="CASA CHAMS — accès mensuel" />

      {chargement ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primaire" />
        </div>
      ) : (
        <>
          {verification && (
            <Carte className="p-4 flex items-center gap-3 border-primaire/30 bg-primaire-tenue">
              <Loader2 className="h-5 w-5 text-primaire animate-spin flex-shrink-0" />
              <p className="text-sm text-primaire">
                Vérification du paiement auprès de l&apos;opérateur…
              </p>
            </Carte>
          )}

          {/* État de l'accès */}
          <Carte className={`p-6 ${etat?.abonnement_actif ? '' : 'border-danger/30'}`}>
            <div className="flex items-start gap-4">
              {etat?.abonnement_actif ? (
                <CheckCircle className="h-8 w-8 text-succes flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-danger flex-shrink-0" />
              )}
              <div className="flex-1">
                {etat?.abonnement_actif ? (
                  <>
                    <p className="font-semibold text-texte">
                      {etat.a_deja_paye ? 'Abonnement actif' : `Essai gratuit — ${jours} jour(s) restant(s)`}
                    </p>
                    <p className="text-sm text-texte-doux mt-1">
                      Accès jusqu&apos;au <strong>{formatDate(etat.acces_jusqu_au)}</strong>.
                      {!etat.a_deja_paye && " Passé cette date, l'application se ferme jusqu'au premier règlement."}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-danger">
                      {etat?.a_deja_paye ? 'Abonnement expiré' : 'Essai terminé'}
                    </p>
                    <p className="text-sm text-texte-doux mt-1">
                      Votre accès a pris fin le <strong>{etat && formatDate(etat.acces_jusqu_au)}</strong>.
                      Vos données sont intactes et vous les retrouverez dès le règlement.
                    </p>
                  </>
                )}
              </div>
            </div>

            {expire && !etat?.abonnement_actif && (
              <p className="mt-4 text-sm text-texte-doux border-t border-bordure pt-4">
                Vous avez été redirigé ici parce que la page demandée nécessite un abonnement actif.
              </p>
            )}
          </Carte>

          {/* Régler */}
          <Carte className="p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-texte-doux">Abonnement mensuel</p>
                <p className="text-3xl font-bold text-texte mt-1">{formatMontant(15000)}</p>
                <p className="text-xs text-texte-faible mt-1">
                  Un mois d&apos;accès, ajouté à la suite du précédent — régler en avance ne fait perdre aucun jour.
                </p>
              </div>
              <button
                onClick={payer}
                disabled={envoi}
                className="flex items-center gap-2 bg-primaire text-white px-5 py-3 rounded-[var(--rayon)]
                           hover:bg-primaire-appui transition text-sm font-medium disabled:opacity-50">
                {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {envoi ? 'Ouverture…' : 'Régler par mobile money'}
              </button>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-texte-faible">
              <ShieldCheck className="h-3.5 w-3.5" />
              Paiement traité par SasPay. Nous ne voyons ni ne conservons vos identifiants mobile money.
            </p>
          </Carte>

          {/* Historique */}
          <Carte className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-bordure bg-surface-appuyee">
              <p className="text-sm font-medium text-texte-doux">Historique des règlements</p>
              <button onClick={charger} className="text-texte-doux hover:text-texte transition" aria-label="Actualiser">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {paiements.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-texte-doux">Aucun règlement pour le moment.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-bordure">
                  {paiements.map(p => {
                    const s = libelleStatut[p.statut] ?? libelleStatut.en_attente
                    return (
                      <tr key={p.id}>
                        <td className="px-5 py-3">
                          <p className="font-medium text-texte">{formatMontant(p.montant)}</p>
                          <p className="text-xs text-texte-faible">{formatDate(p.cree_le)}</p>
                        </td>
                        <td className="px-5 py-3 text-texte-doux hidden sm:table-cell">
                          {p.periode_debut && p.periode_fin
                            ? `${formatDate(p.periode_debut)} → ${formatDate(p.periode_fin)}`
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-xs px-2 py-1 rounded-full ${s.classe}`}>{s.texte}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Carte>
        </>
      )}
    </div>
  )
}
