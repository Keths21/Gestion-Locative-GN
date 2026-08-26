import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { montantEnLettres } from '@/lib/montant-en-lettres'

async function loadImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/* -------------------------------------------------------------------------- */
/*  Reçu de paiement                                                           */
/* -------------------------------------------------------------------------- */

// Charte du document : bleu marine dominant, rouge sombre pour le sous-titre,
// vert pour la mention d'acquittement.
const MARINE: [number, number, number] = [31, 56, 100]
const ROUGE: [number, number, number] = [155, 35, 53]
const VERT: [number, number, number] = [46, 125, 77]
const BLEU_PALE: [number, number, number] = [234, 240, 248]
const GRIS: [number, number, number] = [110, 118, 130]

const MARGE = 18
const LARGEUR = 210

/**
 * Données nécessaires au reçu. Volontairement souple sur les relations :
 * l'appelant transmet le paiement tel que Supabase le renvoie, avec ses
 * jointures locataire et bien.
 */
export type PaiementQuittance = {
  id?: string
  montant: number
  mois_concerne: string
  date_paiement?: string | null
  statut?: string
  numero_recu?: string | null
  mode_paiement?: string | null
  locataire?: { nom?: string; prenom?: string; telephone?: string | null; email?: string | null } | null
  bien?: { nom?: string; adresse?: string; ville?: string; loyer_base?: number | null; charges?: number | null } | null
}

export type AgenceQuittance = {
  nom_agence?: string | null
  adresse?: string | null
  ville?: string | null
  telephone?: string | null
  email?: string | null
}

/** Numéro de reçu lisible et ordonné : RECU-2026-0042. */
function numeroRecu(paiement: PaiementQuittance): string {
  if (paiement.numero_recu) return paiement.numero_recu
  const annee = (paiement.date_paiement ?? paiement.mois_concerne ?? '').slice(0, 4)
                || new Date().getFullYear().toString()
  // À défaut de compteur, les 4 derniers caractères de l'identifiant donnent
  // une référence stable et non ambiguë pour un même paiement.
  const suffixe = String(paiement.id ?? '').replace(/-/g, '').slice(-4).toUpperCase()
  return `RECU-${annee}-${suffixe || '0001'}`
}

function moisEnClair(mois: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mois ?? '')
  if (!m) return mois ?? ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  const libelle = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return libelle.charAt(0).toUpperCase() + libelle.slice(1)
}

/** Premier et dernier jour du mois concerné, pour la colonne « Période ». */
function bornesDuMois(mois: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mois ?? '')
  if (!m) return ''
  const annee = Number(m[1])
  const index = Number(m[2]) - 1
  const debut = new Date(annee, index, 1)
  const fin = new Date(annee, index + 1, 0)
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR')
  return `du ${fmt(debut)} au ${fmt(fin)}`
}

/**
 * Deux tableaux d'identification côte à côte, en-tête plein et lignes
 * alternées, comme sur le modèle fourni.
 */
function blocIdentite(
  doc: jsPDF,
  x: number,
  y: number,
  largeur: number,
  titre: string,
  lignes: [string, string][]
): number {
  const hEntete = 9
  const hLigne = 9
  const largeurLabel = largeur * 0.37

  doc.setFillColor(...MARINE)
  doc.rect(x, y, largeur, hEntete, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.text(titre, x + 4, y + 6.2)

  let ly = y + hEntete
  lignes.forEach(([label, valeur], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...BLEU_PALE)
      doc.rect(x, ly, largeurLabel, hLigne, 'F')
    } else {
      doc.setFillColor(...BLEU_PALE)
      doc.rect(x, ly, largeurLabel, hLigne, 'F')
    }
    doc.setDrawColor(214, 222, 234)
    doc.setLineWidth(0.2)
    doc.line(x, ly + hLigne, x + largeur, ly + hLigne)

    doc.setTextColor(...MARINE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(label, x + 4, ly + 6)

    doc.setTextColor(35, 40, 48)
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal')
    doc.text(String(valeur || '—').slice(0, 34), x + largeurLabel + 4, ly + 6)
    ly += hLigne
  })

  doc.setDrawColor(...MARINE)
  doc.setLineWidth(0.4)
  doc.rect(x, y, largeur, hEntete + lignes.length * hLigne)
  return y + hEntete + lignes.length * hLigne
}

