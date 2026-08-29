'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// L'anneau de focus est désormais posé globalement (globals.css) : le champ
// n'a plus à le redéfinir, il lui suffit de ne pas le supprimer.
const champ = cn(
  'w-full rounded-[var(--rayon)] border border-bordure-forte bg-surface px-3.5',
  'min-h-11 text-sm text-texte transition-colors duration-150',
  'hover:border-texte-faible',
)

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-fond p-4">
      <div className="w-full max-w-md rounded-[var(--rayon)] border border-bordure bg-surface p-8 shadow-flottante">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 rounded-[var(--rayon)] bg-primaire p-3" aria-hidden>
            <Building2 className="h-7 w-7 text-sur-primaire" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-texte">CASA CHAMS</h1>
          <p className="mt-1 text-sm text-texte-doux">Connectez-vous à votre espace</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {/* role=alert : l'erreur doit être annoncée au moment où elle
              apparaît, sans quoi elle passe inaperçue au clavier. */}
          {error && (
            <div
              role="alert"
              className="rounded-[var(--rayon)] border border-danger/20 bg-danger-tenue px-4 py-3 text-sm text-danger"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="courriel" className="mb-1.5 block text-sm font-medium text-texte">
              Email
            </label>
            <input
              id="courriel"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={champ}
              placeholder="votre@email.com"
              required
            />
          </div>

          <div>
            <label htmlFor="motdepasse" className="mb-1.5 block text-sm font-medium text-texte">
              Mot de passe
            </label>
            <input
              id="motdepasse"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={champ}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2',
              'rounded-[var(--rayon)] bg-primaire px-4 text-sm font-semibold text-sur-primaire',
              'transition-colors duration-150 hover:bg-primaire-appui disabled:opacity-50',
            )}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-texte-doux">
          Pas encore de compte ?{' '}
          <Link href="/register" className="font-medium text-primaire hover:underline">
            S&apos;inscrire
          </Link>
        </p>
      </div>
    </div>
  )
}
