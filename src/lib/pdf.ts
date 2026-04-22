import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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

export async function genererQuittance(paiement: any) {
  const doc = new jsPDF()

  let cachetBase64: string | null = null
  try {
    cachetBase64 = await loadImageAsBase64('/innovea_cachet.png')
  } catch {
    // continue sans cachet
  }
  const locataire = paiement.locataire
  const bien = paiement.bien

  // En-tête
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, 210, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('QUITTANCE DE LOYER', 105, 18, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('CASA CHAMS - Gestion Locative', 105, 28, { align: 'center' })

  // Période
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Quittance du mois de : ${paiement.mois_concerne}`, 20, 50)

  // Infos bailleur
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('BAILLEUR', 20, 65)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'bold')
  doc.text('Votre Agence Immobilière', 20, 72)
  doc.setFont('helvetica', 'normal')
  doc.text('Conakry, République de Guinée', 20, 79)

  // Infos locataire
  doc.setTextColor(100, 100, 100)
  doc.text('LOCATAIRE', 120, 65)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'bold')
  doc.text(`${locataire?.prenom || ''} ${locataire?.nom || ''}`, 120, 72)
  doc.setFont('helvetica', 'normal')
  doc.text(bien?.adresse || '', 120, 79)
  doc.text(bien?.ville || 'Conakry', 120, 86)

  // Tableau des montants
  autoTable(doc, {
    startY: 100,
    head: [['Désignation', 'Montant (GNF)']],
    body: [
      ['Loyer principal', formatMontantPDF(bien?.loyer_base || paiement.montant)],
      ['Charges', formatMontantPDF(bien?.charges || 0)],
      ['Total reçu', formatMontantPDF(paiement.montant)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    foot: [['TOTAL PAYÉ', formatMontantPDF(paiement.montant)]],
    footStyles: { fillColor: [240, 253, 244], textColor: [22, 163, 74], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } }
  })

  const finalY = (doc as any).lastAutoTable.finalY || 160

  // Mention légale — bloc dynamique
  doc.setFontSize(9)
  const lh = 7
  const maxW = 158
  const l1 = 'Je soussigné(e), bailleur du logement désigné ci-dessus, reconnais avoir reçu'
  const l2 = doc.splitTextToSize(
    `la somme de ${formatMontantPDF(paiement.montant)} au titre du loyer et des charges du mois de ${paiement.mois_concerne}.`,
    maxW
  )
  const l3 = 'Et lui en donne quittance, sous réserve de tous mes droits.'
  const totalLines = 1 + l2.length + 1
  const blockH = 10 + totalLines * lh + 4

  doc.setFillColor(249, 250, 251)
  doc.rect(20, finalY + 10, 170, blockH, 'F')
  doc.setTextColor(100, 100, 100)

  let ty = finalY + 20
  doc.text(l1, 105, ty, { align: 'center' })
  ty += lh
  doc.text(l2, 105, ty, { align: 'center' })
  ty += l2.length * lh
  doc.text(l3, 105, ty, { align: 'center' })

  const blockEndY = finalY + 10 + blockH

  // Date et signature
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.3)
  doc.line(20, blockEndY + 8, 190, blockEndY + 8)

  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.text(`Fait à Conakry, le ${today}`, 20, blockEndY + 20)

  doc.setFont('helvetica', 'bold')
  doc.text('Signature du bailleur :', 160, blockEndY + 20, { align: 'center' })
  if (cachetBase64) {
    doc.addImage(cachetBase64, 'PNG', 136, blockEndY + 23, 48, 44)
  }

  // Pied de page
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.setFont('helvetica', 'normal')
  doc.text('Document généré par CASA CHAMS - casachams.com', 105, 285, { align: 'center' })

  // Téléchargement
  const filename = `quittance_${locataire?.nom || 'locataire'}_${paiement.mois_concerne}.pdf`
  doc.save(filename)
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

function formatMontantPDF(montant: number): string {
  const n = Math.round(montant || 0)
  const formatted = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return formatted + ' GNF'
}
