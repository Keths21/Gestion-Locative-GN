'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, Users, CreditCard,
  FileText, Bell, Settings, LogOut, Menu, X, Shield, Map, LandPlot, HardHat
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import { garantirCompte, viderTout } from '@/lib/offline/idb'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/biens', label: 'Biens', icon: Building2 },
  { href: '/locataires', label: 'Locataires', icon: Users },
  { href: '/paiements', label: 'Paiements', icon: CreditCard },
  { href: '/carte', label: 'Carte', icon: Map },
  { href: '/parcelles', label: 'Parcelles', icon: LandPlot },
  { href: '/chantiers', label: 'Chantiers', icon: HardHat },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/relances', label: 'Relances', icon: Bell },
  { href: '/parametres', label: 'Paramètres', icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return

      // Avant toute lecture locale : le magasin hors-ligne survit à la
      // déconnexion, et servirait sinon les parcelles du compte précédent à
      // celui qui prend sa place sur le même navigateur.
      garantirCompte(user.id).catch(() => {})

      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => setIsAdmin(data?.role === 'admin'))
    })
  }, [])

  const handleLogout = async () => {
    // On purge AVANT de fermer la session : après signOut, un rendu peut
    // repartir et relire le magasin entre-temps.
    await viderTout().catch(() => {})
    await supabase.auth.signOut()
    router.push('/login')
  }

  // La carte occupe tout l'espace : ni marge intérieure, ni défilement.
  const pleinEcran = pathname === '/carte'

  /*
   * Échelle d'empilement de l'application :
   *   Leaflet et ses contrôles      jusqu'à ~800 (imposé par la bibliothèque)
   *   surcouches de la carte        900 – 1000
   *   habillage (en-tête, menu)     1100 – 1200   ← doit rester au-dessus
   *   tiroirs et fenêtres modales   1500 +
   *
   * Le menu était en z-50, donc sous les contrôles de carte : il s'ouvrait
   * bel et bien, mais derrière la carte, et paraissait inaccessible.
   */
  // Une seule définition du lien de navigation, état actif compris : la barre
  // latérale et la section Administration divergeaient auparavant (bleu ici,
  // violet là), ce qui laissait croire à deux natures de navigation.
  const lienNav = (actif: boolean) => cn(
    'flex items-center gap-3 rounded-[var(--rayon)] px-3 text-sm font-medium',
    'transition-colors duration-150 min-h-11',
    actif
      ? 'bg-primaire text-sur-primaire'
      : 'text-texte-doux hover:bg-surface-appuyee hover:text-texte',
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-fond">
      <aside className={cn(
        'fixed inset-y-0 left-0 z-[1200] w-64 border-r border-bordure bg-surface',
        'transform transition-transform duration-300 lg:static lg:inset-auto lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex h-full flex-col">
          {/* Marque */}
          <div className="flex items-center justify-between border-b border-bordure p-5">
            <div className="flex items-center gap-2.5">
              <span className="rounded-[var(--rayon)] bg-primaire p-1.5" aria-hidden>
                <Building2 className="h-5 w-5 text-sur-primaire" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight text-texte">CASA CHAMS</p>
                <p className="text-xs text-texte-faible">Guinée</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="cursor-pointer rounded p-1 text-texte-doux hover:bg-surface-appuyee lg:hidden"
              aria-label="Fermer le menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  // aria-current : le seul indice de la page courante était la
                  // couleur, invisible pour un lecteur d'écran.
                  aria-current={isActive ? 'page' : undefined}
                  className={lienNav(isActive)}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {item.label}
                </Link>
              )
            })}

            {isAdmin && (
              <>
                <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-texte-faible">
                  Administration
                </p>
                <Link
                  href="/admin/users"
                  onClick={() => setSidebarOpen(false)}
                  aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
                  className={lienNav(pathname.startsWith('/admin'))}
                >
                  <Shield className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  Utilisateurs
                </Link>
              </>
            )}
          </nav>

          <div className="border-t border-bordure p-3">
            <button
              onClick={handleLogout}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3 rounded-[var(--rayon)] px-3',
                'min-h-11 text-sm font-medium text-texte-doux',
                'transition-colors duration-150 hover:bg-danger-tenue hover:text-danger',
              )}
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden />
              Déconnexion
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[1150] bg-texte/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tête mobile — au-dessus de la carte, et respectant l'encoche
            de l'écran quand l'application est installée. */}
        <header
          className={cn(
            'relative z-[1100] flex shrink-0 items-center gap-3 lg:hidden',
            'border-b border-bordure bg-surface px-4 pb-3',
          )}
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
            className="-ml-2 cursor-pointer rounded p-2 text-texte-doux hover:bg-surface-appuyee"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primaire p-1" aria-hidden>
              <Building2 className="h-4 w-4 text-sur-primaire" />
            </span>
            <span className="font-semibold tracking-tight text-texte">CASA CHAMS</span>
          </div>
        </header>

        <main className={cn(
          'min-h-0 flex-1',
          pleinEcran ? 'overflow-hidden' : 'overflow-auto p-5 lg:p-6',
        )}>
          {children}
        </main>
      </div>
    </div>
  )
}
