import { traiterEnvoiLocatif } from '@/lib/envois-locatifs'

// Le navigateur n'envoie que l'identifiant ; destinataire et contenu sont relus
// en base. Voir lib/envois-locatifs.ts.
export const dynamic = 'force-dynamic'

export function POST(req: Request) {
  return traiterEnvoiLocatif(req, 'whatsapp', 'relance')
}
