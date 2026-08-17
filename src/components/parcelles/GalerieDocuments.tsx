'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, ImagePlus, Loader2, MapPin, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  listerDocuments,
  supprimerDocument,
  televerserDocument,
  type DocumentAvecUrl,
} from '@/lib/documents-parcelles'

/**
 * Photos et documents d'une parcelle.
 *
 * `capture="environment"` sur l'input ouvre directement l'appareil photo
 * arrière sur mobile : sur le terrain, la photo se prend depuis la fiche de
 * la parcelle, pas depuis la galerie du téléphone.
 */

interface Props {
  parcelleId: string
  organisationId: string
  enLigne: boolean
  /** Position courante, utilisée pour géotaguer les photos prises sur place. */
  position: { lat: number; lon: number } | null
}

export default function GalerieDocuments({
  parcelleId,
  organisationId,
  enLigne,
  position,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [docs, setDocs] = useState<DocumentAvecUrl[]>([])
  const [chargement, setChargement] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      setDocs(await listerDocuments(supabase, parcelleId))
    } catch {
      /* hors-ligne ou droits insuffisants : la galerie reste vide */
    } finally {
      setChargement(false)
    }
  }, [supabase, parcelleId])

  useEffect(() => {
    if (enLigne) void charger()
    else setDocs([])
  }, [enLigne, charger])

  const envoyer = async (fichiers: FileList | null) => {
    if (!fichiers?.length) return
    setEnvoi(true)
    setErreur(null)
    for (const fichier of Array.from(fichiers)) {
      try {
        await televerserDocument(supabase, {
          parcelleId,
          organisationId,
          fichier,
          position,
        })
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Envoi impossible')
      }
    }
    setEnvoi(false)
    if (input.current) input.current.value = ''
    await charger()
  }

  const retirer = async (doc: DocumentAvecUrl) => {
    const avant = docs
    setDocs((d) => d.filter((x) => x.id !== doc.id))
    try {
      await supprimerDocument(supabase, doc)
    } catch (e) {
      setDocs(avant)
      setErreur(e instanceof Error ? e.message : 'Suppression impossible')
    }
  }

  if (!enLigne) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500">
        Les photos et documents ne sont pas disponibles hors connexion.
      </p>
    )
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void envoyer(e.target.files)}
      />

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        onClick={() => input.current?.click()}
        disabled={envoi}
      >
        {envoi ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
        {envoi ? 'Envoi…' : 'Ajouter une photo ou un document'}
      </button>

      {erreur && <p className="mt-2 text-xs text-red-600">{erreur}</p>}
      {chargement && <p className="mt-3 text-xs text-gray-500">Chargement…</p>}

      {docs.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="group relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
            >
              <a
                href={d.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="block"
                title={d.nom}
              >
                {d.mime?.startsWith('image/') && d.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.url}
                    alt={d.nom}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center">
                    <FileText size={20} className="text-gray-400" />
                    <span className="line-clamp-2 text-[10px] text-gray-500">{d.nom}</span>
                  </div>
                )}
              </a>

              {d.lat != null && d.lon != null && (
                <span
                  className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5 text-white"
                  title={`Prise à ${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}`}
                >
                  <MapPin size={11} />
                </span>
              )}

              <button
                type="button"
                onClick={() => void retirer(d)}
                className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-gray-600 opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"
                aria-label={`Supprimer ${d.nom}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
