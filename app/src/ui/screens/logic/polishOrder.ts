/**
 * Ninerdeck - POLSKA KOLEJNOŚĆ ALFABETYCZNA bez `Intl` (4.0.0, epik Z-C #247; makieta 31C).
 *
 * Lista osób w arkuszu adresatów idzie po NAZWISKU („Osoby alfabetycznie po nazwisku"),
 * a polskie litery mają w alfabecie swoje miejsce: Ł po L, Ś po S, Ż na samym końcu.
 * Porównanie punktów kodowych postawiłoby „Łukasiewicza" za „Zieleniem", a wynik
 * `localeCompare` zależy od silnika (Node w testach, Hermes na telefonie) - porządek ma
 * być ten sam w obu miejscach, a aplikacja `Intl` nie woła, więc alfabet stoi tu jawnie.
 *
 * Znak spoza alfabetu (cyfra, myślnik, obca litera) idzie za alfabetem, w kolejności
 * punktów kodowych - nie znika i nie miesza się z literami.
 */

const ALPHABET = 'aąbcćdeęfghijklłmnńoópqrsśtuvwxyzźż';
const RANK: ReadonlyMap<string, number> = new Map([...ALPHABET].map((char, i) => [char, i]));

function rankOf(char: string): number {
  return RANK.get(char) ?? ALPHABET.length + (char.codePointAt(0) ?? 0);
}

/** Porównanie dwóch napisów w polskim porządku, bez wielkości liter. */
export function comparePolish(a: string, b: string): number {
  const left = [...a.toLowerCase()];
  const right = [...b.toLowerCase()];
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = rankOf(left[i]!) - rankOf(right[i]!);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

/** Nazwisko = ostatni wyraz („Anna Kowal" → „Kowal"). */
export function surnameOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] ?? '';
}

/** Po nazwisku, przy równych nazwiskach po pełnym napisie (imię rozstrzyga). */
export function bySurname(a: string, b: string): number {
  return comparePolish(surnameOf(a), surnameOf(b)) || comparePolish(a, b);
}
