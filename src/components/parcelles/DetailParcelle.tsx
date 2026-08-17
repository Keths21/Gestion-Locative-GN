'use client'

import GalerieDocuments from '@/components/parcelles/GalerieDocuments'
import FormulaireParcelle from '@/components/parcelles/FormulaireParcelle'
import type { Parcelle } from '@/types'

/**
 * Fiche complète d'une parcelle : documents rattachés puis champs modifiables.
 *
 * Partagée entre la carte et la liste, pour qu'il n'existe qu'une seule
 * définition de ce qu'on peut faire d'une parcelle. Sans ce composant, les
 * deux écrans divergeraient au premier champ ajouté.
 */
export default function DetailParcelle({
  parcelle,
  enLigne,
  position,
  onEnregistrer,
  onSupprimer,
  onFermer,
}: {
  parcelle: Parcelle
  enLigne: boolean
  position: { lat: number; lon: number } | null
  onEnregistrer: (champs: Partial<Parcelle>) => Promise<void>
  onSupprimer?: () => void | Promise<void>
  onFermer: () => void
}) {
  return (
    <>
      <div className="mb-5 border-b border-gray-200 pb-5">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Photos et documents</h3>
        <GalerieDocuments
          parcelleId={parcelle.id}
          organisationId={parcelle.organisation_id}
          enLigne={enLigne}
          position={position}
        />
      </div>

      <FormulaireParcelle
        parcelle={parcelle}
        onEnregistrer={onEnregistrer}
        onSupprimer={onSupprimer}
        onFermer={onFermer}
      />
    </>
  )
}
