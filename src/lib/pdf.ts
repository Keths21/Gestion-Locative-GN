import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function genererQuittance(paiement: any) {
  const doc = new jsPDF()
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
  doc.text('GérerSeul Guinée - Gestion Locative', 105, 28, { align: 'center' })

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

  // Mention légale
  doc.setFillColor(249, 250, 251)
  doc.rect(20, finalY + 10, 170, 30, 'F')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text('Je soussigné(e), bailleur du logement désigné ci-dessus, reconnais avoir reçu', 105, finalY + 22, { align: 'center' })
  doc.text(`la somme de ${formatMontantPDF(paiement.montant)} au titre du loyer et des charges du mois de ${paiement.mois_concerne}.`, 105, finalY + 29, { align: 'center' })
  doc.text('Et lui en donne quittance, sous réserve de tous mes droits.', 105, finalY + 36, { align: 'center' })

  // Date et signature
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text(`Fait à Conakry, le ${today}`, 20, finalY + 55)

  doc.setFont('helvetica', 'bold')
  doc.text('Signature du bailleur :', 130, finalY + 55)
  doc.line(130, finalY + 70, 190, finalY + 70)

  // Pied de page
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.setFont('helvetica', 'normal')
  doc.text('Document généré par GérerSeul Guinée - gestion-locative.com', 105, 285, { align: 'center' })

  // Téléchargement
  const filename = `quittance_${locataire?.nom || 'locataire'}_${paiement.mois_concerne}.pdf`
  doc.save(filename)
}

export function genererBail(locataire: any, bien: any) {
  const doc = new jsPDF()

  // En-tête
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, 210, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('CONTRAT DE BAIL', 105, 18, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('GérerSeul Guinée - Gestion Locative', 105, 28, { align: 'center' })

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('CONTRAT DE LOCATION', 105, 50, { align: 'center' })

  // Parties
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('ENTRE LES SOUSSIGNÉS :', 20, 65)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Le Bailleur : Votre Agence Immobilière, ci-après dénommé "LE BAILLEUR"', 20, 75)
  doc.text(`Le Locataire : ${locataire?.prenom} ${locataire?.nom}, ci-après dénommé "LE LOCATAIRE"`, 20, 85)

  // Objet
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('ARTICLE 1 - OBJET DU CONTRAT', 20, 100)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const objetText = `Le présent contrat a pour objet la location du bien immobilier suivant :\n- Type : ${bien?.type}\n- Adresse : ${bien?.adresse}, ${bien?.ville}\n- Surface : ${bien?.surface} m²`
  doc.text(objetText, 20, 110)

  // Durée
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('ARTICLE 2 - DURÉE', 20, 140)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Le présent bail commence le ${locataire?.date_entree} pour une durée d'un (1) an renouvelable.`, 20, 150)

  // Loyer
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('ARTICLE 3 - LOYER ET CHARGES', 20, 165)

  autoTable(doc, {
    startY: 172,
    body: [
      ['Loyer mensuel', formatMontantPDF(bien?.loyer_base || 0)],
      ['Charges mensuelles', formatMontantPDF(bien?.charges || 0)],
      ['Dépôt de garantie', formatMontantPDF(locataire?.depot_garantie || 0)],
      ['TOTAL MENSUEL', formatMontantPDF((bien?.loyer_base || 0) + (bien?.charges || 0))],
    ],
    theme: 'striped',
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    footStyles: { fillColor: [37, 99, 235], textColor: 255 }
  })

  const finalY = (doc as any).lastAutoTable.finalY || 230

  // Obligations
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('ARTICLE 4 - OBLIGATIONS', 20, finalY + 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Le locataire s\'engage à : payer le loyer aux échéances convenues, entretenir le logement,', 20, finalY + 25)
  doc.text('souscrire une assurance habitation et respecter les règles de bon voisinage.', 20, finalY + 32)

  // Signatures
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const sigY = finalY + 50
  doc.text('LE BAILLEUR', 40, sigY, { align: 'center' })
  doc.text('LE LOCATAIRE', 170, sigY, { align: 'center' })
  doc.line(20, sigY + 20, 80, sigY + 20)
  doc.line(130, sigY + 20, 195, sigY + 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const today = new Date().toLocaleDateString('fr-FR')
  doc.text(`Conakry, le ${today}`, 105, sigY + 30, { align: 'center' })

  doc.save(`bail_${locataire?.nom}_${bien?.nom}.pdf`)
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
  doc.text('GérerSeul Guinée - Gestion Locative', 105, 28, { align: 'center' })

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
  return new Intl.NumberFormat('fr-GN', {
    style: 'currency',
    currency: 'GNF',
    maximumFractionDigits: 0
  }).format(montant)
}