/** Cartouche « PAYÉ », incliné comme un tampon apposé à la main. */
function tamponPaye(doc: jsPDF, x: number, y: number, date: string) {
  const w = 62
  const h = 30
  const angle = -12

  doc.saveGraphicsState()
  // jsPDF ne fait pas tourner un groupe : on incline le repère via la matrice.
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Matrix et setCurrentTransformationMatrix appartiennent au module avancé
  // de jsPDF, absent des types publiés.
  const avance = doc as unknown as {
    Matrix: new (a: number, b: number, c: number, d: number, e: number, f: number) => unknown
    setCurrentTransformationMatrix: (m: unknown) => void
  }
  avance.setCurrentTransformationMatrix(new avance.Matrix(cos, sin, -sin, cos, x, y))

  doc.setDrawColor(...VERT)
  doc.setLineWidth(1.6)
  doc.roundedRect(0, 0, w, h, 3, 3)
  doc.setLineWidth(0.5)
  doc.roundedRect(2.5, 2.5, w - 5, h - 5, 2, 2)

  doc.setTextColor(...VERT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('PAYÉ', w / 2, 15, { align: 'center' })
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'italic')
  doc.text(`LE ${date}`, w / 2, 23, { align: 'center' })

  doc.restoreGraphicsState()
}

