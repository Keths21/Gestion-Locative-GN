/**
 * Écriture d'un montant en toutes lettres, en français.
 *
 * Une quittance porte le montant en lettres autant qu'en chiffres : c'est ce
 * qui la rend difficile à altérer après signature, et l'usage est constant
 * sur les reçus en Guinée.
 *
 * Orthographe retenue : celle de l'usage courant en Afrique francophone —
 * « quatre-vingts », « cent » invariable devant un autre nombre, trait
 * d'union entre les éléments d'un même groupe.
 */

const UNITES = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
]

const DIZAINES = [
  '', '', 'vingt', 'trente', 'quarante', 'cinquante',
  'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt',
]

/**
 * Convertit un entier de 0 à 999.
 *
 * `final` indique que le groupe termine le nombre. « Cent » et
 * « quatre-vingt » ne prennent leur s que dans ce cas : on écrit
 * « quatre-vingts » mais « quatre-vingt mille », « deux cents » mais
 * « deux cent mille ».
 */
function centaines(n: number, final = true): string {
  if (n === 0) return ''
  if (n < 20) return UNITES[n]

  if (n < 100) {
    const d = Math.floor(n / 10)
    const u = n % 10
    // 70-79 et 90-99 se disent « soixante-dix » et « quatre-vingt-dix »
    const base = d === 7 || d === 9 ? UNITES[10 + u] : UNITES[u]
    const liaison = u === 1 && d !== 8 && d !== 7 && d !== 9 ? ' et ' : base ? '-' : ''
    const dizaine = d === 8 && !base && final ? 'quatre-vingts' : DIZAINES[d]
    return dizaine + liaison + base
  }

  const c = Math.floor(n / 100)
  const reste = n % 100
  const pluriel = c > 1 && reste === 0 && final ? 's' : ''
  const prefixe = c === 1 ? 'cent' : `${UNITES[c]} cent${pluriel}`
  return reste === 0 ? prefixe : `${prefixe} ${centaines(reste)}`
}

const ECHELLES: [number, string, string][] = [
  [1_000_000_000, 'milliard', 'milliards'],
  [1_000_000, 'million', 'millions'],
  [1_000, 'mille', 'mille'],
]

export function nombreEnLettres(valeur: number): string {
  const n = Math.round(Math.abs(valeur))
  if (n === 0) return 'zéro'

  let reste = n
  const morceaux: string[] = []

  for (const [seuil, singulier, pluriel] of ECHELLES) {
    const q = Math.floor(reste / seuil)
    if (q === 0) continue
    reste %= seuil

    // Le quantième précède une échelle : il ne termine donc pas le nombre.
    if (seuil === 1_000) {
      // « mille » est invariable et ne prend pas « un » devant
      morceaux.push(q === 1 ? 'mille' : `${centaines(q, false)} mille`)
    } else {
      morceaux.push(`${centaines(q, false)} ${q > 1 ? pluriel : singulier}`)
    }
  }

  if (reste > 0) morceaux.push(centaines(reste))
  return morceaux.join(' ')
}

/**
 * Montant en toutes lettres, première lettre capitale, devise incluse.
 * Les centimes sont ignorés : le franc guinéen n'a pas de subdivision en usage.
 */
export function montantEnLettres(valeur: number, devise = 'GNF'): string {
  const mots = nombreEnLettres(valeur)
  const nom = devise === 'GNF' ? 'francs guinéens' : devise

  // « Million » et « milliard » sont des noms, pas des adjectifs numéraux :
  // ils appellent la préposition quand ils terminent le nombre — « trois
  // millions DE francs », mais « trois mille francs ».
  const liaison = /\b(millions?|milliards?)$/.test(mots) ? ' de ' : ' '

  const phrase = `${mots}${liaison}${nom}`
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}
