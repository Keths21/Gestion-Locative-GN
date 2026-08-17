'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type { Parcelle, PolygoneGeoJSON } from '@/types'
import { FONDS, VUE_DEFAUT, type CleFond } from '@/lib/fonds-carte'
import { formaterSuperficie } from '@/lib/geo'

/**
 * Carte Leaflet. Repris de CarteBiens.tsx de l'application CartographieBiens.
 *
 * Leaflet manipule le DOM directement et ne supporte pas le rendu serveur :
 * ce composant doit être importé via next/dynamic avec ssr: false.
 */

export interface PoigneeCarte {
  demarrerTrace: () => void
  annulerTrace: () => void
  activerEdition: (id: string) => void
  terminerEdition: () => PolygoneGeoJSON | null
  centrerSur: (id: string, zoom?: number) => void
  centrerSurPoint: (lat: number, lon: number, zoom?: number) => void
  localiser: () => void
  ajusterVue: () => void
}

interface Props {
  parcelles: Parcelle[]
  selectionId: string | null
  fond: CleFond
  reperes: boolean
  etiquettes: boolean
  releve: [number, number][] | null
  couleurTrace?: string
  onSelection: (id: string | null) => void
  onTraceTermine: (poly: PolygoneGeoJSON) => void
  onModeChange?: (mode: 'navigation' | 'trace' | 'edition') => void
  onPositionChange?: (p: { lat: number; lon: number; precision: number } | null) => void
}

function versLatLngs(poly: PolygoneGeoJSON): L.LatLngExpression[][] {
  return poly.coordinates.map((anneau) => anneau.map(([lon, lat]) => [lat, lon] as [number, number]))
}

function versGeoJson(layer: L.Polygon): PolygoneGeoJSON | null {
  const gj = layer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>
  if (gj.geometry?.type !== 'Polygon') return null
  return gj.geometry as PolygoneGeoJSON
}

function echapperHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

