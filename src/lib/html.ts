/**
 * Échappement HTML.
 *
 * Toute donnée saisie par un utilisateur — nom d'agence, de locataire, de
 * bien, libellé d'échéance — qui entre dans un fragment HTML passe par ici :
 * courriels de relance, de quittance et d'alerte, étiquettes de la carte.
 *
 * Les courriels n'échappaient rien avant l'audit du 11/10/2026 : un nom de
 * locataire contenant du balisage s'affichait tel quel chez le destinataire,
 * dans un message parti de noreply@casachams.com — de quoi y glisser un lien
 * d'hameçonnage sous l'en-tête de l'agence.
 */
export function echapperHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}
