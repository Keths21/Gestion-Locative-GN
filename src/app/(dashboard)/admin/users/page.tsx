'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Clock, Users, RotateCcw, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { Carte, EnTetePage } from '@/components/ui'

interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: string
  status: string
  rejection_reason: string | null
  created_at: string
}

const statusConfig = {
  pending: { label: 'En attente', icon: Clock, className: 'bg-alerte-tenue text-alerte' },
  approved: { label: 'Approuvé', icon: CheckCircle, className: 'bg-succes-tenue text-succes' },
  rejected: { label: 'Refusé', icon: XCircle, className: 'bg-danger-tenue text-danger' },
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ userId: string; name: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  // Une liste vide et un appel en échec se ressemblent à l'écran. On distingue
  // les deux, faute de quoi une panne de configuration passe pour « aucun
  // utilisateur » — ce qui s'est produit après la séparation des bases.
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    setErreur(null)
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (!res.ok) {
        const message = data?.error || `La liste n'a pas pu être chargée (${res.status}).`
        setErreur(message)
        toast.error(message)
        setUsers([])
      } else {
        setUsers(data.users || [])
      }
    } catch {
      const message = 'La liste des utilisateurs est injoignable.'
      setErreur(message)
      toast.error(message)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (userId: string, status: 'approved' | 'rejected' | 'pending', rejection_reason?: string) => {
    setActionLoading(userId)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status, rejection_reason }),
    })

    if (res.ok) {
      toast.success(
        status === 'approved' ? 'Utilisateur approuvé' :
        status === 'rejected' ? 'Utilisateur refusé' : 'Statut mis à jour'
      )
      await fetchUsers()
    } else {
      toast.error('Erreur lors de la mise à jour')
    }
    setActionLoading(null)
    setRejectModal(null)
    setRejectReason('')
  }

  const filtered = filter === 'all' ? users : users.filter(u => u.status === filter)
  const counts = {
    all: users.length,
    pending: users.filter(u => u.status === 'pending').length,
    approved: users.filter(u => u.status === 'approved').length,
    rejected: users.filter(u => u.status === 'rejected').length,
  }

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Gestion des utilisateurs"
        sous="Validez ou refusez les demandes d'accès"
      />

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {(['pending', 'all', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              filter === f
                ? 'bg-primaire text-white'
                : 'bg-surface text-texte-doux border border-bordure hover:bg-surface-appuyee'
            }`}
          >
            {f === 'pending' && <Clock className="h-4 w-4" />}
            {f === 'approved' && <CheckCircle className="h-4 w-4" />}
            {f === 'rejected' && <XCircle className="h-4 w-4" />}
            {f === 'all' && <Users className="h-4 w-4" />}
            {f === 'pending' ? 'En attente' : f === 'all' ? 'Tous' : f === 'approved' ? 'Approuvés' : 'Refusés'}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              filter === f ? 'bg-surface/20' : 'bg-surface-appuyee'
            }`}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Tableau */}
      <Carte className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-texte-faible">
            <div className="animate-spin h-6 w-6 border-2 border-primaire border-t-transparent rounded-full mr-3" />
            Chargement...
          </div>
        ) : erreur ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <XCircle className="h-10 w-10 mb-3 text-danger opacity-70" />
            <p className="text-sm font-medium text-danger">Liste indisponible</p>
            <p className="text-sm text-texte-doux mt-1 max-w-lg">{erreur}</p>
            <button onClick={fetchUsers}
              className="mt-4 flex items-center gap-2 text-sm text-texte-doux border border-bordure px-4 py-2 rounded-[var(--rayon)] hover:bg-surface-appuyee transition">
              <RotateCcw className="h-4 w-4" /> Réessayer
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-texte-faible">
            <Users className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Aucun utilisateur dans cette catégorie</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bordure bg-surface-appuyee">
                  <th className="text-left px-6 py-3 text-xs font-medium text-texte-doux uppercase tracking-wider">Utilisateur</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-texte-doux uppercase tracking-wider">Rôle</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-texte-doux uppercase tracking-wider">Statut</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-texte-doux uppercase tracking-wider">Inscrit le</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-texte-doux uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {filtered.map((user) => {
                  const cfg = statusConfig[user.status as keyof typeof statusConfig]
                  const Icon = cfg?.icon ?? Clock
                  return (
                    <tr key={user.id} className="hover:bg-surface-appuyee transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-texte">{user.full_name || '—'}</div>
                        <div className="text-sm text-texte-faible">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          user.role === 'admin' ? 'bg-info-tenue text-info' : 'bg-surface-appuyee text-texte-doux'
                        }`}>
                          {user.role === 'admin' ? <Shield className="h-3 w-3" /> : null}
                          {user.role === 'admin' ? 'Admin' : 'Utilisateur'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg?.className}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {cfg?.label}
                        </span>
                        {user.rejection_reason && (
                          <p className="text-xs text-texte-faible mt-1 max-w-xs">{user.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-texte-faible">
                        {new Date(user.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4">
                        {user.role !== 'admin' && (
                          <div className="flex items-center justify-end gap-2">
                            {user.status !== 'approved' && (
                              <button
                                onClick={() => updateStatus(user.id, 'approved')}
                                disabled={actionLoading === user.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-succes-tenue text-succes hover:bg-succes-tenue rounded-lg text-xs font-medium transition disabled:opacity-50"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Approuver
                              </button>
                            )}
                            {user.status !== 'rejected' && (
                              <button
                                onClick={() => setRejectModal({ userId: user.id, name: user.full_name || user.email || '' })}
                                disabled={actionLoading === user.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-danger-tenue text-danger hover:bg-danger-tenue rounded-lg text-xs font-medium transition disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Refuser
                              </button>
                            )}
                            {user.status !== 'pending' && (
                              <button
                                onClick={() => updateStatus(user.id, 'pending')}
                                disabled={actionLoading === user.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-appuyee text-texte-doux hover:bg-surface-appuyee rounded-lg text-xs font-medium transition disabled:opacity-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      {/* Modal de refus */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-flottante p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-texte mb-1">Refuser l&apos;accès</h3>
            <p className="text-sm text-texte-doux mb-4">
              Motif du refus pour <span className="font-medium text-texte">{rejectModal.name}</span> (optionnel)
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex: Informations insuffisantes, doublon..."
              className="w-full px-3 py-2 border border-bordure rounded-lg text-sm resize-none focus:ring-2 focus:ring-danger outline-none"
              rows={3}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setRejectModal(null); setRejectReason('') }}
                className="flex-1 px-4 py-2 border border-bordure text-texte-doux rounded-lg text-sm hover:bg-surface-appuyee transition"
              >
                Annuler
              </button>
              <button
                onClick={() => updateStatus(rejectModal.userId, 'rejected', rejectReason || undefined)}
                disabled={actionLoading === rejectModal.userId}
                className="flex-1 px-4 py-2 bg-danger text-white rounded-lg text-sm hover:brightness-110 transition disabled:opacity-50"
              >
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
