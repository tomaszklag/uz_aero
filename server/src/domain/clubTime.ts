/**
 * Ninerdeck (serwer) - DOBY KALENDARZA W STREFIE KLUBU (milestone 3.0.0,
 * `docs/rezerwacje.md` §6).
 *
 * Kalendarz rezerwacji liczy się w strefie KLUBU, a nie urządzenia (P1): samolot stoi
 * w jednym miejscu na ziemi, więc „sobota o dziewiątej" ma znaczyć to samo dla pilota
 * z Krakowa i dla tego, który rezerwuje z Grecji. Baza trzyma `TIMESTAMPTZ`, czyli
 * chwilę bezwzględną - strefa rysuje SIATKĘ, nie zmienia zapisu.
 *
 * ══ TO JEST ODPOWIEDŹ NA PYTANIE O `Intl` NA TELEFONIE (B0) ══
 * Pytanie brzmiało: czy trasa oddaje same chwile UTC (telefon liczy strefę sam), czy
 * dokłada offsety, bo reguł czasu letniego nie ma jak odtworzyć na urządzeniu bez
 * danych ICU. **Właściwa odpowiedź jest trzecia i nie zależy od wyniku sondy:** trasa
 * oddaje GRANICE KAŻDEJ DOBY jako chwile UTC, a telefon nie konwertuje stref w ogóle.
 *
 *  - położenie rezerwacji na siatce = `(startsAt - dayStart) / godzina`;
 *  - godzina z formularza w chwilę = `dayStart + godzina * godzina`;
 *  - podpis osi = ta sama różnica.
 *
 * Żadne z tych trzech działań nie potrzebuje `Intl`, tablicy stref ani reguł czasu
 * letniego - a doba, która ma 23 albo 25 godzin, wychodzi poprawnie sama, bo jest po
 * prostu krótsza albo dłuższa. Offset per doba byłby gorszy: w dniu zmiany czasu jest
 * ich DWA, więc jedna liczba musiałaby skłamać w którejś połowie dnia.
 *
 * Strefa jedzie w odpowiedzi jako NAPIS do wyświetlenia („czas klubu"), nie jako
 * materiał do rachunku.
 *
 * `Intl` na SERWERZE jest pełne (Node z kompletem ICU) i tu go używamy - to jedyne
 * miejsce w systemie, które zna reguły czasu letniego.
 */

/** Doba kalendarza: data lokalna i jej granice jako chwile bezwzględne (ms). */
export interface ClubDay {
  /** `YYYY-MM-DD` w strefie klubu - etykieta, po której telefon grupuje wiersze. */
  date: string;
  /** Północ lokalna, w ms UTC. */
  startsAt: number;
  /** Następna północ lokalna - koniec półotwarty, jak wszędzie w rezerwacjach. */
  endsAt: number;
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * Przesunięcie strefy względem UTC w danej CHWILI, w milisekundach.
 *
 * Sposób jest standardowy i wygląda okrężnie, bo `Intl` nie ma metody „podaj offset":
 * formatujemy chwilę w strefie docelowej, składamy z części z powrotem datę tak, jakby
 * te liczby były w UTC, i odejmujemy. Różnica JEST offsetem.
 */
function offsetAt(zone: string, instant: number): number {
  const parts = formatterFor(zone).formatToParts(new Date(instant));
  const at: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') at[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    at.year ?? 1970,
    (at.month ?? 1) - 1,
    at.day ?? 1,
    // `hour12: false` daje o północy „24" w części przeglądarek i wydań Node - bez tego
    // doba zaczynałaby się dzień później i nikt by tego nie zauważył poza zmianą czasu.
    (at.hour ?? 0) % 24,
    at.minute ?? 0,
    at.second ?? 0,
  );
  return asUtc - instant;
}

/** Formatery są drogie w budowie, a pytamy o tę samą strefę dziesiątki razy pod rząd. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  const known = FORMATTERS.get(zone);
  if (known != null) return known;
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  FORMATTERS.set(zone, made);
  return made;
}

/**
 * Północ lokalna dnia kalendarzowego (liczonego od `Date.UTC`) jako chwila UTC.
 *
 * Dwa podejścia, bo offset zależy od chwili, a chwili szukamy: pierwsze przybliżenie
 * bierze offset w południe UTC tego dnia (nigdy nie wypada w godzinie zmiany czasu),
 * drugie poprawia je offsetem policzonym już w okolicy właściwej północy.
 */
function localMidnight(zone: string, dayUtc: number): number {
  const rough = dayUtc - offsetAt(zone, dayUtc + DAY_MS / 2);
  return dayUtc - offsetAt(zone, rough);
}

/** `YYYY-MM-DD` z chwili, w strefie klubu. */
export function clubDate(zone: string, instant: number): string {
  const shifted = new Date(instant + offsetAt(zone, instant));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Doby kalendarza pokrywające okno `[from, to)`, w strefie klubu.
 *
 * Pierwsza doba zaczyna się PRZED albo dokładnie w `from` (rezerwacja z poranka wpada
 * na siatkę dnia, nawet gdy okno zaczyna się w południe), ostatnia kończy się po `to`.
 * Zakres jest ograniczony `maxDays`, bo to dane wchodzące z adresu - okno na dziesięć
 * lat byłoby prośbą o kilka tysięcy wierszy odpowiedzi.
 */
export function clubDays(zone: string, from: number, to: number, maxDays = 62): ClubDay[] {
  if (!(to > from)) return [];

  const firstDate = clubDate(zone, from);
  const out: ClubDay[] = [];
  let dayUtc = Date.parse(`${firstDate}T00:00:00Z`);

  while (out.length < maxDays) {
    const startsAt = localMidnight(zone, dayUtc);
    const nextUtc = dayUtc + DAY_MS;
    const endsAt = localMidnight(zone, nextUtc);
    out.push({ date: new Date(dayUtc).toISOString().slice(0, 10), startsAt, endsAt });
    if (endsAt >= to) break;
    dayUtc = nextUtc;
  }
  return out;
}

/**
 * Strefa, którą da się przekazać `Intl`. Wartość spoza katalogu IANA schodzi do strefy
 * domyślnej: kalendarz ma się narysować także klubowi, któremu ktoś wpisał literówkę
 * w konfiguracji - brak ustawienia nie może zablokować rezerwacji (ta sama zasada, co
 * przy braku lotniska macierzystego i przy braku normy zużycia).
 */
export const DEFAULT_CLUB_ZONE = 'Europe/Warsaw';

export function safeZone(zone: string | null | undefined): string {
  if (typeof zone !== 'string' || zone.trim() === '') return DEFAULT_CLUB_ZONE;
  try {
    formatterFor(zone);
    return zone;
  } catch {
    return DEFAULT_CLUB_ZONE;
  }
}

/** Minuty na milisekundy - dla wołających, którzy liczą długość slotu w minutach. */
export const minutes = (count: number): number => count * MINUTE_MS;
