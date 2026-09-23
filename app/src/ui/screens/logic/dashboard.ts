/**
 * Ninerdeck - model ekranu PULPIT (20, rezerwacje 3.0.0: issue #145, epik R-E).
 *
 * Ekran startowy przestał być logiem dnia. Odpowiada na DWA pytania: „jak mi dziś
 * poszło" (sumy doby) i „co mam przed sobą" (najbliższa rezerwacja) - przebieg
 * pojedynczej operacji jest pytaniem trzecim, zadawanym rzadziej, i ma własną zakładkę.
 *
 * ══ PULPIT NIE MA LISTY OPERACJI ══
 * (decyzja właściciela 2026-09-19, `docs/rezerwacje.md` §9.1). Zamiast kafelków stoi
 * JEDNA karta z sumami - i jest WEJŚCIEM do Historii, bo kafelek operacji był jedynymi
 * drzwiami do korekty dzisiejszego lotu w oknie 24 h (issue #23, #43). Skoro znika
 * z ekranu startowego, drzwi przejmuje zakładka Historia - dlatego obejmuje ona odtąd
 * także dzisiejsze operacje, wbrew issue #35.
 *
 * ══ PULPIT NIE POWTARZA KALENDARZA ══
 * Paska zajętości floty tu NIE MA: odpowiadał na pytanie, które ma własną zakładkę
 * widoczną przez cały czas. Ekran startowy niesie wyłącznie to, czego nie ma nigdzie
 * indziej.
 */

import { duration, plural } from '@ninerdeck/format';

import type { MyDayVm } from './myDay';

/** Nagłówek karty „Mój dzień" - ile operacji i czym; `null` przy dobie bez lotów. */
export function daySubtitle(vm: MyDayVm): string | null {
  if (vm.empty) return null;

  const maszyny = [...new Set(vm.sessions.map((s) => s.aircraft))];
  const ile = vm.sessions.length;
  const czym = maszyny.join(', ');
  // Podpis mówi ILE i CZYM - bez tego suma „Blok 1:38" nie zdradza, że dzień miał dwie
  // maszyny, a to jest pierwsza rzecz, o którą pilot pyta patrząc na własną sumę.
  return `${ile} ${plural(ile, 'operacja', 'operacje', 'operacji')} · ${czym}`;
}

/**
 * Najbliższa rezerwacja pilota - kształt karty na Pulpicie.
 *
 * Źródło danych przychodzi w epiku R-F (cache kalendarza, #162 F1/F2); do tego czasu
 * ekran dostaje `null` i karty nie ma WCALE - dokładnie jak w wariancie `20a`. To nie
 * jest zaślepka: „brak rezerwacji" jako pusta karta byłby zdaniem o niczym, a o tym,
 * że nic nie stoi w planie, mówi już jej brak.
 */
export interface NextBooking {
  id: string;
  /** Chwila rozpoczęcia (UTC, ms) - odliczanie liczy się od niej. */
  startsAt: number;
  endsAt: number;
  /** Godziny w STREFIE KLUBU, gotowe do wyświetlenia („09:00 → 11:00", §6). */
  clock: string;
  aircraft: string;
  /** Rodzaj operacji po polsku („Przelot"); `null` = pilot go nie podał. */
  operation: string | null;
  /** Trasa („EPKK → EPRJ"); `null` = bez trasy. */
  route: string | null;
  /** Kod drugiego pilota; `null` = lot bez Duala. */
  dualCode: string | null;
  /**
   * Czeka na zgodę (3.1.0, makieta 20E): karta traci zieleń, bo zielona obiecywałaby,
   * że lot jest pewny. Odliczanie zostaje - termin zbliża się niezależnie od decyzji.
   */
  pending: boolean;
}

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
/**
 * Dokąd sięga odliczanie. Powyżej dwunastu godzin „ZA 18 H 20 MIN" jest liczbą, której
 * nikt nie czyta jako czasu - rezerwacja jest wtedy jutrzejsza i mówi o sobie godziną.
 */
const COUNTDOWN_LIMIT_MS = 12 * HOUR_MS;

/**
 * Plakietka odliczania na karcie rezerwacji: „ZA 1 H 15 MIN".
 *
 * Termin, który już się zaczął, NIE odlicza wstecz - mówi „TERAZ". Rezerwacja
 * zaczynająca się kwadrans temu jest normalna (pilot bierze maszynę i wpisuje, do
 * której godziny), więc minus na karcie opisywałby stan zwyczajny jako spóźnienie.
 */
export function bookingLead(startsAt: number, now: number): string {
  const za = startsAt - now;
  if (za <= 0) return 'TERAZ';
  if (za >= COUNTDOWN_LIMIT_MS) return 'JUTRO';

  const minuty = Math.floor(za / MIN_MS);
  if (minuty < 60) return `ZA ${Math.max(1, minuty)} MIN`;

  const godziny = Math.floor(minuty / 60);
  const reszta = minuty % 60;
  return reszta === 0 ? `ZA ${godziny} H` : `ZA ${godziny} H ${reszta} MIN`;
}

/**
 * Podpis pod „ROZPOCZNIJ LOT" - czym wypełni się krok 1 przejęcia.
 *
 * Karta rezerwacji NIE MA własnego przycisku startu (issue #42: jeden start, jedno
 * miejsce, jeden wygląd przez cały dzień), więc to ten podpis jest jedynym miejscem,
 * w którym widać, że przycisk weźmie rezerwację. Bez rezerwacji podpisu nie ma.
 */
export function startHint(booking: NextBooking | null): string | undefined {
  if (booking == null) return undefined;
  const godzina = booking.clock.split('→')[0]?.trim() ?? '';
  return `Wypełni się rezerwacją ${godzina} · ${booking.aircraft}`;
}

/** Długość terminu („2 h", „1:30") - do wiersza szczegółów karty. */
export const bookingLength = (booking: NextBooking): string =>
  duration(booking.endsAt - booking.startsAt);