export async function genererQuittance(
  paiement: PaiementQuittance,
  agence?: AgenceQuittance | null
) {
  const doc = new jsPDF()

  const [logo, cachet] = await Promise.all([
    loadImageAsBase64('/innoveagroup_logo.jpeg').catch(() => null),
    loadImageAsBase64('/innovea_cachet.png').catch(() => null),
  ])

  const locataire = paiement.locataire ?? {}
  const bien = paiement.bien ?? {}
  const nomAgence = agence?.nom_agence || 'CASA CHAMS'
  const montant = Number(paiement.montant) || 0
  const datePaiement = paiement.date_paiement
    ? new Date(paiement.date_paiement).toLocaleDateString('fr-FR')
    : new Date().toLocaleDateString('fr-FR')

  /* ------------------------------- En-tête -------------------------------- */

  if (logo) doc.addImage(logo, 'JPEG', MARGE, 12, 26, 22)

  doc.setTextColor(...MARINE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(nomAgence.toUpperCase(), LARGEUR - MARGE, 20, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...GRIS)
  const coordonnees = [
    agence?.adresse ? `${agence.adresse}${agence.ville ? `, ${agence.ville}` : ''}` : 'Conakry, Guinée',
    agence?.telephone,
    agence?.email,
  ].filter(Boolean) as string[]
  coordonnees.forEach((ligne, i) => {
    doc.text(ligne, LARGEUR - MARGE, 27 + i * 5.5, { align: 'right' })
  })

  doc.setDrawColor(...MARINE)
  doc.setLineWidth(0.9)
  doc.line(MARGE, 41, LARGEUR - MARGE, 41)

  /* -------------------------------- Titre --------------------------------- */

  doc.setTextColor(...MARINE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.text('REÇU DE PAIEMENT', MARGE, 57)

  doc.setTextColor(...ROUGE)
  doc.setFontSize(10)
  const sousTitre = [
    'QUITTANCE DE LOYER',
    moisEnClair(paiement.mois_concerne).toUpperCase(),
    bien?.nom ? String(bien.nom).toUpperCase() : null,
  ].filter(Boolean).join(' — ')
  doc.text(sousTitre, MARGE, 65)

  /* -------------------------- Blocs d'identité ---------------------------- */

  const largeurBloc = (LARGEUR - 2 * MARGE - 8) / 2
  const basGauche = blocIdentite(doc, MARGE, 74, largeurBloc, 'REÇU', [
    ['N° Reçu', numeroRecu(paiement)],
    ['Date', datePaiement],
    ['Période', moisEnClair(paiement.mois_concerne)],
    ['Mode', paiement.mode_paiement || 'Espèces'],
  ])
  const basDroite = blocIdentite(doc, MARGE + largeurBloc + 8, 74, largeurBloc, 'LOCATAIRE', [
    ['Nom', `${locataire.prenom ?? ''} ${locataire.nom ?? ''}`.trim()],
    ['Bien loué', bien?.nom ?? '—'],
    ['Adresse', [bien?.adresse, bien?.ville].filter(Boolean).join(', ')],
    ['Contact', locataire.telephone ?? locataire.email ?? '—'],
  ])

  /* ---------------------------- Détail chiffré ---------------------------- */

  let y = Math.max(basGauche, basDroite) + 14

  doc.setTextColor(...MARINE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('DÉTAIL DU PAIEMENT', MARGE, y)
  doc.setLineWidth(0.6)
  doc.line(MARGE, y + 2.5, LARGEUR - MARGE, y + 2.5)

  const loyer = Number(bien?.loyer_base) || montant
  const charges = Number(bien?.charges) || 0
  const lignes: string[][] = [[
    '1',
    `Loyer — ${moisEnClair(paiement.mois_concerne)}`,
    bornesDuMois(paiement.mois_concerne),
    '1',
    formatMontantSec(loyer),
    formatMontantSec(loyer),
  ]]
  // Les charges n'apparaissent que si elles existent : une ligne à zéro
  // encombre le reçu sans rien apprendre.
  if (charges > 0) {
    lignes.push(['2', 'Charges locatives', bornesDuMois(paiement.mois_concerne), '1',
                 formatMontantSec(charges), formatMontantSec(charges)])
  }

  autoTable(doc, {
    startY: y + 7,
    margin: { left: MARGE, right: MARGE },
    head: [['N°', 'DÉSIGNATION', 'PÉRIODE', 'QTÉ', 'PU (GNF)', 'TOTAL (GNF)']],
    body: lignes,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3, lineColor: [214, 222, 234], lineWidth: 0.2 },
    headStyles: { fillColor: MARINE, textColor: 255, fontStyle: 'bold', fontSize: 8.5, halign: 'left' },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      2: { halign: 'center' },
      3: { cellWidth: 14, halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12

  /* --------------------- Montant en lettres et totaux --------------------- */

  const largeurTotaux = 78
  const xTotaux = LARGEUR - MARGE - largeurTotaux

  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text('Arrêté le présent reçu à la somme de :', MARGE, y + 4)

  doc.setTextColor(35, 40, 48)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  // Le montant en lettres peut être long : on le replie sur la largeur libre.
  const enLettres = doc.splitTextToSize(montantEnLettres(montant), xTotaux - MARGE - 6)
  doc.text(enLettres, MARGE, y + 12)

  const hLigneTotal = 11
  const totaux: [string, string, boolean][] = [
    ['Sous-total', `${formatMontantSec(montant)} GNF`, false],
    ['TOTAL DÛ', `${formatMontantSec(montant)} GNF`, true],
    ['Montant payé', `${formatMontantSec(montant)} GNF`, false],
  ]
  let ty = y
  for (const [libelle, valeur, fort] of totaux) {
    if (fort) {
      doc.setFillColor(...MARINE)
      doc.rect(xTotaux, ty, largeurTotaux, hLigneTotal, 'F')
      doc.setTextColor(255, 255, 255)
    } else {
      doc.setFillColor(...BLEU_PALE)
      doc.rect(xTotaux, ty, largeurTotaux * 0.52, hLigneTotal, 'F')
      doc.setTextColor(...MARINE)
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(libelle, xTotaux + 4, ty + 7.2)
    doc.setTextColor(fort ? 255 : 35, fort ? 255 : 40, fort ? 255 : 48)
    doc.text(valeur, xTotaux + largeurTotaux - 4, ty + 7.2, { align: 'right' })

    doc.setDrawColor(...MARINE)
    doc.setLineWidth(0.3)
    doc.rect(xTotaux, ty, largeurTotaux, hLigneTotal)
    ty += hLigneTotal
  }

  /* -------------------------- Tampon et signatures ------------------------ */

  const estPaye = paiement.statut === 'payé' || paiement.statut === 'paye'
  if (estPaye) tamponPaye(doc, MARGE + 8, ty + 16, datePaiement)

  const ySignature = 258
  doc.setDrawColor(200, 208, 218)
  doc.setLineWidth(0.4)
  doc.line(MARGE, ySignature, MARGE + 62, ySignature)
  doc.line(LARGEUR - MARGE - 62, ySignature, LARGEUR - MARGE, ySignature)

  doc.setTextColor(...MARINE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.text('Le locataire', MARGE, ySignature - 44)
  doc.text(`Pour ${nomAgence.toUpperCase()}`, LARGEUR - MARGE, ySignature - 44, { align: 'right' })

  if (cachet) doc.addImage(cachet, 'PNG', LARGEUR - MARGE - 44, ySignature - 40, 40, 37)

  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Signature et cachet', LARGEUR - MARGE, ySignature + 5, { align: 'right' })

  /* ------------------------------ Pied de page ---------------------------- */

  doc.setFontSize(7.5)
  doc.setTextColor(165, 172, 182)
  doc.text(
    `${numeroRecu(paiement)} · Document généré par CASA CHAMS — casachams.com`,
    LARGEUR / 2, 288, { align: 'center' }
  )

  const nom = `${locataire.nom ?? 'locataire'}`.replace(/\s+/g, '-')
  doc.save(`recu_${nom}_${paiement.mois_concerne}.pdf`)
}

export function genererBail(locataire: any, bien: any, logo?: string, agence?: any) {
  if (bien?.mode_location === 'airbnb') {
    genererContratAirbnb(locataire, bien, logo, agence)
  } else {
    genererBailAppartement(locataire, bien, logo, agence)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function header(doc: jsPDF, titre: string, sousTitre: string, r: number, g: number, b: number, logo?: string) {
  doc.setFillColor(r, g, b)
  doc.rect(0, 0, 210, 38, 'F')

  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 8, 6, 26, 26)
    } catch {
      // logo non chargé, on ignore
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(titre, 105, 17, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(sousTitre, 105, 26, { align: 'center' })
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(`Document établi le ${today}`, 105, 34, { align: 'center' })
  doc.setTextColor(0, 0, 0)
}

function article(doc: jsPDF, num: string, titre: string, y: number): number {
  doc.setFillColor(245, 247, 250)
  doc.rect(18, y - 5, 174, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(37, 99, 235)
  doc.text(`${num} — ${titre}`, 20, y + 1)
  doc.setTextColor(0, 0, 0)
  return y + 10
}

function ligne(doc: jsPDF, label: string, valeur: string, y: number, gris = false): number {
  if (!valeur || valeur === 'undefined' || valeur === 'null') return y
  if (gris) doc.setTextColor(80, 80, 80)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(`${label} :`, 22, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0)
  doc.text(valeur, 75, y)
  return y + 7
}

function equipements(bien: any): string {
  const items = []
  if (bien?.meuble) items.push('Meublé')
  if (bien?.parking) items.push('Parking')
  if (bien?.ascenseur) items.push('Ascenseur')
  if (bien?.gardien) items.push('Gardien/Vigile')
  if (bien?.eau_incluse) items.push('Eau incluse')
  if (bien?.electricite_incluse) items.push('Électricité incluse')
  if (bien?.internet_inclus) items.push('Internet inclus')
  if (bien?.climatisation) items.push('Climatisation')
  return items.length > 0 ? items.join(' · ') : 'Non spécifiés'
}

function pied(doc: jsPDF) {
  doc.setFontSize(7.5)
  doc.setTextColor(160, 160, 160)
  doc.setFont('helvetica', 'normal')
  doc.text('Document généré par CASA CHAMS — casachams.com', 105, 291, { align: 'center' })
}

function signatures(doc: jsPDF, gauche: string, droite: string, y: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text(gauche, 40, y, { align: 'center' })
  doc.text(droite, 168, y, { align: 'center' })
  doc.setLineWidth(0.4)
  doc.line(20, y + 18, 78, y + 18)
  doc.line(130, y + 18, 188, y + 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text('Signature + cachet', 40, y + 23, { align: 'center' })
  doc.text('Signature', 159, y + 23, { align: 'center' })
}

function formatDate(d?: string) {
  if (!d) return 'Non précisée'
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return d }
}

function nbNuits(d1?: string, d2?: string): number {
  if (!d1 || !d2) return 0
  const diff = new Date(d2).getTime() - new Date(d1).getTime()
  return Math.max(1, Math.round(diff / 86400000))
}

// ─── Bail Appartement (location mensuelle) ──────────────────────────────────

function genererBailAppartement(locataire: any, bien: any, logo?: string, agence?: any) {
  const doc = new jsPDF()
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  header(doc, 'CONTRAT DE BAIL D\'HABITATION', 'Location à usage d\'habitation — Paiement mensuel', 37, 99, 235, logo)

  let y = 48

  // ── Parties
  y = article(doc, 'ARTICLE 1', 'PARTIES AU CONTRAT', y)
  y = ligne(doc, 'Bailleur', agence?.nom_agence || 'Votre Agence Immobilière', y)
  if (agence?.telephone) y = ligne(doc, 'Tél. Bailleur', agence.telephone, y)
  if (agence?.email) y = ligne(doc, 'Email Bailleur', agence.email, y)
  y = ligne(doc, 'Locataire', `${locataire?.prenom || ''} ${locataire?.nom || ''}`, y)
  if (locataire?.email) y = ligne(doc, 'Email', locataire.email, y)
  if (locataire?.telephone) y = ligne(doc, 'Téléphone', locataire.telephone, y)
  y += 4

  // ── Bien
  y = article(doc, 'ARTICLE 2', 'DÉSIGNATION DU BIEN', y)
  y = ligne(doc, 'Nom du bien', bien?.nom, y)
  y = ligne(doc, 'Type', bien?.type ? bien.type.charAt(0).toUpperCase() + bien.type.slice(1) : '', y)
  y = ligne(doc, 'Adresse', `${bien?.adresse || ''}, ${bien?.ville || ''}`, y)
  if (bien?.surface) y = ligne(doc, 'Surface', `${bien.surface} m²`, y)
  if (bien?.nombre_pieces) y = ligne(doc, 'Nombre de pièces', `${bien.nombre_pieces} pièce(s)`, y)
  if (bien?.etage !== null && bien?.etage !== undefined) y = ligne(doc, 'Étage', `${bien.etage}`, y)
  y = ligne(doc, 'Équipements', equipements(bien), y)
  if (bien?.description) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    const desc = doc.splitTextToSize(bien.description, 160)
    doc.text(desc, 22, y)
    y += desc.length * 5 + 2
    doc.setTextColor(0, 0, 0)
  }
  y += 4

  // ── Durée
  y = article(doc, 'ARTICLE 3', 'DURÉE DU BAIL', y)
  y = ligne(doc, 'Date d\'entrée', formatDate(locataire?.date_entree), y)
  if (locataire?.date_sortie) y = ligne(doc, 'Date de sortie', formatDate(locataire.date_sortie), y)
  const dureeMin = bien?.duree_min_mois ? `${bien.duree_min_mois} mois` : '12 mois'
  y = ligne(doc, 'Durée minimale', `${dureeMin}, renouvelable par tacite reconduction`, y)
  y += 4

  // ── Loyer
  y = article(doc, 'ARTICLE 4', 'LOYER ET CHARGES', y)

  const loyer = bien?.loyer_base || 0
  const charges = bien?.charges || 0
  const garantie = locataire?.depot_garantie || 0
  const garantieMois = bien?.depot_garantie_mois

  autoTable(doc, {
    startY: y,
    body: [
      ...(loyer ? [['Loyer mensuel de base', formatMontantPDF(loyer)]] : []),
      ...(charges ? [['Charges mensuelles', formatMontantPDF(charges)]] : []),
      ...(loyer || charges ? [['TOTAL MENSUEL', formatMontantPDF(loyer + charges)]] : []),
      ...(garantie ? [['Dépôt de garantie versé', formatMontantPDF(garantie)]] : []),
      ...(garantieMois ? [['Dépôt de garantie (référence)', `${garantieMois} mois de loyer`]] : []),
    ],
    theme: 'striped',
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // ── Obligations
  y = article(doc, 'ARTICLE 5', 'OBLIGATIONS DU LOCATAIRE', y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const obligations = [
    '• Payer le loyer et les charges aux échéances convenues.',
    '• Entretenir le logement en bon père de famille.',
    '• Souscrire une assurance habitation et en justifier.',
    '• Ne pas sous-louer le logement sans accord écrit du bailleur.',
    '• Respecter les règles de bon voisinage et le règlement de copropriété.',
    '• Restituer le logement en bon état à la fin du bail.',
  ]
  obligations.forEach(o => { doc.text(o, 22, y); y += 6 })
  y += 2

  // ── Résiliation
  if (y < 245) {
    y = article(doc, 'ARTICLE 6', 'RÉSILIATION', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Le locataire peut résilier le bail à tout moment avec un préavis d\'un (1) mois notifié par écrit.', 22, y); y += 6
    doc.text('Le bailleur peut résilier le bail pour non-paiement du loyer après mise en demeure restée sans effet.', 22, y); y += 8
  }

  // Signatures
  if (y > 250) { doc.addPage(); y = 20 }
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  doc.setTextColor(80, 80, 80)
  doc.text(`Fait à ${bien?.ville || 'Conakry'}, le ${today}, en deux exemplaires originaux.`, 105, y, { align: 'center' })
  y += 10
  signatures(doc, 'LE BAILLEUR', 'LE LOCATAIRE', y)

  pied(doc)
  doc.save(`bail_${locataire?.nom || 'locataire'}_${bien?.nom || 'bien'}.pdf`)
}

// ─── Contrat Airbnb (location courte durée) ──────────────────────────────────

function genererContratAirbnb(locataire: any, bien: any, logo?: string, agence?: any) {
  const doc = new jsPDF()
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  header(doc, 'CONTRAT DE LOCATION COURTE DURÉE', 'Location meublée touristique — Paiement à la nuit', 126, 34, 206, logo)

  let y = 48

  // ── Parties
  y = article(doc, 'ARTICLE 1', 'PARTIES AU CONTRAT', y)
  y = ligne(doc, 'Hôte / Bailleur', agence?.nom_agence || 'Votre Agence Immobilière', y)
  if (agence?.telephone) y = ligne(doc, 'Tél. Bailleur', agence.telephone, y)
  if (agence?.email) y = ligne(doc, 'Email Bailleur', agence.email, y)
  y = ligne(doc, 'Voyageur', `${locataire?.prenom || ''} ${locataire?.nom || ''}`, y)
  if (locataire?.email) y = ligne(doc, 'Email', locataire.email, y)
  if (locataire?.telephone) y = ligne(doc, 'Téléphone', locataire.telephone, y)
  y += 4

  // ── Bien
  y = article(doc, 'ARTICLE 2', 'BIEN LOUÉ', y)
  y = ligne(doc, 'Nom du logement', bien?.nom, y)
  y = ligne(doc, 'Type', bien?.type ? bien.type.charAt(0).toUpperCase() + bien.type.slice(1) : '', y)
  y = ligne(doc, 'Adresse', `${bien?.adresse || ''}, ${bien?.ville || ''}`, y)
  if (bien?.surface) y = ligne(doc, 'Surface', `${bien.surface} m²`, y)
  if (bien?.nombre_pieces) y = ligne(doc, 'Nombre de pièces', `${bien.nombre_pieces} pièce(s)`, y)
  if (bien?.max_voyageurs) y = ligne(doc, 'Capacité maximale', `${bien.max_voyageurs} voyageur(s)`, y)
  y = ligne(doc, 'Équipements', equipements(bien), y)
  if (bien?.description) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    const desc = doc.splitTextToSize(bien.description, 160)
    doc.text(desc, 22, y)
    y += desc.length * 5 + 2
    doc.setTextColor(0, 0, 0)
  }
  y += 4

  // ── Séjour
  y = article(doc, 'ARTICLE 3', 'DÉTAILS DU SÉJOUR', y)
  y = ligne(doc, 'Date d\'arrivée', formatDate(locataire?.date_entree), y)
  if (bien?.heure_checkin) y = ligne(doc, 'Heure d\'arrivée', bien.heure_checkin, y)
  y = ligne(doc, 'Date de départ', formatDate(locataire?.date_sortie), y)
  if (bien?.heure_checkout) y = ligne(doc, 'Heure de départ', bien.heure_checkout, y)
  const nuits = nbNuits(locataire?.date_entree, locataire?.date_sortie)
  if (nuits > 0) y = ligne(doc, 'Nombre de nuits', `${nuits} nuit(s)`, y)
  y += 4

  // ── Tarification
  y = article(doc, 'ARTICLE 4', 'TARIFICATION', y)
  const prixNuit = bien?.prix_nuit || 0
  const total = prixNuit * (nuits || 1)
  const garantie = locataire?.depot_garantie || 0

  autoTable(doc, {
    startY: y,
    body: [
      ...(prixNuit ? [['Prix par nuit', formatMontantPDF(prixNuit)]] : []),
      ...(nuits ? [['Nombre de nuits', `${nuits}`]] : []),
      ...(total ? [['TOTAL SÉJOUR', formatMontantPDF(total)]] : []),
      ...(garantie ? [['Caution / Dépôt de garantie', formatMontantPDF(garantie)]] : []),
    ],
    theme: 'striped',
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    headStyles: { fillColor: [126, 34, 206], textColor: 255 },
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // ── Règles de la maison
  if (bien?.regles_maison) {
    y = article(doc, 'ARTICLE 5', 'RÈGLES DE LA MAISON', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const regles = doc.splitTextToSize(bien.regles_maison, 165)
    doc.text(regles, 22, y)
    y += regles.length * 5.5 + 4
  }

  // ── Obligations
  y = article(doc, bien?.regles_maison ? 'ARTICLE 6' : 'ARTICLE 5', 'OBLIGATIONS DU VOYAGEUR', y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const obligations = [
    '• Respecter la capacité maximale d\'accueil du logement.',
    '• Laisser le logement dans l\'état de propreté où il a été trouvé.',
    '• Ne pas organiser de fêtes ou réunions sans accord de l\'hôte.',
    '• Signaler immédiatement tout dommage ou dysfonctionnement.',
    '• Restituer les clés à l\'heure de check-out convenue.',
    '• Ne pas fumer à l\'intérieur du logement (sauf autorisation).',
  ]
  obligations.forEach(o => { doc.text(o, 22, y); y += 6 })
  y += 2

  // ── Annulation
  if (y < 248) {
    const numArt = bien?.regles_maison ? 'ARTICLE 7' : 'ARTICLE 6'
    y = article(doc, numArt, 'CONDITIONS D\'ANNULATION', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('• Annulation > 7 jours avant l\'arrivée : remboursement intégral.', 22, y); y += 6
    doc.text('• Annulation entre 3 et 7 jours : remboursement de 50% du montant.', 22, y); y += 6
    doc.text('• Annulation < 3 jours avant l\'arrivée : aucun remboursement.', 22, y); y += 8
  }

  // Signatures
  if (y > 252) { doc.addPage(); y = 20 }
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  doc.setTextColor(80, 80, 80)
  doc.text(`Fait à ${bien?.ville || 'Conakry'}, le ${today}, en deux exemplaires originaux.`, 105, y, { align: 'center' })
  y += 10
  signatures(doc, "L'HÔTE / BAILLEUR", 'LE VOYAGEUR', y)

  pied(doc)
  doc.save(`contrat_airbnb_${locataire?.nom || 'voyageur'}_${bien?.nom || 'logement'}.pdf`)
}

export function genererRelance(locataire: any, paiements: any[]) {
  const doc = new jsPDF()

  doc.setFillColor(239, 68, 68)
  doc.rect(0, 0, 210, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('LETTRE DE RELANCE - LOYER IMPAYÉ', 105, 18, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('CASA CHAMS - Gestion Locative', 105, 28, { align: 'center' })

  doc.setTextColor(0, 0, 0)
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFontSize(10)
  doc.text(`Conakry, le ${today}`, 140, 50)

  doc.setFont('helvetica', 'bold')
  doc.text(`À l'attention de : ${locataire?.prenom} ${locataire?.nom}`, 20, 65)
  doc.setFont('helvetica', 'normal')
  doc.text('Objet : Rappel de paiement de loyer(s) en retard', 20, 75)

  doc.text('Madame, Monsieur,', 20, 90)
  doc.text('Sauf erreur de notre part, nous constatons que les loyers suivants', 20, 100)
  doc.text('n\'ont pas encore été réglés à ce jour :', 20, 107)

  const totalDu = paiements.reduce((s, p) => s + p.montant, 0)

  autoTable(doc, {
    startY: 115,
    head: [['Mois', 'Montant dû (GNF)', 'Statut']],
    body: paiements.map(p => [p.mois_concerne, formatMontantPDF(p.montant), 'IMPAYÉ']),
    foot: [['TOTAL DÛ', formatMontantPDF(totalDu), '']],
    headStyles: { fillColor: [239, 68, 68], textColor: 255 },
    footStyles: { fillColor: [254, 242, 242], textColor: [239, 68, 68], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { textColor: [239, 68, 68], fontStyle: 'bold' } }
  })

  const finalY = (doc as any).lastAutoTable.finalY || 180

  doc.setFontSize(10)
  doc.text(`Nous vous demandons de bien vouloir régulariser la somme de ${formatMontantPDF(totalDu)}`, 20, finalY + 15)
  doc.text('dans les meilleurs délais, et au plus tard dans les 8 jours suivant la réception de ce courrier.', 20, finalY + 22)
  doc.text('Sans réponse de votre part, nous serions dans l\'obligation d\'engager les procédures', 20, finalY + 32)
  doc.text('légales nécessaires au recouvrement de cette créance.', 20, finalY + 39)

  doc.text('Nous restons à votre disposition pour tout renseignement complémentaire.', 20, finalY + 52)
  doc.text('Veuillez agréer, Madame, Monsieur, l\'expression de nos salutations distinguées.', 20, finalY + 62)

  doc.setFont('helvetica', 'bold')
  doc.text('La Direction', 20, finalY + 80)
  doc.line(20, finalY + 95, 90, finalY + 95)

  doc.save(`relance_${locataire?.nom}_${today}.pdf`)
}

/** Montant sans devise : le tableau porte déjà « (GNF) » en en-tête. */
function formatMontantSec(montant: number): string {
  return Math.round(montant || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function formatMontantPDF(montant: number): string {
  const n = Math.round(montant || 0)
  const formatted = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return formatted + ' GNF'
}
