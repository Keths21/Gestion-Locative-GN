'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, CircleCheck, FileText, Images, Loader2, MapPin,
  MessageSquare, Trash2, TriangleAlert,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  ajouterEntree, journalParEmplacement, listerJournal, resoudreSignalement,
  supprimerEntree, type EntreeAvecUrl, type EntreeGroupee, type GraviteSignalement, type TypeEntree,
} from '@/lib/journal-chantier'

/**
 * Journal de chantier.
 *
 * Deux lectures du même contenu : le fil chronologique, pour suivre au jour
 * le jour ; et le regroupement par emplacement, qui rapproche les prises
 * faites au même endroit à des dates différentes — c'est ce qui documente
 * l'évolution d'un point précis sans que personne ait eu à étiqueter ses
 * photos sur le terrain.
 */

const classeChamp =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primaire'

const couleursGravite: Record<GraviteSignalement, string> = {
  info: 'bg-gray-100 text-gray-700',
  attention: 'bg-amber-100 text-amber-800',
  bloquant: 'bg-red-100 text-red-800',
}

export default function JournalChantier({
  chantierId,
  organisationId,
  lectureSeule,
}: {
  chantierId: string
  organisationId: string
  lectureSeule?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const input = useRef<HTMLInputElement>(null)

  const [entrees, setEntrees] = useState<EntreeAvecUrl[]>([])
  const [groupes, setGroupes] = useState<EntreeGroupee[]>([])
  const [vue, setVue] = useState<'fil' | 'emplacement'>('fil')
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null)

  const [f, setF] = useState({
    type: 'photo' as TypeEntree,
    texte: '',
    gravite: 'attention' as GraviteSignalement,
  })

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const [e, g] = await Promise.all([
        listerJournal(supabase, chantierId),
        journalParEmplacement(supabase, chantierId).catch(() => []),
      ])
      setEntrees(e)
      setGroupes(g)
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setChargement(false)
    }
  }, [supabase, chantierId])

  useEffect(() => {
    void charger()
  }, [charger])

  // La position sert à géolocaliser les prises : sans elle, pas de
  // regroupement par emplacement.
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (p) => setPosition({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setPosition(null),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const enregistrer = async (fichier?: File | null) => {
    if (!fichier && !f.texte.trim()) {
      setErreur('Ajoutez une photo ou un texte.')
      return
    }
    setEnvoi(true)
    setErreur(null)
    try {
      await ajouterEntree(supabase, {
        chantierId,
        organisationId,
        type: fichier ? (f.type === 'signalement' ? 'signalement' : 'photo') : f.type,
        texte: f.texte.trim() || null,
        gravite: f.type === 'signalement' ? f.gravite : null,
        position,
        fichier,
      })
      setF({ ...f, texte: '' })
      if (input.current) input.current.value = ''
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setEnvoi(false)
    }
  }

  const signalementsOuverts = entrees.filter(
    (e) => e.type === 'signalement' && e.statut === 'ouvert'
  )

  return (
    <div className="space-y-4">
      {signalementsOuverts.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <TriangleAlert size={15} className="mr-1.5 inline" />
          {signalementsOuverts.length} signalement(s) ouvert(s)
          {signalementsOuverts.some((e) => e.gravite === 'bloquant') && (
            <span className="font-semibold"> · dont au moins un bloquant</span>
          )}
        </div>
      )}

      {!lectureSeule && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex gap-1">
            {([['photo', 'Photo', Camera], ['note', 'Note', MessageSquare],
               ['signalement', 'Signalement', TriangleAlert]] as const).map(([k, l, Icone]) => (
              <button key={k} onClick={() => setF({ ...f, type: k })}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                        f.type === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                <Icone size={13} /> {l}
              </button>
            ))}
          </div>

          <textarea className={`${classeChamp} min-h-16`}
                    placeholder={f.type === 'signalement'
                      ? 'Ex. Problème d’étanchéité à l’angle nord-ouest'
                      : 'Commentaire (facultatif pour une photo)'}
                    value={f.texte} onChange={(e) => setF({ ...f, texte: e.target.value })} />

          {f.type === 'signalement' && (
            <select className={`${classeChamp} mt-2`} value={f.gravite}
                    onChange={(e) => setF({ ...f, gravite: e.target.value as GraviteSignalement })}>
              <option value="info">Information</option>
              <option value="attention">À surveiller</option>
              <option value="bloquant">Bloquant</option>
            </select>
          )}

          <input ref={input} type="file" accept="image/*,application/pdf" capture="environment"
                 className="hidden" onChange={(e) => void enregistrer(e.target.files?.[0] ?? null)} />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={() => input.current?.click()} disabled={envoi}
                    className="flex items-center gap-2 rounded-lg bg-primaire px-3 py-2 text-sm font-semibold text-white hover:bg-primaire-appui disabled:opacity-50">
              {envoi ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              Prendre une photo
            </button>
            <button onClick={() => void enregistrer(null)} disabled={envoi || !f.texte.trim()}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              Enregistrer sans photo
            </button>
            <span className={`ml-auto inline-flex items-center gap-1 text-xs ${position ? 'text-green-600' : 'text-gray-400'}`}>
              <MapPin size={12} /> {position ? 'position acquise' : 'position indisponible'}
            </span>
          </div>
          {erreur && <p className="mt-2 text-xs text-red-600">{erreur}</p>}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200">
        {([['fil', 'Fil chronologique'], ['emplacement', 'Par emplacement']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setVue(k)}
                  className={`border-b-2 px-3 py-2 text-sm font-medium ${
                    vue === k ? 'border-primaire text-primaire' : 'border-transparent text-gray-500'
                  }`}>
            {l}
          </button>
        ))}
      </div>

      {chargement ? (
        <p className="py-8 text-center text-sm text-gray-500">Chargement…</p>
      ) : vue === 'fil' ? (
        entrees.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
            Journal vide. La première photo peut être prise depuis le chantier, même sans réseau.
          </p>
        ) : (
          <ul className="space-y-2">
            {entrees.map((e) => (
              <li key={e.id} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3">
                {e.url && e.mime?.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.url} alt={e.texte ?? 'Photo de chantier'}
                       className="h-20 w-20 shrink-0 rounded-lg object-cover" loading="lazy" />
                ) : e.document ? (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <FileText size={20} className="text-gray-400" />
                  </div>
                ) : null}

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {e.type === 'signalement' && e.gravite && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${couleursGravite[e.gravite]}`}>
                        {e.gravite === 'bloquant' ? 'Bloquant' : e.gravite === 'attention' ? 'À surveiller' : 'Information'}
                      </span>
                    )}
                    {e.statut === 'resolu' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-green-700">
                        <CircleCheck size={11} /> résolu
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(e.cree_le).toLocaleString('fr-FR')}
                    </span>
                    {e.point_geom && <MapPin size={11} className="text-gray-300" />}
                  </div>
                  {e.texte && <p className="whitespace-pre-wrap text-sm text-gray-800">{e.texte}</p>}
                </div>

                {!lectureSeule && (
                  <div className="flex shrink-0 flex-col gap-1">
                    {e.type === 'signalement' && (
                      <button onClick={async () => {
                                await resoudreSignalement(supabase, e.id, e.statut === 'ouvert')
                                await charger()
                              }}
                              className="rounded p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600"
                              aria-label={e.statut === 'ouvert' ? 'Marquer résolu' : 'Rouvrir'}>
                        <CircleCheck size={14} />
                      </button>
                    )}
                    <button onClick={async () => { await supprimerEntree(supabase, e); await charger() }}
                            className="rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600"
                            aria-label="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      ) : groupes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
          Aucune entrée géolocalisée. Les prises faites avec la position active se regroupent ici
          par emplacement.
        </p>
      ) : (
        <div className="space-y-4">
          {[...new Set(groupes.map((g) => g.groupe))].map((num) => {
            const suite = groupes.filter((g) => g.groupe === num)
            return (
              <div key={num} className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Images size={13} /> Emplacement {num + 1} · {suite.length} prise(s)
                </p>
                <ol className="flex gap-3 overflow-x-auto pb-1">
                  {suite.map((g) => {
                    const e = entrees.find((x) => x.id === g.id)
                    return (
                      <li key={g.id} className="w-40 shrink-0">
                        {e?.url && e.mime?.startsWith('image/') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.url} alt={g.texte ?? ''} className="h-28 w-40 rounded-lg object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-28 w-40 items-center justify-center rounded-lg bg-gray-100">
                            <MessageSquare size={18} className="text-gray-400" />
                          </div>
                        )}
                        <p className="mt-1 text-[11px] text-gray-400">
                          {new Date(g.cree_le).toLocaleDateString('fr-FR')}
                        </p>
                        {g.texte && <p className="line-clamp-2 text-xs text-gray-700">{g.texte}</p>}
                      </li>
                    )
                  })}
                </ol>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
