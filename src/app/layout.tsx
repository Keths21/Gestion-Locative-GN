import type { Metadata } from 'next'
import { Fira_Sans, Fira_Code } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import EnregistrementSW from '@/components/parcelles/EnregistrementSW'
import { configSupabaseServeur, scriptConfigSupabase } from '@/lib/config-supabase'
import { environnement } from '@/lib/environnement'

// L'adresse du projet Supabase est lue au démarrage du serveur, pas figée à la
// construction (voir lib/config-supabase.ts). Le navigateur ne peut donc plus
// la trouver dans son bundle : ce layout la lui transmet.
//
// Ce qui interdit tout rendu statique. Une page prérendue verrait sa valeur
// gravée dans le HTML au build — soit précisément ce qu'on cherche à éviter,
// avec en prime une construction qui exigerait des variables d'exécution. Le
// coût est nul ici : chaque page passe déjà par le proxy d'authentification.
export const dynamic = 'force-dynamic'

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
  const env = environnement()

  return (
    <html lang="fr" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body className="font-[family-name:var(--font-sans)] antialiased">
        {/*
          Bandeau d'environnement.

          Rendu ici, dans le layout racine, pour couvrir aussi la connexion et
          l'inscription : c'est souvent là qu'on se trompe de site.

          z-index 2000 : au-dessus de tout, modales comprises (l'échelle de
          l'application s'arrête à 1500). Un marqueur qu'une fenêtre peut cacher
          ne marque rien.

          pointer-events-none : il ne doit jamais intercepter un clic. Il informe,
          il ne participe pas.

          En bas à gauche : les notifications occupent le coin haut-droit, et
          l'en-tête le haut. Le retrait de sécurité suit l'encoche des appareils
          installés en PWA.
        */}
        {!env.production && (
          <div
            className="fixed left-3 bottom-3 z-[2000] pointer-events-none select-none
                       rounded-[var(--rayon)] border border-alerte/40 bg-alerte-tenue
                       px-3 py-1.5 text-alerte shadow-flottante"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          >
            <span className="block text-[11px] font-bold uppercase tracking-[0.12em]">
              {env.nom}
            </span>
            <span className="block text-[11px] opacity-80">données de test</span>
          </div>
        )}
        {/*
          Premier élément du corps, donc exécuté pendant l'analyse du HTML :
          la configuration est en place bien avant que React n'hydrate et que
          le premier createClient() du navigateur ne s'exécute.
        */}
        <script
          id="config-supabase"
          dangerouslySetInnerHTML={{ __html: scriptConfigSupabase(configSupabaseServeur()) }}
        />
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
