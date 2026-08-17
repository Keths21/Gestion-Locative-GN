'use client'

import { useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

/**
 * Panneau contextuel : colonne latérale sur grand écran, feuille glissante
 * en bas sur mobile — le cas d'usage réel étant un téléphone tenu d'une main
 * sur le terrain.
 *
 * L'appelant doit passer une `key` liée à la parcelle affichée : changer de
 * parcelle remonte le composant, ce qui replie la feuille sans avoir à
 * réinitialiser l'état depuis un effet.
 */
export default function PanneauParcelle({
  titre,
  sousTitre,
  onFermer,
  children,
  actions,
}: {
  titre: string
  sousTitre?: string
  onFermer: () => void
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  const [plein, setPlein] = useState(false)
  const depart = useRef<number | null>(null)

  const surDebut = (e: React.PointerEvent) => {
    depart.current = e.clientY
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const surFin = (e: React.PointerEvent) => {
    if (depart.current === null) return
    const delta = e.clientY - depart.current
    depart.current = null
    if (delta < -40) setPlein(true)
    else if (delta > 60) {
      if (plein) setPlein(false)
      else onFermer()
    }
  }

  return (
    <section
      className={`pointer-events-auto absolute z-[1000] flex flex-col overflow-hidden border-gray-200 bg-white/97 backdrop-blur
        inset-x-0 bottom-0 rounded-t-2xl border-t shadow-[0_-8px_30px_rgba(0,0,0,0.15)]
        md:inset-y-2 md:left-2 md:right-auto md:w-[400px] md:rounded-2xl md:border md:shadow-2xl
        ${plein ? 'max-h-[88%]' : 'max-h-[58%]'} md:max-h-none`}
    >
      <div
        className="shrink-0 cursor-grab touch-none pt-2 md:hidden"
        onPointerDown={surDebut}
        onPointerUp={surFin}
        onPointerCancel={() => (depart.current = null)}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-gray-300" />
      </div>

      <header className="flex shrink-0 items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-900">{titre}</h2>
          {sousTitre && <p className="mt-0.5 truncate text-xs text-gray-500">{sousTitre}</p>}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <button
            onClick={() => (plein ? setPlein(false) : onFermer())}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fermer"
          >
            {plein ? <ChevronDown size={18} /> : <X size={18} />}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </section>
  )
}
