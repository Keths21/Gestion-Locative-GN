/*
 * Primitives d'interface.
 *
 * Le dossier existait mais était vide : chaque page recopiait ses propres
 * chaînes de classes, si bien que « une carte » s'écrivait de six façons dans
 * l'application. Ce fichier fixe une seule définition par objet, adossée aux
 * jetons de globals.css.
 *
 * Volontairement en un seul fichier tant qu'il tient : six petits composants
 * répartis en six fichiers coûteraient plus en navigation qu'ils ne
 * rapporteraient en rangement.
 */
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/* ─── Carte ──────────────────────────────────────────────────────────────── */

export function Carte({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-surface border border-bordure rounded-[var(--rayon)] shadow-carte',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* ─── En-tête de page ────────────────────────────────────────────────────── */

export function EnTetePage({
  titre,
  sous,
  children,
}: {
  titre: string
  sous?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {/* tracking resserré : à ce corps, l'interlettrage par défaut fait
            flotter le titre au-dessus de son sous-titre */}
        <h1 className="text-2xl font-semibold tracking-tight text-texte">{titre}</h1>
        {sous && <p className="mt-1 text-sm text-texte-doux">{sous}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

/* ─── Pastille d'état ────────────────────────────────────────────────────── */

const TONS = {
  neutre: 'bg-surface-appuyee text-texte-doux border-bordure',
  primaire: 'bg-primaire-tenue text-primaire border-primaire/20',
  succes: 'bg-succes-tenue text-succes border-succes/20',
  alerte: 'bg-alerte-tenue text-alerte border-alerte/20',
  danger: 'bg-danger-tenue text-danger border-danger/20',
  info: 'bg-info-tenue text-info border-info/20',
} as const

export type Ton = keyof typeof TONS

export function Pastille({
  ton = 'neutre',
  icone: Icone,
  children,
  className,
}: {
  ton?: Ton
  icone?: LucideIcon
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        // whitespace-nowrap : une pastille qui passe à la ligne casse
        // l'alignement de la rangée entière
        'whitespace-nowrap',
        TONS[ton],
        className,
      )}
    >
      {Icone && <Icone className="h-3 w-3 shrink-0" aria-hidden />}
      {children}
    </span>
  )
}

/* ─── Bouton ─────────────────────────────────────────────────────────────── */

const ALLURES = {
  primaire: 'bg-primaire text-sur-primaire hover:bg-primaire-appui border-transparent',
  secondaire: 'bg-surface text-texte hover:bg-surface-appuyee border-bordure-forte',
  discret: 'bg-transparent text-texte-doux hover:bg-surface-appuyee border-transparent',
  danger: 'bg-danger text-white hover:brightness-110 border-transparent',
} as const

export function Bouton({
  allure = 'primaire',
  icone: Icone,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  allure?: keyof typeof ALLURES
  icone?: LucideIcon
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--rayon)] border',
        'px-4 text-sm font-medium transition-colors duration-150',
        // 44px de haut : le minimum tactile. En dessous, la cible se rate au
        // pouce, ce qui compte ici — l'application sert beaucoup sur mobile.
        'min-h-11',
        'disabled:opacity-50 disabled:pointer-events-none',
        'cursor-pointer',
        ALLURES[allure],
        className,
      )}
      {...props}
    >
      {Icone && <Icone className="h-4 w-4 shrink-0" aria-hidden />}
      {children}
    </button>
  )
}

/* ─── Tuile de statistique ───────────────────────────────────────────────── */

export function Tuile({
  libelle,
  valeur,
  icone: Icone,
  ton = 'primaire',
  detail,
  accessoire,
  accent,
  className,
  children,
}: {
  libelle: string
  valeur: string | number
  icone: LucideIcon
  ton?: Ton
  detail?: string
  accessoire?: React.ReactNode
  /** Colore la valeur — réservé à ce qui appelle une action, comme les impayés. */
  accent?: 'danger' | 'succes'
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Carte className={cn('p-5', className)}>
      <div className="mb-3 flex items-start justify-between gap-2">
        {/* L'icône est décorative : le libellé dit déjà tout, la lui faire
            annoncer par un lecteur d'écran ne ferait que doubler. */}
        <span
          className={cn('rounded-[var(--rayon)] border p-2', TONS[ton])}
          aria-hidden
        >
          <Icone className="h-4 w-4" />
        </span>
        {accessoire}
      </div>

      <p
        className={cn(
          'chiffres text-2xl font-semibold tracking-tight',
          accent === 'danger' && 'text-danger',
          accent === 'succes' && 'text-succes',
          !accent && 'text-texte',
        )}
      >
        {valeur}
      </p>
      <p className="mt-0.5 text-sm text-texte-doux">{libelle}</p>
      {detail && <p className="mt-1 text-xs text-texte-faible">{detail}</p>}
      {children}
    </Carte>
  )
}

/* ─── État vide ──────────────────────────────────────────────────────────── */

export function RienAAfficher({
  icone: Icone,
  titre,
  sous,
  children,
}: {
  icone: LucideIcon
  titre: string
  sous?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 rounded-full bg-surface-appuyee p-3" aria-hidden>
        <Icone className="h-6 w-6 text-texte-faible" />
      </span>
      <p className="font-medium text-texte">{titre}</p>
      {sous && <p className="mt-1 max-w-sm text-sm text-texte-doux">{sous}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
