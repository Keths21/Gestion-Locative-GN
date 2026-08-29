import Link from 'next/link'
import { CloudOff } from 'lucide-react'

export const metadata = { title: 'Hors ligne — CASA CHAMS' }

/**
 * Dernier recours du service worker : affichée seulement si la page demandée
 * n'a jamais été mise en cache. Volontairement autonome — aucune donnée, aucun
 * appel réseau — pour qu'elle s'affiche toujours.
 */
export default function HorsLigne() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-appuyee px-6 text-center">
      <CloudOff size={44} className="text-texte-faible" />
      <h1 className="text-xl font-semibold text-texte">Cette page n&apos;est pas disponible hors connexion</h1>
      <p className="max-w-md text-sm text-texte-doux">
        Vos parcelles et vos relevés restent enregistrés sur l&apos;appareil. Ils remonteront
        automatiquement dès que le réseau reviendra — rien n&apos;est perdu.
      </p>
      <Link
        href="/carte"
        className="rounded-lg bg-primaire px-5 py-2.5 text-sm font-semibold text-white hover:bg-primaire-appui"
      >
        Revenir à la carte
      </Link>
    </main>
  )
}
