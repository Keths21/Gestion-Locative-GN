import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { configSupabaseServeur } from '@/lib/config-supabase'

// Construit à l'appel, jamais au chargement du module : le constructeur lève
// quand la clé manque, et Next importe cette route pendant la construction pour
// en collecter les métadonnées. Au chargement, l'absence de clé ferait donc
// échouer la construction de l'image — là où un secret d'exécution n'a rien à
// faire. Même façon de procéder que lib/envoi.ts.
function clientResend() {
  const cle = process.env.RESEND_API_KEY
  if (!cle) throw new Error('RESEND_API_KEY non configurée')
  return new Resend(cle)
}

function createAdminClient() {
  return createSupabaseClient(
    configSupabaseServeur().url,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function checkIsAdmin(request: NextRequest): Promise<boolean> {
  const { url, cleAnon } = configSupabaseServeur()
  const supabase = createServerClient(
    url,
    cleAnon,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin'
}

// Adresse publique de l'environnement, pour les liens des courriels.
//
// Volontairement SANS le préfixe NEXT_PUBLIC_, et il ne faut pas le rétablir
// « par cohérence » : Next remplace les NEXT_PUBLIC_* par leur valeur au moment
// de la construction. Préfixée, cette adresse serait figée dans l'image Docker,
// et l'image validée en recette enverrait des liens vers dev.casachams.com une
// fois promue en production. Sans préfixe, elle est lue au démarrage, ce qui
// permet à une même image de servir les deux environnements.
//
// Ce code ne tourne que côté serveur : le navigateur n'a jamais besoin de la lire.
function adresseApplication(): string {
  return process.env.APP_URL || 'https://casachams.com'
}

function buildApprovalEmail(name: string): string {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px">
      <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07)">

        <div style="background:#2563eb;padding:32px;text-align:center">
          <h1 style="color:white;margin:0;font-size:22px">CASA CHAMS</h1>
          <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px">Gestion Locative</p>
        </div>

        <div style="padding:32px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-block;background:#dcfce7;border-radius:50%;padding:16px;margin-bottom:12px">
              <span style="font-size:32px">✓</span>
            </div>
            <h2 style="margin:0;color:#15803d;font-size:20px">Accès approuvé !</h2>
          </div>

          <p style="color:#374151;font-size:15px">Bonjour <strong>${name}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;line-height:1.7">
            Votre demande d'accès à la plateforme <strong>CASA CHAMS</strong> a été approuvée par l'administrateur.
            Vous pouvez dès maintenant vous connecter et utiliser toutes les fonctionnalités.
          </p>

          <div style="text-align:center;margin:32px 0">
            <a href="${adresseApplication()}/login"
               style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px">
              Se connecter
            </a>
          </div>

          <p style="color:#9ca3af;font-size:13px;text-align:center;margin:0">
            Si vous avez des questions, contactez-nous à <a href="mailto:support@casachams.com" style="color:#2563eb">support@casachams.com</a>
          </p>
        </div>

        <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center">
            CASA CHAMS · Gestion Locative · Guinée
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

function buildRejectionEmail(name: string, reason?: string): string {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px">
      <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07)">

        <div style="background:#2563eb;padding:32px;text-align:center">
          <h1 style="color:white;margin:0;font-size:22px">CASA CHAMS</h1>
          <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px">Gestion Locative</p>
        </div>

        <div style="padding:32px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-block;background:#fee2e2;border-radius:50%;padding:16px;margin-bottom:12px">
              <span style="font-size:32px">✕</span>
            </div>
            <h2 style="margin:0;color:#dc2626;font-size:20px">Demande d'accès refusée</h2>
          </div>

          <p style="color:#374151;font-size:15px">Bonjour <strong>${name}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;line-height:1.7">
            Votre demande d'accès à la plateforme <strong>CASA CHAMS</strong> n'a pas pu être approuvée.
          </p>

          ${reason ? `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0">
            <p style="margin:0;color:#991b1b;font-size:13px">
              <strong>Motif :</strong> ${reason}
            </p>
          </div>
          ` : ''}

          <p style="color:#6b7280;font-size:14px;line-height:1.7">
            Pour toute question ou demande de révision, n'hésitez pas à nous contacter directement.
          </p>

          <p style="color:#9ca3af;font-size:13px;text-align:center;margin-top:24px">
            Contactez-nous : <a href="mailto:support@casachams.com" style="color:#2563eb">support@casachams.com</a>
          </p>
        </div>

        <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center">
            CASA CHAMS · Gestion Locative · Guinée
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

export async function GET(request: NextRequest) {
  if (!await checkIsAdmin(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data })
}

export async function PATCH(request: NextRequest) {
  if (!await checkIsAdmin(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await request.json()
  const { userId, status, rejection_reason } = body

  if (!userId || !['approved', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Récupérer le profil avant de mettre à jour pour avoir email et nom
  const { data: profile } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .single()

  const { error } = await admin
    .from('profiles')
    .update({
      status,
      rejection_reason: status === 'rejected' ? (rejection_reason ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Envoyer l'email de notification si statut approuvé ou refusé
  if (profile?.email && (status === 'approved' || status === 'rejected')) {
    const name = profile.full_name || profile.email
    try {
      await clientResend().emails.send({
        from: 'CASA CHAMS <noreply@casachams.com>',
        to: profile.email,
        subject: status === 'approved'
          ? 'Votre accès CASA CHAMS a été approuvé'
          : 'Votre demande d\'accès CASA CHAMS',
        html: status === 'approved'
          ? buildApprovalEmail(name)
          : buildRejectionEmail(name, rejection_reason),
      })
    } catch {
      // L'email a échoué mais le statut est déjà mis à jour
    }
  }

  return NextResponse.json({ success: true })
}
