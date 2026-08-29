import type { Metadata } from 'next'
import { Fira_Sans, Fira_Code } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import EnregistrementSW from '@/components/parcelles/EnregistrementSW'

// Fira Sans pour le texte : plus humaniste qu'Inter, et ses formes restent
// distinctes en petit corps — ce qui compte dans des tableaux denses.
// Fira Code pour les montants : voir la classe .chiffres dans globals.css,
// c'est l'alignement des colonnes de loyers qui la justifie.
//
// Les deux sont chargées par next/font, donc auto-hébergées : aucun appel à
// Google au chargement, ce qui vaut mieux sur une connexion guinéenne.
const firaSans = Fira_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CASA CHAMS - Gestion Locative',
  description: 'Application de gestion locative immobilière pour la Guinée',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'CASA CHAMS', statusBarStyle: 'default' },
}

export const viewport = {
  // Suit la couleur de marque : c'est la teinte de la barre système une fois
  // l'application installée.
  themeColor: '#0f766e',
  // Nécessaire pour que env(safe-area-inset-*) soit non nul : sans cela,
  // l'application installée passe sous l'encoche et la barre d'accueil.
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body className="font-[family-name:var(--font-sans)] antialiased">
        <EnregistrementSW />
        {children}
        <Toaster position="top-right" toastOptions={{
          duration: 3000,
          style: {
            borderRadius: 'var(--rayon)',
            background: 'var(--texte)',
            color: '#f8fafc',
            fontSize: '0.875rem',
          },
          success: { style: { background: 'var(--succes)' } },
          error: { style: { background: 'var(--danger)' } },
        }} />
      </body>
    </html>
  )
}