const CarteParcelles = forwardRef<PoigneeCarte, Props>(function CarteParcelles(
  {
    parcelles,
    selectionId,
    fond,
    reperes,
    etiquettes,
    releve,
    couleurTrace = '#f59e0b',
    onSelection,
    onTraceTermine,
    onModeChange,
    onPositionChange,
  },
  ref
) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<L.Map | null>(null)
  const coucheFond = useRef<L.TileLayer | null>(null)
  const coucheReperes = useRef<L.TileLayer | null>(null)
  const groupe = useRef<L.FeatureGroup | null>(null)
  const couchesParId = useRef<Map<string, L.Polygon | L.CircleMarker>>(new Map())
  const coucheReleve = useRef<L.Polyline | null>(null)
  const marqueurPosition = useRef<L.CircleMarker | null>(null)
  const cerclePrecision = useRef<L.Circle | null>(null)
  const enEdition = useRef<L.Polygon | null>(null)
  const idSuiviGps = useRef<number | null>(null)

  /* ----------------------------- initialisation ---------------------------- */
  useEffect(() => {
    if (!conteneur.current || carte.current) return

    const m = L.map(conteneur.current, {
      center: VUE_DEFAUT,
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      maxZoom: 22,
    })

    L.control.zoom({ position: 'topright' }).addTo(m)
    L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 140 }).addTo(m)

    groupe.current = L.featureGroup().addTo(m)
    carte.current = m

    m.on('click', () => onSelection(null))

    m.on('pm:create', (e: { layer: L.Layer }) => {
      const layer = e.layer as L.Polygon
      const geo = versGeoJson(layer)
      m.removeLayer(layer)
      if (geo) onTraceTermine(geo)
      onModeChange?.('navigation')
    })

    m.on('pm:drawstart', () => onModeChange?.('trace'))
    m.on('pm:drawend', () => onModeChange?.('navigation'))

    // Suivi GPS continu : indispensable pour se repérer sur le terrain.
    if (navigator.geolocation) {
      idSuiviGps.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords
          onPositionChange?.({ lat: latitude, lon: longitude, precision: accuracy })

          if (!marqueurPosition.current) {
            cerclePrecision.current = L.circle([latitude, longitude], {
              radius: accuracy,
              color: '#38bdf8',
              weight: 1,
              fillColor: '#38bdf8',
              fillOpacity: 0.12,
              interactive: false,
            }).addTo(m)
            marqueurPosition.current = L.circleMarker([latitude, longitude], {
              radius: 7,
              color: '#0ea5e9',
              weight: 3,
              fillColor: '#e0f2fe',
              fillOpacity: 1,
              interactive: false,
            }).addTo(m)
          } else {
            marqueurPosition.current.setLatLng([latitude, longitude])
            cerclePrecision.current?.setLatLng([latitude, longitude])
            cerclePrecision.current?.setRadius(accuracy)
          }
        },
        () => onPositionChange?.(null),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
      )
    }

    // Rotation de l'écran, ouverture du panneau : Leaflet doit être prévenu.
    const observateur = new ResizeObserver(() => m.invalidateSize())
    observateur.observe(conteneur.current)

    return () => {
      observateur.disconnect()
      if (idSuiviGps.current !== null) navigator.geolocation.clearWatch(idSuiviGps.current)
      m.remove()
      carte.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ------------------------------ fond de plan ----------------------------- */
  useEffect(() => {
    const m = carte.current
    if (!m) return
    if (coucheFond.current) m.removeLayer(coucheFond.current)
    const cfg = FONDS[fond]
    coucheFond.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxNativeZoom: cfg.zoomMax,
      maxZoom: 22,
      crossOrigin: true,
      keepBuffer: 4,
    }).addTo(m)
    coucheFond.current.bringToBack()
  }, [fond])

  useEffect(() => {
    const m = carte.current
    if (!m) return
    if (coucheReperes.current) {
      m.removeLayer(coucheReperes.current)
      coucheReperes.current = null
    }
    if (reperes && fond === 'satellite') {
      coucheReperes.current = L.tileLayer(FONDS.reperes.url, {
        maxNativeZoom: FONDS.reperes.zoomMax,
        maxZoom: 22,
        crossOrigin: true,
        opacity: 0.9,
      }).addTo(m)
    }
  }, [reperes, fond])

  /* ------------------------------- parcelles ------------------------------- */
  useEffect(() => {
    const m = carte.current
    const g = groupe.current
    if (!m || !g) return

    g.clearLayers()
    couchesParId.current.clear()

    for (const p of parcelles) {
      let couche: L.Polygon | L.CircleMarker | null = null

      if (p.geom) {
        couche = L.polygon(versLatLngs(p.geom), {
          color: p.couleur,
          weight: p.id === selectionId ? 4 : 2.5,
          opacity: 1,
          fillColor: p.couleur,
          fillOpacity: p.id === selectionId ? 0.35 : 0.18,
          bubblingMouseEvents: false,
        })
      } else if (p.point_geom) {
        const [lon, lat] = p.point_geom.coordinates
        couche = L.circleMarker([lat, lon], {
          radius: p.id === selectionId ? 11 : 8,
          color: p.couleur,
          weight: 3,
          fillColor: p.couleur,
          fillOpacity: 0.6,
          bubblingMouseEvents: false,
        })
      }

      if (!couche) continue

      couche.on('click', (e) => {
        L.DomEvent.stopPropagation(e as unknown as Event)
        onSelection(p.id)
      })

      if (etiquettes) {
        couche.bindTooltip(
          `<span>${echapperHtml(p.nom)}</span>${
            p.superficie_m2
              ? `<span class="surface">${formaterSuperficie(p.superficie_m2)}</span>`
              : ''
          }`,
          { permanent: true, direction: 'center', className: 'etiquette-parcelle', opacity: 1 }
        )
      }

      couche.addTo(g)
      couchesParId.current.set(p.id, couche)
    }
  }, [parcelles, selectionId, etiquettes, onSelection])

  /* -------------------- relevé GPS en cours (à la marche) ------------------- */
  useEffect(() => {
    const m = carte.current
    if (!m) return
    if (coucheReleve.current) {
      m.removeLayer(coucheReleve.current)
      coucheReleve.current = null
    }
    if (releve && releve.length > 1) {
      coucheReleve.current = L.polyline(
        releve.map(([lon, lat]) => [lat, lon] as [number, number]),
        { color: couleurTrace, weight: 3, dashArray: '6 6' }
      ).addTo(m)
    }
  }, [releve, couleurTrace])

  /* -------------------------------- impératif ------------------------------ */
  useImperativeHandle(
    ref,
    (): PoigneeCarte => ({
      demarrerTrace() {
        const m = carte.current
        if (!m) return
        m.pm.enableDraw('Polygon', {
          snappable: true,
          snapDistance: 20,
          allowSelfIntersection: false,
          finishOn: 'dblclick',
          templineStyle: { color: couleurTrace, weight: 3 },
          hintlineStyle: { color: couleurTrace, dashArray: '6 6', weight: 2 },
          pathOptions: { color: couleurTrace, fillColor: couleurTrace, fillOpacity: 0.25 },
        })
        onModeChange?.('trace')
      },
      annulerTrace() {
        carte.current?.pm.disableDraw()
        onModeChange?.('navigation')
      },
      activerEdition(id) {
        const couche = couchesParId.current.get(id)
        if (!couche || !(couche instanceof L.Polygon)) return
        couche.pm.enable({ allowSelfIntersection: false, snappable: true, snapDistance: 20 })
        enEdition.current = couche
        onModeChange?.('edition')
      },
      terminerEdition() {
        const couche = enEdition.current
        if (!couche) return null
        couche.pm.disable()
        enEdition.current = null
        onModeChange?.('navigation')
        return versGeoJson(couche)
      },
      centrerSur(id, zoom) {
        const couche = couchesParId.current.get(id)
        const m = carte.current
        if (!couche || !m) return
        if (couche instanceof L.Polygon) {
          m.fitBounds(couche.getBounds(), { padding: [60, 60], maxZoom: zoom ?? 19 })
        } else {
          m.setView(couche.getLatLng(), zoom ?? 18)
        }
      },
      centrerSurPoint(lat, lon, zoom = 18) {
        carte.current?.setView([lat, lon], zoom)
      },
      localiser() {
        const p = marqueurPosition.current
        if (p) carte.current?.setView(p.getLatLng(), 18)
        else carte.current?.locate({ setView: true, maxZoom: 18, enableHighAccuracy: true })
      },
      ajusterVue() {
        const g = groupe.current
        if (!g || !carte.current) return
        const b = g.getBounds()
        if (b.isValid()) carte.current.fitBounds(b, { padding: [50, 50], maxZoom: 18 })
      },
    }),
    [couleurTrace, onModeChange]
  )

  return <div ref={conteneur} className="h-full w-full" />
})

export default CarteParcelles
