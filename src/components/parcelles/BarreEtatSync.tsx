'use client'

import { Cloud, CloudOff, CircleAlert, RefreshCw, LogIn } from 'lucide-react'
import Link from 'next/link'
import { useMagasin } from './MagasinParcelles'

/**
 * État de la synchronisation, cliquable pour forcer une remontée.
 *
 * Les quatre états sont volontairement distincts : « hors ligne » et
 * « session expirée » demandent des gestes opposés — attendre le réseau,
 * ou se reconnecter. Les confondre laisserait un agent penser que ses
 * relevés vont partir alors qu'ils resteront bloqués.
 */
export default function BarreEtatSync({ compact }: { compact?: boolean }) {
  const { enLigne, syncEnCours, enAttente, derniereSyncLe, sessionExpiree, synchroniserMaintenant } =
    useMagasin()

  if (sessionExpiree) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-lg bg-danger-tenue px-2 py-1.5 text-xs font-medium text-danger hover:bg-danger-tenue"
        title="Vos relevés sont conservés sur l'appareil et partiront après reconnexion"
      >
        <LogIn size={15} />
        {!compact && <span>Reconnexion requise</span>}
        {enAttente > 0 && <span className="tabular-nums">({enAttente})</span>}
      </Link>
    )
  }

  const etat = !enLigne
    ? { texte: 'Hors ligne', classe: 'text-alerte hover:bg-alerte-tenue', Icone: CloudOff }
    : syncEnCours
      ? { texte: 'Synchronisation…', classe: 'text-primaire hover:bg-primaire-tenue', Icone: RefreshCw }
      : enAttente > 0
        ? {
            texte: `${enAttente} en attente`,
            classe: 'text-alerte hover:bg-alerte-tenue',
            Icone: CircleAlert,
          }
        : { texte: 'À jour', classe: 'text-succes hover:bg-succes-tenue', Icone: Cloud }

  const { Icone } = etat

  return (
    <button
      onClick={() => void synchroniserMaintenant()}
      title={
        derniereSyncLe
          ? `Dernière synchronisation : ${new Date(derniereSyncLe).toLocaleString('fr-FR')}`
          : 'Jamais synchronisé'
      }
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium ${etat.classe}`}
    >
      <Icone size={15} className={syncEnCours ? 'animate-spin' : ''} />
      {!compact && <span>{etat.texte}</span>}
    </button>
  )
}
