import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import EnregistrementSW from '@/components/parcelles/EnregistrementSW'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CASA CHAMS - Gestion Locative',
  description: 'Application de gestion locative immobilière pour la Guinée',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'CASA CHAMS', statusBarStyle: 'default' },
}

export const viewport = {
  themeColor: '#2563eb',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <EnregistrementSW />
        {children}
        <Toaster position="top-right" toastOptions={{
          duration: 3000,
          style: { borderRadius: '10px', background: '#333', color: '#fff' },
          success: { style: { background: '#16a34a' } },
          error: { style: { background: '#dc2626' } },
        }} />
      </body>
    </html>
  )
}
