#!/usr/bin/env node
/**
 * Lot 6 · Import du portefeuille foncier dans CASA CHAMS
 *
 * Lit le fichier produit par exporter-carto.sql et rejoue son contenu dans
 * Supabase via la RPC `enregistrer_parcelle`.
 *
 *   node --env-file=.env.local scripts/importer-carto.mjs [options]
 *
 * Options :
 *   --bundle <chemin>       fichier d'export (défaut : ./carto-export.json)
 *   --documents <dossier>   racine des fichiers (l'UPLOAD_DIR de la source)
 *   --executer              écrit réellement ; sans ce drapeau, simulation
 *   --org <uuid>            force l'organisation cible pour tout le lot
 *
 * Deux propriétés rendent l'opération sûre :
 *
 *  - Elle est rejouable. Les identifiants d'origine sont conservés et la RPC
 *    fait un upsert : relancer l'import ne crée pas de doublon, il met à jour.
 *  - Elle se vérifie. La superficie recalculée par PostGIS après import est
 *    comparée à celle de la base source ; tout écart au-delà du bruit de
 *    conversion est signalé parcelle par parcelle.
 */

import { readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

/* ----------------------------------- arguments --------------------------- */

const args = process.argv.slice(2)
const opt = (nom, defaut = null) => {
  const i = args.indexOf(nom)
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut
}
const CHEMIN_BUNDLE = opt('--bundle', './carto-export.json')
const RACINE_DOCS = opt('--documents')
const ORG_FORCEE = opt('--org')
const EXECUTER = args.includes('--executer')

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_SUPABASE || !CLE_SERVICE) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.\n' +
      'Lancez avec : node --env-file=.env.local scripts/importer-carto.mjs'
  )
  process.exit(1)
}

