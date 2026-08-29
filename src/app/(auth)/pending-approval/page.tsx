'use client'
import { Building2, Clock, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function PendingApprovalPage() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-fond to-surface-appuyee flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-flottante p-8 w-full max-w-md text-center">
        <div className="flex justify-center mb-4">
          <div className="bg-primaire p-3 rounded-[var(--rayon)]">
            <Building2 className="h-8 w-8 text-white" />
          </div>
        </div>

        <div className="flex justify-center mb-6">
          <div className="bg-alerte-tenue p-4 rounded-full">
            <Clock className="h-10 w-10 text-alerte" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-texte mb-2">
          Compte en attente de validation
        </h2>
        <p className="text-texte-doux text-sm mb-2">
          Votre compte a été créé avec succès.
        </p>
        <p className="text-texte-doux text-sm mb-8">
          Un administrateur doit valider votre accès avant que vous puissiez utiliser la plateforme. Vous recevrez une confirmation par email.
        </p>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 mx-auto text-sm text-texte-faible hover:text-danger transition"
        >
          <LogOut className="h-4 w-4" />
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
