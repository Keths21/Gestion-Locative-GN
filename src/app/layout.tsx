import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GérerSeul Guinée - Gestion Locative',
  description: 'Application de gestion locative immobilière pour la Guinée',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
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
