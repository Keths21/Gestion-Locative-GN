import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParcelleDocument } from '@/types'

/**
 * Documents et photos rattachés aux parcelles.
 *
 * Contrairement à l'application carto, qui écrivait sur le disque du serveur
 * via une route, l'envoi se fait ici directement du navigateur vers Supabase
 * Storage. Ce n'est pas moins sûr : les policies du bucket appliquent la même
 * règle d'appartenance que les tables, et la taille comme les formats acceptés
 * sont contraints par le bucket lui-même. C'est en revanche nettement plus
 * simple — aucun binaire ne transite par Next — et cohérent avec le reste de
 * l'application, qui interroge Supabase directement.
 */

const BUCKET = 'parcelles'
const DUREE_URL_SIGNEE = 3600 // 1 h : le temps d'une consultation, pas davantage

export type DocumentAvecUrl = ParcelleDocument & { url: string | null }

/** Extension conservée pour que le navigateur devine le type à l'ouverture. */
function extension(nom: string): string {
  const point = nom.lastIndexOf('.')
  if (point < 0 || point === nom.length - 1) return ''
  return nom.slice(point).toLowerCase().slice(0, 10)
}

function categoriePour(fichier: File): ParcelleDocument['categorie'] {
  if (fichier.type === 'application/pdf') return 'titre'
  if (fichier.type.startsWith('image/')) return 'photo'
  return 'autre'
}

export async function listerDocuments(
  sb: SupabaseClient,
  parcelleId: string
): Promise<DocumentAvecUrl[]> {
  const { data, error } = await sb
    .from('parcelle_documents')
    .select('*')
    .eq('parcelle_id', parcelleId)
    .order('cree_le', { ascending: false })

  if (error) throw new Error(error.message)
  const docs = (data ?? []) as ParcelleDocument[]
  if (!docs.length) return []

  const { data: urls } = await sb.storage
    .from(BUCKET)
    .createSignedUrls(docs.map((d) => d.chemin), DUREE_URL_SIGNEE)

  const parChemin = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]))
  return docs.map((d) => ({ ...d, url: parChemin.get(d.chemin) ?? null }))
}

export async function televerserDocument(
  sb: SupabaseClient,
  params: {
    parcelleId: string
    organisationId: string
    fichier: File
    /** Géotag : la position où la photo a été prise, si elle est connue. */
    position?: { lat: number; lon: number } | null
  }
): Promise<ParcelleDocument> {
  const { parcelleId, organisationId, fichier, position } = params

  const chemin = `${organisationId}/${parcelleId}/${crypto.randomUUID()}${extension(fichier.name)}`

  const { error: erreurUpload } = await sb.storage.from(BUCKET).upload(chemin, fichier, {
    contentType: fichier.type || 'application/octet-stream',
    upsert: false,
  })

  if (erreurUpload) {
    // Le bucket refuse lui-même les formats et les tailles hors limites ;
    // on traduit son message plutôt que de le laisser tel quel.
    if (/mime|content type/i.test(erreurUpload.message)) {
      throw new Error('Format non accepté (JPEG, PNG, WebP, HEIC ou PDF).')
    }
    if (/size|large/i.test(erreurUpload.message)) {
      throw new Error('Fichier trop volumineux (15 Mo maximum).')
    }
    throw new Error(erreurUpload.message)
  }

  const { data, error } = await sb
    .from('parcelle_documents')
    .insert({
      parcelle_id: parcelleId,
      organisation_id: organisationId,
      nom: fichier.name.slice(0, 200),
      categorie: categoriePour(fichier),
      chemin,
      mime: fichier.type || null,
      taille_octets: fichier.size,
      lat: position?.lat ?? null,
      lon: position?.lon ?? null,
    })
    .select('*')
    .single()

  if (error) {
    // La ligne n'a pas pu être écrite : on retire l'objet pour ne pas laisser
    // de fichier orphelin dans le bucket.
    await sb.storage.from(BUCKET).remove([chemin])
    throw new Error(error.message)
  }

  return data as ParcelleDocument
}

export async function supprimerDocument(
  sb: SupabaseClient,
  doc: Pick<ParcelleDocument, 'id' | 'chemin'>
): Promise<void> {
  const { error } = await sb.from('parcelle_documents').delete().eq('id', doc.id)
  if (error) throw new Error(error.message)

  // L'ordre compte : si la ligne n'a pas pu être supprimée (droits), le fichier
  // reste en place et reste donc consultable.
  await sb.storage.from(BUCKET).remove([doc.chemin])
}
