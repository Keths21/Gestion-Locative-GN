'use client'

import { useEffect } from 'react'

/**
 * Enregistre le service worker.
 *
 * Écarté en développement : le worker servirait des pages en cache et
 * masquerait les modifications en cours.
 */
export default function EnregistrementSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV === 'development') return

    const enregistrer = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => {
        console.warn('Service worker non enregistré :', e)
      })
    }

    if (document.readyState === 'complete') enregistrer()
    else window.addEventListener('load', enregistrer, { once: true })
  }, [])

  return null
}
