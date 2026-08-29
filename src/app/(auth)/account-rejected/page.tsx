'use client'
import { Building2, XCircle, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AccountRejectedPage() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
        <div className="flex justify-center mb-4">
          <div className="bg-primaire p-3 rounded-xl">
            <Building2 className="h-8 w-8 text-white" />
          </div>
        </div>

        <div className="flex justify-center mb-6">
          <div className="bg-red-100 p-4 rounded-full">
            <XCircle className="h-10 w-10 text-red-600" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Accès refusé
        </h2>
        <p className="text-gray-500 text-sm mb-8">
          Votre demande d&apos;accès à la plateforme a été refusée par l&apos;administrateur. Contactez le support pour plus d&apos;informations.
        </p>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 mx-auto text-sm text-gray-400 hover:text-red-500 transition"
        >
          <LogOut className="h-4 w-4" />
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
