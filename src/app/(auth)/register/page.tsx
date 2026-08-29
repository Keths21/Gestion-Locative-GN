'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nom, setNom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: nom } }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) return (
    <div className="min-h-screen bg-gradient-to-br from-fond to-surface-appuyee flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-flottante p-8 w-full max-w-md text-center">
        <div className="flex justify-center mb-4">
          <div className="bg-succes-tenue p-4 rounded-full">
            <div className="text-succes text-3xl">✓</div>
          </div>
        </div>
        <h2 className="text-xl font-bold text-texte mb-2">Compte créé avec succès !</h2>
        <p className="text-texte-doux text-sm mb-2">
          Vérifiez votre email pour confirmer votre adresse.
        </p>
        <p className="text-texte-doux text-sm mb-6">
          Votre compte sera ensuite examiné par un administrateur avant que vous puissiez accéder à la plateforme.
        </p>
        <Link href="/login" className="text-primaire hover:underline font-medium text-sm">
          Retour à la connexion
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-fond to-surface-appuyee flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-flottante p-8 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primaire p-3 rounded-[var(--rayon)] mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-texte">Créer un compte</h1>
          <p className="text-texte-doux mt-1 text-sm">CASA CHAMS</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {error && (
            <div className="bg-danger-tenue border border-danger/20 text-danger px-4 py-3 rounded-[var(--rayon)] text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-texte mb-1">Nom complet</label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full px-4 py-2.5 border border-bordure-forte rounded-[var(--rayon)] focus:ring-2 focus:ring-primaire outline-none transition"
              placeholder="Votre nom"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-texte mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-bordure-forte rounded-[var(--rayon)] focus:ring-2 focus:ring-primaire outline-none transition"
              placeholder="votre@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-texte mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-bordure-forte rounded-[var(--rayon)] focus:ring-2 focus:ring-primaire outline-none transition"
              placeholder="Min. 8 caractères"
              minLength={8}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primaire hover:bg-primaire-appui text-white font-semibold py-3 px-4 rounded-[var(--rayon)] transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-center text-sm text-texte-doux mt-6">
          Déjà un compte ?{' '}
          <Link href="/login" className="text-primaire hover:underline font-medium">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}
