/**
 * UZ Aero - formatowanie do wyświetlenia (warstwa UI).
 *
 * Domena trzyma liczby (ms, litry, godziny dziesiętne); tutaj zamieniamy je na napisy.
 * Czas pokazujemy w UTC - to domyślna strefa całej aplikacji (`CLAUDE.md`, sekcja
 * „Strefa czasowa"): czas nieoznaczony = UTC, LT tylko przy meldunku.
 */

import type { EpochMillis } from '@uzaero/domain';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Czas zdarzenia jako „HH:MM" UTC. */
export function timeUtc(t: EpochMillis | null): string {
  if (t == null) return '-';
  const d = new Date(t);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/**
 * Czas zdarzenia z SEKUNDAMI jako „HH:MM:SS" UTC - oś zdarzeń panelu (`A02a`).
 *
 * ISTNIEJE OBOK `timeUtc` I TO NIE JEST DUPLIKAT. Telefon i arkusz pokazują czasy
 * z dokładnością do minuty, bo tyle znaczy dla pilota i dla księgowości klubu.
 * Rejestr czyta się inaczej: różnica między `landing 08:14:09` a `landing 08:14:52`
 * rozstrzyga, KTÓRE zdarzenie unieważniła korekta, a rozjazd zegara mierzy się
 * w sekundach (`CLOCK_DRIFT`, próg 120 s). Obcięcie sekund w widoku rejestru
 * odbierałoby mu to, po co istnieje.
 */
export function timeUtcSeconds(t: EpochMillis | null): string {
  if (t == null) return '-';
  const d = new Date(t);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/**
 * Czas lokalny urządzenia jako „HH:MM" - WYŁĄCZNIE jako wartość drugorzędna przy
 * meldunku (`CLAUDE.md`: „LT tylko jako wartość drugorzędna"). Mockup pokazuje scenariusz
 * UTC+2; tutaj bierzemy prawdziwą strefę telefonu, bo to ona odpowiada na pytanie pilota
 * „która to u mnie godzina".
 */
export function timeLocal(t: EpochMillis | null): string {
  if (t == null) return '-';
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Miesiące dla TELEFONU - po polsku, w dopełniaczu („22 CZERWCA 2026").
 *
 * Aplikacja pilota mówi po polsku każdym napisem, więc angielska nazwa miesiąca
 * w plakietce dnia lotnego była jedynym obcym słowem na ekranie (zgłoszenie z urządzenia,
 * issue #12). Dopełniacz, a nie mianownik, bo tak czyta się datę po polsku: „22 czerwca",
 * nie „22 czerwiec".
 */
const MONTHS_PL = [
  'STYCZNIA',
  'LUTEGO',
  'MARCA',
  'KWIETNIA',
  'MAJA',
  'CZERWCA',
  'LIPCA',
  'SIERPNIA',
  'WRZEŚNIA',
  'PAŹDZIERNIKA',
  'LISTOPADA',
  'GRUDNIA',
];

/** Data dnia lotnego jako „22 CZERWCA 2026" (UTC) - badge z mockupu 02. */
export function dateUtcLong(t: EpochMillis): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS_PL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Miesiące w MIANOWNIKU - nagłówek kalendarza daty lotu (issue #58). Osobna tablica
 * obok dopełniaczowej `MONTHS_PL`, bo to inna rola gramatyczna: „22 czerwca" czyta się
 * jako datę, ale nagłówek miesiąca to nazwa własna („CZERWIEC 2026"), nie data.
 * Dopełniacz w nagłówku brzmiałby jak urwane zdanie.
 */
const MONTHS_PL_NOMINATIVE = [
  'STYCZEŃ',
  'LUTY',
  'MARZEC',
  'KWIECIEŃ',
  'MAJ',
  'CZERWIEC',
  'LIPIEC',
  'SIERPIEŃ',
  'WRZESIEŃ',
  'PAŹDZIERNIK',
  'LISTOPAD',
  'GRUDZIEŃ',
];

/** Nagłówek miesiąca kalendarza jako „SIERPIEŃ 2026" (UTC). */
export function monthYearUtc(t: EpochMillis): string {
  const d = new Date(t);
  return `${MONTHS_PL_NOMINATIVE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Data i godzina jako „23 CZE 16:45" (UTC) - stempel z ekranów telefonu: termin okna
 * korekty (10, 12), wiek migawki cudzej sesji (04b), stan cache przy odczytach.
 *
 * Data jest tu konieczna, a nie ozdobna: okno korekty zamyka się 24 h po zamknięciu dnia,
 * więc prawie zawsze wypada NASTĘPNEGO dnia - sama godzina wyglądałaby jak „za chwilę".
 *
 * Skrót miesiąca jest PREFIKSEM pełnej nazwy z `MONTHS_PL` (CZERWCA → CZE, PAŹDZIERNIKA
 * → PAŹ), więc jedna tablica obsługuje oba zapisy telefonu i nie ma jak się rozjechać.
 * Mieszka tu, a nie w `ui/screens/logic/statsDay.ts` (gdzie powstał), bo czyta go też
 * komponent wskaźnika łączności - dokładnie tą samą drogą, którą wcześniej przeszło `hhmm`.
 */
export function dateTimeUtcShort(t: EpochMillis): string {
  const d = new Date(t);
  const month = MONTHS_PL[d.getUTCMonth()]!.slice(0, 3);
  return `${d.getUTCDate()} ${month} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/**
 * Data jako „06 SIE" (UTC) - dzień i skrót miesiąca BEZ roku; podtytuł nagłówka śladu
 * (mockup 14: „Lot 3 · 06 SIE · SP-KLM"). Rok tam nie mieści się obok rejestracji,
 * a ślad ogląda się w kontekście dnia, który i tak jest na ekranie obok. Skrót jest
 * prefiksem pełnej nazwy z `MONTHS_PL` - ta sama zasada co w `dateTimeUtcShort`.
 */
export function dateUtcDayMonth(t: EpochMillis): string {
  const d = new Date(t);
  return `${pad2(d.getUTCDate())} ${MONTHS_PL[d.getUTCMonth()]!.slice(0, 3)}`;
}

/** Miesiące dla PANELU - trzyliterowe skróty lotnicze; powód rozdziału przy `dateUtcShort`. */
const MONTHS_SHORT = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/**
 * Data jako „31 JUL 2026" (UTC) - zapis GĘSTY, z mockupów panelu (`design/admin/`:
 * zegar w topbarze, kolumny dat w tabelach, stopki kart).
 *
 * ISTNIEJE OBOK `dateUtcLong` i to nie jest niedopatrzenie, tylko różnica powierzchni:
 * telefon pokazuje datę raz, w plakietce dnia, i stać go na pełną nazwę miesiąca;
 * panel powtarza ją w każdym wierszu tabeli, gdzie cztery znaki więcej to inna
 * szerokość kolumny.
 *
 * DWIE TABLICE MIESIĘCY, NIE JEDNA - to też jest decyzja, nie przeoczenie. Do issue #12
 * skrót był prefiksem pełnej nazwy (obie po angielsku) i jedna tablica obsługiwała oba
 * zapisy. Telefon mówi teraz do pilota po polsku, a panel został przy skrótach lotniczych,
 * bo w nich są napisane wszystkie 23 mockupy `design/admin/` i wszystkie kolumny jego tabel.
 * Zmiana zapisu w panelu to osobna decyzja produktowa - nie skutek uboczny polonizacji
 * plakietki na telefonie. (Polskie skróty złożyłyby się z dopełniacza równie dobrze:
 * CZERWCA → CZE.)
 */
export function dateUtcShort(t: EpochMillis): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Czas trwania jako „H:MM" (block time, duty). */
export function duration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(totalMin / 60)}:${pad2(totalMin % 60)}`;
}

/** Czas trwania jako „HH:MM:SS" - dla liczników odliczających na żywo. */
export function durationLong(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(totalSec / 3600), Math.floor((totalSec % 3600) / 60), totalSec % 60]
    .map(pad2)
    .join(':');
}

/**
 * Motogodziny wg formatu z konfiguracji samolotu (§5.4).
 * W danych zawsze trzymamy godziny dziesiętne; `hhmm` to wyłącznie prezentacja.
 */
export function motoHours(value: number | null, format: 'decimal' | 'hhmm' | null): string {
  if (value == null) return '-';
  if (format === 'hhmm') {
    const h = Math.floor(value);
    const m = Math.round((value - h) * 60);
    // Zaokrąglenie 59,6 min → 60 przesuwa godzinę, żeby nie wyszło „1234:60".
    return m === 60 ? `${h + 1}:00` : `${h}:${pad2(m)}`;
  }
  return value.toFixed(1);
}

/**
 * Odwrotność `motoHours` - wpis pilota na godziny dziesiętne.
 *
 * Przyjmujemy oba zapisy niezależnie od skonfigurowanego formatu, bo pilot przepisuje
 * to, co widzi na liczniku, a nie to, co ustawił administrator: „1234:30" i „1234,5"
 * mają znaczyć to samo. Przecinek jest równoprawny z kropką (klawiatura PL).
 * `null` = wpis nieczytelny; wołający ma wtedy zablokować zapis, a nie zgadywać.
 */
export function parseMotoHours(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned.length === 0) return null;

  const hhmm = /^(\d+):([0-5]?\d)$/.exec(cleaned);
  if (hhmm) return Number(hhmm[1]) + Number(hhmm[2]) / 60;

  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Wpis motogodzin w trakcie pisania → zapis kanoniczny dla formatu licznika.
 *
 * ══ DOWOLNY SEPARATOR ZNACZY „SEPARATOR" ══
 * Pilot przepisuje liczbę z tarczy i sięga po ten znak, który ma pod palcem: klawiatura
 * numeryczna Androida daje przecinek albo kropkę, a licznika hh:mm i tak nie da się na
 * niej wpisać, bo dwukropka na niej nie ma. Maska przyjmuje więc `.`, `,` i `:` jako
 * JEDNO i to samo - i zamienia na znak właściwy dla formatu (`:` przy hh:mm, `.` przy
 * godzinach dziesiętnych). Dzięki temu pole obsługuje się klawiaturą numeryczną
 * (`decimal-pad`), a nie pełną QWERTY, która zajmuje pół ekranu i podsuwa podpowiedzi
 * słownikowe (zgłoszenie z urządzenia, 2026-08-14).
 *
 * Separator jest DOKŁADNIE JEDEN - drugi i każdy następny znika, zamiast produkować
 * „1234:30:15". Wpis krótszy albo urwany („1234:") zostaje bez zmian: to normalny stan
 * w połowie pisania, a o tym, czy wartość ma sens, orzeka `parseMotoHours`.
 */
export function maskMotoHoursInput(text: string, format: 'decimal' | 'hhmm' | null): string {
  const separator = format === 'hhmm' ? ':' : '.';
  let out = '';
  let used = false;

  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      out += ch;
      continue;
    }
    // Pierwszy separator - jakikolwiek by nie był - staje się TYM separatorem.
    // Wiodący („,5") odrzucamy: liczba zaczyna się od części całkowitej.
    if ((ch === '.' || ch === ',' || ch === ':') && !used && out.length > 0) {
      out += separator;
      used = true;
    }
  }
  return out;
}

/** Wpis litrów → liczba. `null` gdy wpis nie jest liczbą (blokuje zapis). */
export function parseLitres(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Wpis godziny w trakcie pisania → „HH:MM". Dwukropek stawia maska, nie pilot.
 *
 * Powód: klawiatura numeryczna Androida nie ma dwukropka, a pełna QWERTY dla czterech
 * cyfr to zła zamiana - zajmuje pół ekranu i podstawia podpowiedzi słownikowe. Pilot
 * wbija „0800", maska pokazuje „08:00" (zgłoszenie z urządzenia: arkusz godziny meldunku).
 *
 * ══ KROPKA I PRZECINEK ZNACZĄ DWUKROPEK (issue #62 pkt 2) ══
 * Klawiatura numeryczna Androida dwukropka nie ma, ale kropkę albo przecinek - owszem,
 * i to w nie zawsze tym samym miejscu. Do issue #62 maska wycinała je razem z resztą
 * niecyfr, więc „8.30" zostawało jako „830" i wychodziło z maski jako **„83:0"**:
 * `parseTimeUtcOnDay` odrzucał to (83 > 23), a `Stepper` cicho zostawiał wartość sprzed
 * edycji. Pilot widział wtedy godzinę, której nie wpisał, i przyciski ±1 min przesuwające
 * nie tę liczbę, co trzeba - jedno zgłoszenie z urządzenia opisało oba objawy naraz.
 *
 * Reguła jest więc ta sama, co w `maskMotoHoursInput`: PIERWSZY separator - jakikolwiek
 * by nie był - kończy część godzinową i staje się dwukropkiem. Wiodący („:30") odrzucamy,
 * bo godzina zaczyna liczbę; jednocyfrową godzinę przed separatorem dopełniamy zerem,
 * skoro pilot sam powiedział, że już ją skończył.
 *
 * Liczą się wyłącznie cyfry i tylko cztery pierwsze - resztę ucinamy, zamiast pozwolić
 * na „08:0012". Wpis krótszy zostaje krótki („08:0"), bo to normalny stan w połowie
 * pisania; o tym, czy wartość ma sens, orzeka `parseTimeUtcOnDay`.
 */
export function maskTimeUtcInput(text: string): string {
  const separator = text.search(/[.,:]/);
  if (separator < 0) {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  const hours = text.slice(0, separator).replace(/\D/g, '').slice(0, 2);
  // Separator bez godziny przed nim nie ma czego zamykać - czekamy na cyfrę.
  if (hours.length === 0) return '';
  const minutes = text.slice(separator + 1).replace(/\D/g, '').slice(0, 2);
  return `${hours.padStart(2, '0')}:${minutes}`;
}

/**
 * „08:00" → znacznik czasu tego samego dnia UTC (`reference` daje dzień lotny).
 *
 * Pilot wpisuje godzinę, nie datę - meldunek i zakończenie duty należą do dnia, który
 * właśnie poprawia, więc datę bierzemy z wartości sprzed edycji, a nie z „teraz".
 * `null` = wpis nieczytelny; wołający ma wtedy zablokować zapis (§6 pkt 3: nigdy cichy błąd).
 */
export function parseTimeUtcOnDay(text: string, reference: EpochMillis): EpochMillis | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;

  const day = new Date(reference);
  return Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    hours,
    Number(match[2]),
  );
}

/**
 * Maska wpisu daty „16.08.2026" - kropki stawia maska, pilot pisze same cyfry.
 *
 * Ta sama umowa, co `maskTimeUtcInput` dla godziny: separator nie istnieje na
 * klawiaturze numerycznej, więc stawiamy go za pilota. Powstała dla arkusza daty
 * lotu wpisu ręcznego (15E, przebudowa 2026-08-16).
 */
export function maskDateUtcInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

/**
 * „16.08" albo „16.08.2026" → północ tej doby UTC. Rok jest OPCJONALNY (brak = rok
 * wartości odniesienia): przy wpisywaniu lotu sprzed paru dni rok się nie zmienia,
 * a osiem cyfr zamiast czterech to dwa razy dłuższe pisanie najczęstszej poprawki.
 *
 * `null` = wpis nieczytelny ALBO dzień nie istnieje w kalendarzu - przewinięcie
 * „31.04" na 1 maja byłoby cichą zmianą daty, czyli tym samym kłamstwem, przed
 * którym broni się `parseDateTimeUtc`.
 */
export function parseDateUtc(text: string, reference: EpochMillis): EpochMillis | null {
  const match = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/.exec(text.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] != null ? Number(match[3]) : new Date(reference).getUTCFullYear();

  const at = Date.UTC(year, month - 1, day);
  const back = new Date(at);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return null;
  }
  return at;
}

/**
 * Znacznik czasu jako „2026-07-30 13:01:33" - PEŁNA data i sekundy, w UTC.
 *
 * Zapis pola korekty administratora (`design/admin/A02b-korekta.html`). Istnieje obok
 * `timeUtcSeconds` i `dateUtcShort`, bo to nie jest ich złożenie: korekta przesuwa
 * zdarzenie w rejestrze, więc pole musi nieść DZIEŃ (poprawiany czas potrafi przeskoczyć
 * północ UTC) i musi być zapisem, który da się z powrotem odczytać maszynowo -
 * „30 JUL 2026 13:01:33" nie jest. Stąd ISO-podobne `YYYY-MM-DD`, a nie zapis lotniczy.
 *
 * Para z `parseDateTimeUtc`: co ta funkcja wypisze, tamta przyjmie.
 */
export function dateTimeUtc(t: EpochMillis): string {
  const d = new Date(t);
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return `${date} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/**
 * „2026-07-30 13:01:33" → znacznik czasu UTC. `null` = wpis nieczytelny.
 *
 * ══ PARSUJEMY RĘCZNIE, BO `new Date(napis)` PARSUJE LOKALNIE ══
 * `new Date('2026-07-30 13:01:33')` to w specyfikacji zapis niestandardowy, więc
 * przeglądarka rozumie go jako czas LOKALNY - w Warszawie latem wynik jest przesunięty
 * o dwie godziny i nic tego nie sygnalizuje. Byłaby to najgorsza możliwa awaria tego
 * pola: korekta czasu zdarzenia, która sama przesuwa czas o strefę, wygląda jak
 * poprawna i zapisuje kłamstwo do rejestru klubu. Dlatego rozbieramy napis regexem
 * i składamy `Date.UTC`.
 *
 * Sekundy są OPCJONALNE (brak = `:00`), bo przy przepisywaniu godziny z książki
 * samolotu sekund często po prostu nie ma. Dzień walidujemy przez porównanie z wynikiem
 * (`31 kwietnia` przewinąłby się na 1 maja i przeszedł bez tego kroku) - cicha zmiana
 * daty jest tu równie groźna jak cicha zmiana strefy.
 */
export function parseDateTimeUtc(text: string): EpochMillis | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(text.trim());
  if (!match) return null;

  const [year, month, day, hours, minutes] = [1, 2, 3, 4, 5].map((i) => Number(match[i]));
  const seconds = match[6] == null ? 0 : Number(match[6]);
  if (hours! > 23) return null;

  const at = Date.UTC(year!, month! - 1, day!, hours!, minutes!, seconds);
  // Przewinięcie kalendarza (`2026-02-30` → 2 marca) jest tu błędem, nie uprzejmością.
  const back = new Date(at);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month! - 1 || back.getUTCDate() !== day) {
    return null;
  }
  return at;
}

/**
 * „Tomasz Małkiewicz" → „T. Małkiewicz".
 *
 * Skrót imienia z podsumowań (mockup 03): w dwukolumnowej siatce pełne imię i nazwisko
 * łamie kolumnę, a nazwisko wystarcza do rozpoznania. Jednoczłonowe zostawiamy w całości.
 */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  return `${parts[0]![0]!.toUpperCase()}. ${parts.slice(1).join(' ')}`;
}

/** Paliwo w litrach - bez miejsc po przecinku, bo paliwomierz i tak nie jest precyzyjny. */
export function litres(value: number | null): string {
  return value == null ? '-' : `${Math.round(value)} L`;
}

/**
 * „21 CZERWCA 09:15" - datownik osi czasu przekazania (mockup 02a): dzień i miesiąc
 * bez roku + godzina. Czas nieoznaczony = UTC. Do issue #60 przepis żył jako prywatny
 * `stamp()` ekranu liczników; sekcja oleju potrzebuje go w logice, a dwie kopie tego
 * samego formatu to dokładnie problem, przeciw któremu ten pakiet istnieje.
 */
export function stampUtc(epochMs: number): string {
  return `${dateUtcLong(epochMs).replace(/ \d{4}$/, '')} ${timeUtc(epochMs)}`;
}

/**
 * Olej w litrach - JEDNO miejsce po przecinku (issue #60). Bagnet czyta się
 * z dokładnością ćwierci litra, więc zaokrąglenie do pełnych litrów (jak `litres`)
 * zjadałoby całą treść pomiaru: 10,2 i 10,6 L to dwa różne stany, „10 L" i „11 L" -
 * fikcja precyzji w złą stronę. Przecinek po polsku, jak w mockupach; parsery litrów
 * przyjmują go od zawsze.
 */
export function oilLitres(value: number | null): string {
  if (value == null) return '-';
  return `${(Math.round(value * 10) / 10).toFixed(1).replace('.', ',')} L`;
}

/**
 * „3 500" - tysiące rozdzielone spacją (mockup 05: Altitude w FT).
 * Ujemne dostają minus typograficzny „−" jak pozostałe odczyty; GPS potrafi
 * oddać wysokość pod poziomem morza.
 */
export function thousands(value: number): string {
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return rounded < 0 ? `−${digits}` : digits;
}

/**
 * Polska liczba mnoga: 1 → `one`, 2–4 (poza 12–14) → `few`, reszta → `many`.
 * Mieszka tu (nie w helperze jednego ekranu), bo odmieniają: ekran 11, 12, zamek 00,
 * ustawienia 13 i komponenty DS (`OutboxGuard`).
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** „1 zdarzenie" / „3 zdarzenia" / „12 zdarzeń". */
export function eventsCount(n: number): string {
  return `${n} ${plural(n, 'zdarzenie', 'zdarzenia', 'zdarzeń')}`;
}

/**
 * „1 lądowanie" / „2 lądowania" / „5 lądowań" (uwaga z urządzenia, 2026-08-29 - kręgi
 * we wpisie ręcznym). Mieszka tu, nie w helperze ekranu, bo tę samą liczbę odmienia
 * arkusz lotu (podpis „razem N w tym locie") i oś sesji (nazwa wiersza lądowania),
 * a dwie odmiany tego samego rzeczownika rozjechałyby się przy pierwszej poprawce.
 */
export function landingsCount(n: number): string {
  return `${n} ${plural(n, 'lądowanie', 'lądowania', 'lądowań')}`;
}

/**
 * WIEK jako wartość względna: „3 dni 3 h", „6 h 41 min", „26 min".
 *
 * Reguła świeżości panelu (`design/admin/SZABLON.html`, sekcja `.fresh`): *„Wiek
 * podajemy względnie, nie znacznikiem czasu: administrator ocenia, czy dane są
 * aktualne, a nie o której dotarły"*. Skrzynka flag (`A03`) ma z tego całą kolumnę,
 * bo flaga leżąca trzeci dzień jest innym problemem niż ta sprzed godziny.
 *
 * Dwa człony, nigdy trzy - „3 dni 3 h 12 min" jest dokładniejsze i nieczytelne,
 * a przy ocenie „czy to pilne" minuty przy dniach nie znaczą nic. Człon drugi znika,
 * gdy jest zerem („2 dni", nie „2 dni 0 h"), dokładnie jak w mockupach.
 *
 * Argumentem jest CZAS TRWANIA w ms, a nie znacznik: chwila odniesienia („teraz",
 * `resolved_at`) jest decyzją wołającego i tylko on wie, którą wybrać.
 */
export function relativeAge(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const minutes = totalMin % 60;

  if (days > 0) {
    const head = `${days} ${plural(days, 'dzień', 'dni', 'dni')}`;
    return hours === 0 ? head : `${head} ${hours} h`;
  }
  if (hours > 0) return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

/**
 * Pozycja jako „50°04.7'N 019°47.1'E" - stopnie i minuty dziesiętne (mockup 13).
 *
 * Format lotniczy, nie geodezyjny: mapy lotnicze i GPS-y pokładowe używają właśnie
 * DDM (stopnie + minuty z dziesiętną), więc pilot porówna wartość wzrokiem 1:1.
 */
export function formatLatLon(lat: number, lon: number): string {
  const part = (value: number, positive: string, negative: string, degWidth: number): string => {
    const hemi = value >= 0 ? positive : negative;
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const min = (abs - deg) * 60;
    return `${String(deg).padStart(degWidth, '0')}°${min.toFixed(1).padStart(4, '0')}'${hemi}`;
  };
  return `${part(lat, 'N', 'S', 2)} ${part(lon, 'E', 'W', 3)}`;
}

/**
 * Czas trwania jako „HH:MM" Z WIODĄCYM ZEREM - format czasów z mockupu 10 (statystyki)
 * i kart arkusza (§4.7).
 *
 * ISTNIEJE OBOK `duration`, KTÓRA DAJE „H:MM" BEZ ZERA, I TO NIE JEST NIEDOPATRZENIE.
 * Każda z nich jest wierna innemu zatwierdzonemu mockupowi: kokpit, koniec dnia
 * i historia pokazują `6:39`, a ekran statystyk i wyeksportowana karta `06:39`.
 * Scalenie ich „w ramach porządków" zepsułoby jeden z dwóch - dlatego obie mają
 * własną nazwę i własny komentarz, zamiast jednej funkcji z flagą, którą ktoś
 * kiedyś ustawi odwrotnie.
 */
export function hhmm(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return `${pad2(Math.floor(totalMin / 60))}:${pad2(totalMin % 60)}`;
}
