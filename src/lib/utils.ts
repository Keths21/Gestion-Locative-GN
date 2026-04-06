import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMontant(montant: number, devise = 'GNF') {
  if (devise === 'GNF') {
    return new Intl.NumberFormat('fr-GN', {
      style: 'currency',
      currency: 'GNF',
      maximumFractionDigits: 0
    }).format(montant)
  }
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(montant)
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(date))
}

// Un locataire est actif si : pas de date_sortie, OU date_sortie dans le futur (cas Airbnb)
export function isLocataireActif(locataire: { date_sortie?: string | null }): boolean {
  if (!locataire.date_sortie) return true
  return new Date(locataire.date_sortie) > new Date()
}

export function getMoisActuel() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
