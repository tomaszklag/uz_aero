/**
 * Ninerdeck - POLITYKA HASŁA (2.1.0, `docs/logowanie-haslem.md` §3 D4, §8 pkt 10).
 *
 * JEDNA implementacja dla serwera (`PUT /me/password`, `POST /auth/password/reset`),
 * telefonu (ekran 13B), panelu (`#/konto`) i strony `/haslo/` (lustro z testem równości,
 * H-F): reguła sprawdzana po obu stronach z tej samej funkcji nie ma jak powiedzieć
 * użytkownikowi „hasło dobre", a serwerowi „hasło słabe".
 *
 * ══ NIST SP 800-63B, NIE „WIELKA LITERA, CYFRA I ZNAK" ══
 *  • długość jest JEDYNĄ miarą siły: minimum 12 znaków (liczonych w punktach kodowych
 *    Unicode, nie w bajtach ani w jednostkach UTF-16 - „🛩️" to jeden znak dla człowieka),
 *    maksimum 128 (scrypt liczy się na całości; sufit chroni serwer przed megabajtem);
 *  • BEZ reguł złożoności - wymuszają wzorce (`Haslo2026!`), które słowniki znają lepiej
 *    niż ludzie, i karzą frazy, które są długie i łatwe do zapamiętania;
 *  • BEZ wygasania (to decyzja serwera - tu nie ma czego sprawdzać);
 *  • LISTA ZABLOKOWANYCH: najczęstsze hasła (w tym polskie i związane z lotnictwem
 *    i z tym produktem) oraz FRAGMENTY tożsamości - adres e-mail, jego część lokalna
 *    i słowa z imienia i nazwiska. Hasło zawierające własne nazwisko jest pierwszym,
 *    które ktoś przy tablecie w kabinie spróbuje.
 *
 * Wynik jest KODEM, nie zdaniem: napisy nadaje ekran (telefon, panel i strona piszą je
 * po swojemu), a domena nie zna języka interfejsu. `null` = hasło przyjęte.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Minimalna długość fragmentu tożsamości, który blokuje: krótsze kawałki („jan", „ak")
 * pojawiałyby się w zwykłych słowach i odrzucały hasła bez związku z osobą.
 */
const IDENTITY_FRAGMENT_MIN = 4;

export type PasswordWeakness =
  | 'too_short'
  | 'too_long'
  | 'blocklisted'
  | 'contains_email'
  | 'contains_name';

/** To, co o osobie wie wołający; każde pole opcjonalne - strona `/haslo/` nie zna nazwiska. */
export interface PasswordContext {
  email?: string | null;
  name?: string | null;
}

/**
 * Najczęstsze hasła z publicznych list wycieków (górne pozycje), polskie odpowiedniki
 * i słowa z tej dziedziny. Porównanie po normalizacji (małe litery, bez odstępów,
 * bez ogonków), więc `Haslo1234567` i `hasło 1234567` to ten sam wpis. Lista jest krótka
 * celowo: przy minimum 12 znaków większość klasyków („123456", „password") odpada już
 * na długości - tu zostają te, które minimum przechodzą, i wzorce, które ludzie
 * wydłużają do wymaganej długości.
 */
export const PASSWORD_BLOCKLIST: readonly string[] = [
  '123456789012',
  '1234567890123',
  '12345678901234',
  '111111111111',
  '000000000000',
  'qwertyuiop12',
  'qwertyuiopas',
  'qwertyuiopasdf',
  'qwertyuiopasdfgh',
  'password1234',
  'password12345',
  'passwordpassword',
  'haslohaslo12',
  'haslo1234567',
  'haslo12345678',
  'mojehaslo123',
  'zaq12wsxcde3',
  'zaq1xsw2cde3',
  '1q2w3e4r5t6y',
  'iloveyou1234',
  'aaaaaaaaaaaa',
  'abcdefghijkl',
  'abcd12345678',
  'admin1234567',
  'administrator',
  'administrator1',
  'ninerdeck123',
  'ninerdeck1234',
  'ninerdeckninerdeck',
  'aeroklub1234',
  'aeroklubaeroklub',
  'samolot12345',
  'samolotsamolot',
  'lotnisko1234',
  'pilotpilot12',
  'pilot1234567',
  'skoki1234567',
  'cessna152cessna',
  'cessna172cessna',
];

/**
 * Sprawdzenie hasła wobec polityki. Kolejność odpowiada POWADZE: długość jest
 * warunkiem twardym i najtańszym, lista zablokowanych - drugim, tożsamość - trzecim.
 * Ekran pokazuje JEDEN powód, więc pierwszy ma być ten, który trzeba naprawić najpierw.
 */
export function checkPassword(password: string, context: PasswordContext = {}): PasswordWeakness | null {
  const length = codePoints(password);
  if (length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (length > PASSWORD_MAX_LENGTH) return 'too_long';

  const folded = normalize(password);
  if (blocklist().has(folded)) return 'blocklisted';

  for (const fragment of emailFragments(context.email)) {
    if (folded.includes(fragment)) return 'contains_email';
  }
  for (const fragment of nameFragments(context.name)) {
    if (folded.includes(fragment)) return 'contains_name';
  }
  return null;
}

/** Wygoda dla bramek, które pytają wyłącznie „tak/nie". */
export const isAcceptablePassword = (password: string, context: PasswordContext = {}): boolean =>
  checkPassword(password, context) == null;

/** Długość w PUNKTACH KODOWYCH - `'🛩️'.length` to 3, a znak jest jeden. */
const codePoints = (text: string): number => [...text].length;

/**
 * Normalizacja do porównań: małe litery, bez znaków diakrytycznych (NFD + wycięcie
 * znaków łączących; `ł` nie ma rozkładu NFD, więc osobno), bez odstępów. Dotyczy
 * WYŁĄCZNIE porównań - hasło zapisuje się takie, jakie wpisano.
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .replace(/\s+/g, '');
}

let normalizedBlocklist: Set<string> | null = null;
/** Lista po normalizacji, liczona raz - ta sama funkcja, którą normalizuje się hasło. */
function blocklist(): Set<string> {
  normalizedBlocklist ??= new Set(PASSWORD_BLOCKLIST.map((entry) => normalize(entry)));
  return normalizedBlocklist;
}

/**
 * Fragmenty adresu: cały adres i jego CZĘŚĆ LOKALNA (przed `@`), także rozbita na
 * kawałki po kropkach, myślnikach i podkreśleniach (`jan.kowalski` → `jan`, `kowalski`).
 * Domena (`gmail.com`) nie blokuje - to nie jest tożsamość tej osoby.
 */
function emailFragments(email: string | null | undefined): string[] {
  if (email == null) return [];
  const folded = normalize(email.trim());
  if (folded.length === 0) return [];
  const local = folded.split('@')[0] ?? '';
  return uniqueLongEnough([folded, local, ...local.split(/[._\-+]/)]);
}

/** Słowa z imienia i nazwiska (`Tomasz Małkiewicz` → `tomasz`, `malkiewicz`) i całość bez odstępów. */
function nameFragments(name: string | null | undefined): string[] {
  if (name == null) return [];
  const words = name
    .trim()
    .split(/[\s\-]+/)
    .map((word) => normalize(word))
    .filter((word) => word.length > 0);
  if (words.length === 0) return [];
  return uniqueLongEnough([words.join(''), ...words]);
}

const uniqueLongEnough = (fragments: readonly string[]): string[] => [
  ...new Set(fragments.filter((fragment) => fragment.length >= IDENTITY_FRAGMENT_MIN)),
];