// Clé de service : la RLS est contournée, l'organisation cible doit donc être
// transmise explicitement à chaque écriture — organisation_courante() renverrait
// null, faute d'utilisateur authentifié.
const sb = createClient(URL_SUPABASE, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/* ------------------------------- correspondances ------------------------- */

/** Associe chaque organisation source à une organisation CASA CHAMS. */
async function construireCorrespondance(bundle) {
  const table = new Map()

  if (ORG_FORCEE) {
    for (const o of bundle.organisations) {
      table.set(o.id, { organisationId: ORG_FORCEE, via: 'option --org' })
    }
    return table
  }

  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`)
  const parEmail = new Map(data.users.map((u) => [(u.email ?? '').toLowerCase(), u.id]))

  for (const org of bundle.organisations) {
    // On cherche le propriétaire de l'organisation source, puis n'importe quel
    // membre : c'est son adresse qui sert de pont entre les deux applications.
    const candidats = bundle.utilisateurs
      .filter((u) => u.organisation_id === org.id)
      .sort((a, b) => (a.role === 'proprietaire' ? -1 : b.role === 'proprietaire' ? 1 : 0))

    let resolu = null
    for (const u of candidats) {
      const userId = parEmail.get(u.email)
      if (!userId) continue
      const { data: membre } = await sb
        .from('membres')
        .select('organisation_id')
        .eq('user_id', userId)
        .order('cree_le', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (membre) {
        resolu = { organisationId: membre.organisation_id, via: u.email }
        break
      }
    }

    table.set(org.id, resolu)
  }

  return table
}

/* ---------------------------------- import ------------------------------- */

function chargeUtile(p, organisationId) {
  return {
    id: p.id,
    organisation_id: organisationId,
    nom: p.nom,
    reference: p.reference,
    type: p.type,
    statut: p.statut,
    statut_juridique: p.statut_juridique,
    description: p.description,
    pays: p.pays,
    region: p.region,
    prefecture: p.prefecture,
    commune: p.commune,
    quartier: p.quartier,
    adresse: p.adresse,
    geom: p.geom,
    point_geom: p.geom ? null : p.point_geom,
    superficie_declaree_m2: p.superficie_declaree_m2,
    prix_achat: p.prix_achat,
    valeur_estimee: p.valeur_estimee,
    devise: p.devise,
    date_acquisition: p.date_acquisition,
    proprietaire: p.proprietaire,
    occupant: p.occupant,
    contact_telephone: p.contact_telephone,
    couleur: p.couleur,
    tags: p.tags ?? [],
    source_trace: p.source_trace,
    precision_m: p.precision_m,
  }
}

async function transfererDocument(doc, organisationId) {
  if (!RACINE_DOCS) return { etat: 'ignore', motif: '--documents non fourni' }

  const source = path.resolve(RACINE_DOCS, doc.chemin)
  try {
    await stat(source)
  } catch {
    return { etat: 'absent', motif: doc.chemin }
  }

  const ext = path.extname(doc.chemin) || ''
  const cible = `${organisationId}/${doc.parcelle_id}/${doc.id}${ext}`

  const { error: erreurUpload } = await sb.storage
    .from('parcelles')
    .upload(cible, createReadStream(source), {
      contentType: doc.mime ?? 'application/octet-stream',
      duplex: 'half',
      upsert: true,
    })
  if (erreurUpload) return { etat: 'erreur', motif: erreurUpload.message }

  const { error } = await sb.from('parcelle_documents').upsert({
    id: doc.id,
    parcelle_id: doc.parcelle_id,
    organisation_id: organisationId,
    nom: doc.nom,
    categorie: doc.categorie,
    chemin: cible,
    mime: doc.mime,
    taille_octets: doc.taille_octets,
    lat: doc.lat,
    lon: doc.lon,
  })
  if (error) return { etat: 'erreur', motif: error.message }
  return { etat: 'transfere' }
}

/* ----------------------------------- main -------------------------------- */

const bundle = JSON.parse(await readFile(CHEMIN_BUNDLE, 'utf8'))

console.log(`\nExport du ${bundle.exporte_le}`)
console.log(
  `${bundle.organisations.length} organisation(s), ${bundle.parcelles.length} parcelle(s), ` +
    `${bundle.documents.length} document(s)\n`
)

const correspondance = await construireCorrespondance(bundle)

console.log('Correspondance des organisations')
for (const org of bundle.organisations) {
  const cible = correspondance.get(org.id)
  console.log(
    `  ${org.nom.padEnd(34)} → ${cible ? `${cible.organisationId}  (via ${cible.via})` : 'AUCUNE CORRESPONDANCE'}`
  )
}

const orphelines = bundle.parcelles.filter((p) => !correspondance.get(p.organisation_id))
if (orphelines.length) {
  console.log(
    `\n⚠️  ${orphelines.length} parcelle(s) sans organisation cible. Créez le compte ` +
      `correspondant dans CASA CHAMS, ou forcez la cible avec --org <uuid>.`
  )
}

if (!EXECUTER) {
  console.log('\n── SIMULATION ── aucune écriture. Ajoutez --executer pour appliquer.\n')
  for (const p of bundle.parcelles) {
    const cible = correspondance.get(p.organisation_id)
    const surface = p.superficie_m2_source ? Math.round(p.superficie_m2_source) : 0
    console.log(
      `  ${cible ? '·' : '✗'} ${p.nom.slice(0, 38).padEnd(40)} ` +
        `${(p.geom ? 'polygone' : 'repère').padEnd(9)} ${surface.toLocaleString('fr-FR').padStart(13)} m²`
    )
  }
  console.log()
  process.exit(0)
}

let importees = 0
const echecs = []
const ecarts = []

for (const p of bundle.parcelles) {
  const cible = correspondance.get(p.organisation_id)
  if (!cible) {
    echecs.push({ nom: p.nom, motif: 'aucune organisation cible' })
    continue
  }

  const { data, error } = await sb.rpc('enregistrer_parcelle', {
    p: chargeUtile(p, cible.organisationId),
  })

  if (error) {
    echecs.push({ nom: p.nom, motif: error.message })
    continue
  }

  importees++

  // Contrôle : PostGIS doit retrouver la superficie de la base source.
  const apres = data?.superficie_m2
  const avant = p.superficie_m2_source
  if (avant && apres) {
    const ecart = Math.abs((apres - avant) / avant) * 100
    if (ecart > 0.01) ecarts.push({ nom: p.nom, avant, apres, ecart })
  }
}

let docsTransferes = 0
const docsEnEchec = []
for (const doc of bundle.documents) {
  const cible = correspondance.get(doc.organisation_id)
  if (!cible) {
    docsEnEchec.push({ nom: doc.nom, motif: 'aucune organisation cible' })
    continue
  }
  const r = await transfererDocument(doc, cible.organisationId)
  if (r.etat === 'transfere') docsTransferes++
  else docsEnEchec.push({ nom: doc.nom, motif: `${r.etat} — ${r.motif}` })
}

console.log(`\n── RÉSULTAT ──`)
console.log(`  parcelles importées : ${importees} / ${bundle.parcelles.length}`)
console.log(`  documents transférés : ${docsTransferes} / ${bundle.documents.length}`)

if (ecarts.length) {
  console.log(`\n⚠️  ${ecarts.length} écart(s) de superficie après recalcul :`)
  for (const e of ecarts) {
    console.log(`   ${e.nom} : ${Math.round(e.avant)} → ${Math.round(e.apres)} m² (${e.ecart.toFixed(3)} %)`)
  }
} else {
  console.log('  superficies : toutes identiques à la source après recalcul PostGIS ✓')
}

for (const e of echecs) console.log(`  ✗ ${e.nom} : ${e.motif}`)
for (const e of docsEnEchec) console.log(`  ✗ document ${e.nom} : ${e.motif}`)

console.log()
process.exit(echecs.length || docsEnEchec.length ? 1 : 0)
