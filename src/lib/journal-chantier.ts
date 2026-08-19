import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Journal de chantier : photos, notes et signalements géolocalisés.
 *
 * Les fichiers vivent dans un bucket distinct de celui des parcelles, dont
 * les policies connaissent la seconde voie d'accès : un architecte invité
 * n'est pas membre de l'organisation et resterait sinon incapable de voir
 * les photos du chantier auquel on l'a convié.
 */

type Client = SupabaseClient

const BUCKET = 'chantiers'
const DUREE_URL_SIGNEE = 3600

export type TypeEntree = 'photo' | 'note' | 'signalement'
export type GraviteSignalement = 'info' | 'attention' | 'bloquant'

export interface EntreeJournal {
  id: string
  chantier_id: string
  phase_id: string | null
  type: TypeEntree
  texte: string | null
  gravite: GraviteSignalement | null
  statut: 'ouvert' | 'resolu'
  resolu_le: string | null
  point_geom: { type: 'Point'; coordinates: [number, number] } | null
  document: string | null
  mime: string | null
  taille_octets: number | null
  cree_par: string | null
  cree_le: string
}

export type EntreeAvecUrl = EntreeJournal & { url: string | null }

export async function listerJournal(sb: Client, chantierId: string): Promise<EntreeAvecUrl[]> {
  const { data, error } = await sb
    .from('journal_chantier')
    .select('*')
    .eq('chantier_id', chantierId)
    .order('cree_le', { ascending: false })
  if (error) throw new Error(error.message)

  const entrees = (data ?? []) as EntreeJournal[]
  const chemins = entrees.map((e) => e.document).filter((c): c is string => !!c)
  if (!chemins.length) return entrees.map((e) => ({ ...e, url: null }))

  const { data: urls } = await sb.storage.from(BUCKET).createSignedUrls(chemins, DUREE_URL_SIGNEE)
  const parChemin = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]))
  return entrees.map((e) => ({ ...e, url: e.document ? (parChemin.get(e.document) ?? null) : null }))
}

function extension(nom: string): string {
  const p = nom.lastIndexOf('.')
  return p < 0 ? '' : nom.slice(p).toLowerCase().slice(0, 10)
}

export async function ajouterEntree(
  sb: Client,
  params: {
    chantierId: string
    organisationId: string
    type: TypeEntree
    texte?: string | null
    gravite?: GraviteSignalement | null
    phaseId?: string | null
    position?: { lat: number; lon: number } | null
    fichier?: File | null
  }
): Promise<EntreeJournal> {
  let chemin: string | null = null

  if (params.fichier) {
    chemin = `${params.organisationId}/${params.chantierId}/${crypto.randomUUID()}${extension(params.fichier.name)}`
    const { error } = await sb.storage.from(BUCKET).upload(chemin, params.fichier, {
      contentType: params.fichier.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) {
      if (/mime|content type/i.test(error.message)) {
        throw new Error('Format non accepté (JPEG, PNG, WebP, HEIC ou PDF).')
      }
      if (/size|large/i.test(error.message)) {
        throw new Error('Fichier trop volumineux (15 Mo maximum).')
      }
      throw new Error(error.message)
    }
  }

  const { data, error } = await sb.rpc('ajouter_entree_journal', {
    p: {
      chantier_id: params.chantierId,
      phase_id: params.phaseId ?? null,
      type: params.type,
      texte: params.texte ?? null,
      gravite: params.gravite ?? null,
      lon: params.position?.lon ?? null,
      lat: params.position?.lat ?? null,
      document: chemin,
      mime: params.fichier?.type ?? null,
      taille_octets: params.fichier?.size ?? null,
    },
  })

  if (error) {
    // La ligne n'a pas pu être écrite : on retire le fichier pour ne pas
    // laisser d'orphelin dans le bucket.
    if (chemin) await sb.storage.from(BUCKET).remove([chemin])
    throw new Error(error.message)
  }
  return data as EntreeJournal
}

export async function resoudreSignalement(sb: Client, id: string, resolu: boolean): Promise<void> {
  const { error } = await sb
    .from('journal_chantier')
    .update({ statut: resolu ? 'resolu' : 'ouvert', resolu_le: resolu ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function supprimerEntree(sb: Client, entree: Pick<EntreeJournal, 'id' | 'document'>): Promise<void> {
  const { error } = await sb.from('journal_chantier').delete().eq('id', entree.id)
  if (error) throw new Error(error.message)
  if (entree.document) await sb.storage.from(BUCKET).remove([entree.document])
}

export interface EntreeGroupee {
  groupe: number
  id: string
  type: TypeEntree
  texte: string | null
  document: string | null
  mime: string | null
  cree_le: string
  lat: number
  lon: number
}

/**
 * Regroupe les entrées par emplacement : les prises faites au même point,
 * quelle que soit leur date, forment la séquence avant / pendant / après.
 */
export async function journalParEmplacement(
  sb: Client,
  chantierId: string,
  rayonM = 12
): Promise<EntreeGroupee[]> {
  const { data, error } = await sb.rpc('journal_par_emplacement', { c: chantierId, rayon_m: rayonM })
  if (error) throw new Error(error.message)
  return (data ?? []) as EntreeGroupee[]
}
