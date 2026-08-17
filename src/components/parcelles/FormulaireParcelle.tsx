'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Link2, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { listerBiensRattachables } from '@/lib/parcelles'
import { formaterDistance, formaterSuperficieDetail, versDMS } from '@/lib/geo'
import {
  COULEURS_PARCELLE,
  LIBELLES_JURIDIQUE,
  LIBELLES_SOURCE_TRACE,
  LIBELLES_STATUT_PARCELLE,
  LIBELLES_TYPE_PARCELLE,
} from '@/lib/constants'
import type { Parcelle, StatutJuridique, StatutParcelle, TypeParcelle } from '@/types'

/**
 * Formulaire de parcelle. Reprend les champs de FormulaireBien.tsx de
 * l'application carto, restylé sur le thème clair de CASA CHAMS, et complété
 * du rattachement facultatif à un bien locatif — le lien qui justifie que les
 * deux métiers vivent dans la même application.
 */

interface Props {
  parcelle: Parcelle
  onEnregistrer: (champs: Partial<Parcelle>) => Promise<void>
  onSupprimer?: () => void
  onFermer: () => void
}

function Champ({
  label,
  aide,
  children,
}: {
  label: string
  aide?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {aide && <p className="mt-1 text-xs text-gray-500">{aide}</p>}
    </div>
  )
}

const classeChamp =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500'

function nombreOuNull(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export default function FormulaireParcelle({
  parcelle,
  onEnregistrer,
  onSupprimer,
  onFermer,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [biens, setBiens] = useState<{ id: string; nom: string; adresse: string }[]>([])
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const [f, setF] = useState({
    nom: parcelle.nom,
    reference: parcelle.reference ?? '',
    type: parcelle.type,
    statut: parcelle.statut,
    statut_juridique: parcelle.statut_juridique,
    description: parcelle.description ?? '',
    region: parcelle.region ?? '',
    prefecture: parcelle.prefecture ?? '',
    commune: parcelle.commune ?? '',
    quartier: parcelle.quartier ?? '',
    adresse: parcelle.adresse ?? '',
    superficie_declaree_m2: parcelle.superficie_declaree_m2?.toString() ?? '',
    prix_achat: parcelle.prix_achat?.toString() ?? '',
    valeur_estimee: parcelle.valeur_estimee?.toString() ?? '',
    date_acquisition: parcelle.date_acquisition ?? '',
    proprietaire: parcelle.proprietaire ?? '',
    occupant: parcelle.occupant ?? '',
    contact_telephone: parcelle.contact_telephone ?? '',
    couleur: parcelle.couleur,
    tags: (parcelle.tags ?? []).join(', '),
    bien_id: parcelle.bien_id ?? '',
  })

  useEffect(() => {
    listerBiensRattachables(supabase).then(setBiens).catch(() => setBiens([]))
  }, [supabase])

  const maj = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((etat) => ({ ...etat, [k]: v }))

  /** Écart entre la superficie du titre et celle du tracé : révélateur d'un litige. */
  const ecartSuperficie = useMemo(() => {
    const declaree = nombreOuNull(f.superficie_declaree_m2)
    if (!declaree || !parcelle.superficie_m2) return null
    const ecart = ((parcelle.superficie_m2 - declaree) / declaree) * 100
    return Math.abs(ecart) < 1 ? null : ecart
  }, [f.superficie_declaree_m2, parcelle.superficie_m2])

  const soumettre = async () => {
    setErreur(null)
    if (!f.nom.trim()) {
      setErreur('Le nom est obligatoire.')
      return
    }
    setEnregistrement(true)
    try {
      await onEnregistrer({
        nom: f.nom.trim(),
        reference: f.reference.trim() || null,
        type: f.type,
        statut: f.statut,
        statut_juridique: f.statut_juridique,
        description: f.description.trim() || null,
        region: f.region.trim() || null,
        prefecture: f.prefecture.trim() || null,
        commune: f.commune.trim() || null,
        quartier: f.quartier.trim() || null,
        adresse: f.adresse.trim() || null,
        superficie_declaree_m2: nombreOuNull(f.superficie_declaree_m2),
        prix_achat: nombreOuNull(f.prix_achat),
        valeur_estimee: nombreOuNull(f.valeur_estimee),
        date_acquisition: f.date_acquisition || null,
        proprietaire: f.proprietaire.trim() || null,
        occupant: f.occupant.trim() || null,
        contact_telephone: f.contact_telephone.trim() || null,
        couleur: f.couleur,
        tags: f.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        bien_id: f.bien_id || null,
      })
      onFermer()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setEnregistrement(false)
    }
  }

  const centre = parcelle.point_geom?.coordinates

  return (
    <div className="flex flex-col gap-5">
      {/* Mesures calculées en base — jamais saisies */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Superficie mesurée</span>
          <span className="font-semibold text-gray-900">
            {formaterSuperficieDetail(parcelle.superficie_m2)}
          </span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-gray-500">Périmètre</span>
          <span className="text-gray-700">{formaterDistance(parcelle.perimetre_m)}</span>
        </div>
        {centre && (
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-gray-500">Repère</span>
            <span className="font-mono text-gray-700">
              {versDMS(centre[1], 'lat')} {versDMS(centre[0], 'lon')}
            </span>
          </div>
        )}
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-gray-500">Origine du tracé</span>
          <span className="text-gray-700">{LIBELLES_SOURCE_TRACE[parcelle.source_trace]}</span>
        </div>
        {parcelle.precision_m != null && (
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-gray-500">Précision du relevé</span>
            <span className="text-gray-700">±{Math.round(parcelle.precision_m)} m</span>
          </div>
        )}
      </div>

      <Champ label="Nom">
        <input className={classeChamp} value={f.nom} onChange={(e) => maj('nom', e.target.value)} />
      </Champ>

      <div className="grid grid-cols-2 gap-3">
        <Champ label="Référence" aide="N° de titre, lot ou parcelle">
          <input
            className={classeChamp}
            value={f.reference}
            onChange={(e) => maj('reference', e.target.value)}
          />
        </Champ>
        <Champ label="Type">
          <select
            className={classeChamp}
            value={f.type}
            onChange={(e) => maj('type', e.target.value as TypeParcelle)}
          >
            {Object.entries(LIBELLES_TYPE_PARCELLE).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Champ label="Statut">
          <select
            className={classeChamp}
            value={f.statut}
            onChange={(e) => maj('statut', e.target.value as StatutParcelle)}
          >
            {Object.entries(LIBELLES_STATUT_PARCELLE).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Situation juridique">
          <select
            className={classeChamp}
            value={f.statut_juridique}
            onChange={(e) => maj('statut_juridique', e.target.value as StatutJuridique)}
          >
            {Object.entries(LIBELLES_JURIDIQUE).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      <Champ
        label="Rattacher à un bien locatif"
        aide="Facultatif — relie cette parcelle à un logement du portefeuille locatif"
      >
        <div className="flex items-center gap-2">
          <Link2 size={16} className="shrink-0 text-gray-400" />
          <select
            className={classeChamp}
            value={f.bien_id}
            onChange={(e) => maj('bien_id', e.target.value)}
          >
            <option value="">Aucun</option>
            {biens.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nom} — {b.adresse}
              </option>
            ))}
          </select>
        </div>
      </Champ>

      <Champ
        label="Superficie au titre (m²)"
        aide="Superficie inscrite au document, pour comparaison avec le tracé"
      >
        <input
          className={classeChamp}
          inputMode="decimal"
          value={f.superficie_declaree_m2}
          onChange={(e) => maj('superficie_declaree_m2', e.target.value)}
        />
      </Champ>

      {ecartSuperficie !== null && (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            Math.abs(ecartSuperficie) > 10
              ? 'bg-red-50 text-red-700'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          Le tracé mesure {ecartSuperficie > 0 ? '+' : ''}
          {ecartSuperficie.toFixed(1)} % par rapport à la superficie du titre.
          {Math.abs(ecartSuperficie) > 10 && ' Écart important : à vérifier sur le terrain.'}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Champ label="Région">
          <input
            className={classeChamp}
            value={f.region}
            onChange={(e) => maj('region', e.target.value)}
          />
        </Champ>
        <Champ label="Préfecture">
          <input
            className={classeChamp}
            value={f.prefecture}
            onChange={(e) => maj('prefecture', e.target.value)}
          />
        </Champ>
        <Champ label="Commune">
          <input
            className={classeChamp}
            value={f.commune}
            onChange={(e) => maj('commune', e.target.value)}
          />
        </Champ>
        <Champ label="Quartier">
          <input
            className={classeChamp}
            value={f.quartier}
            onChange={(e) => maj('quartier', e.target.value)}
          />
        </Champ>
      </div>

      <Champ label="Adresse">
        <input
          className={classeChamp}
          value={f.adresse}
          onChange={(e) => maj('adresse', e.target.value)}
        />
      </Champ>

      <div className="grid grid-cols-2 gap-3">
        <Champ label="Prix d'achat (GNF)">
          <input
            className={classeChamp}
            inputMode="decimal"
            value={f.prix_achat}
            onChange={(e) => maj('prix_achat', e.target.value)}
          />
        </Champ>
        <Champ label="Valeur estimée (GNF)">
          <input
            className={classeChamp}
            inputMode="decimal"
            value={f.valeur_estimee}
            onChange={(e) => maj('valeur_estimee', e.target.value)}
          />
        </Champ>
      </div>

      <Champ label="Date d'acquisition">
        <input
          type="date"
          className={classeChamp}
          value={f.date_acquisition}
          onChange={(e) => maj('date_acquisition', e.target.value)}
        />
      </Champ>

      <div className="grid grid-cols-2 gap-3">
        <Champ label="Propriétaire">
          <input
            className={classeChamp}
            value={f.proprietaire}
            onChange={(e) => maj('proprietaire', e.target.value)}
          />
        </Champ>
        <Champ label="Occupant">
          <input
            className={classeChamp}
            value={f.occupant}
            onChange={(e) => maj('occupant', e.target.value)}
          />
        </Champ>
      </div>

      <Champ label="Téléphone de contact">
        <input
          className={classeChamp}
          value={f.contact_telephone}
          onChange={(e) => maj('contact_telephone', e.target.value)}
        />
      </Champ>

      <Champ label="Étiquettes" aide="Séparées par des virgules">
        <input
          className={classeChamp}
          value={f.tags}
          onChange={(e) => maj('tags', e.target.value)}
        />
      </Champ>

      <Champ label="Couleur sur la carte">
        <div className="flex flex-wrap gap-2">
          {COULEURS_PARCELLE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => maj('couleur', c)}
              className={`h-8 w-8 rounded-full border-2 transition-transform ${
                f.couleur === c ? 'scale-110 border-gray-900' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Couleur ${c}`}
            />
          ))}
        </div>
      </Champ>

      <Champ label="Description">
        <textarea
          className={`${classeChamp} min-h-20`}
          value={f.description}
          onChange={(e) => maj('description', e.target.value)}
        />
      </Champ>

      {erreur && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</div>
      )}

      <div className="flex gap-2 pb-2">
        <button
          onClick={soumettre}
          disabled={enregistrement}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Check size={16} />
          {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          onClick={onFermer}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <X size={16} />
        </button>
        {onSupprimer && (
          <button
            onClick={onSupprimer}
            className="rounded-lg border border-red-200 px-4 py-2.5 text-red-600 hover:bg-red-50"
            aria-label="Supprimer la parcelle"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
