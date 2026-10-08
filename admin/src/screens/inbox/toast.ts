/**
 * Ninerdeck - panel: BANER NOWEGO POWIADOMIENIA (4.0.0, K7 `docs/kanal-klubu.md` §3.4;
 * makieta `design/panel/powiadomienia.html` PW1).
 *
 * Powiadomienie przyszło kanałem klubu, gdy panel jest otwarty: w lewym dolnym rogu treści
 * staje baner z TYM SAMYM zdaniem, co wiersz skrzynki - bez plakietki sprawy (sprawa stoi
 * w skrzynce, dopóki nie zapadnie) i z „teraz" zamiast godziny. Znika sam, bez dźwięku;
 * kursor albo fokus na banerze wstrzymuje odliczanie, „×" nie ma. Kilka naraz: widać
 * ostatni, licznik przy dzwonku mówi resztę.
 *
 * Nie stoi przy otwartej skrzynce (wiadomość wjeżdża tam na górę listy) ani na ekranie,
 * którego dotyczy - ten odświeża się sam tematem kanału.
 *
 * Czysty moduł: decyzje banera i jego odliczanie, sprawdzalne testem bez przeglądarki.
 * Komponent tylko je woła.
 */

import type { InboxItemDto } from '../../api/dto';
import { inboxRows, type InboxRowsInput, type InboxRowVm } from './inboxRows';

/** Ile baner stoi bez kursora - tyle, co baner w aplikacji (K5). */
export const TOAST_MS = 5_000;

/** Słownik, strefa i wstęp sesji - to, z czego zdanie banera składa się tak, jak wiersz skrzynki. */
export type ToastContext = Pick<InboxRowsInput, 'timezone' | 'now' | 'nameOf' | 'regOf' | 'mhFormatOf' | 'canOpen'>;

/**
 * Wiersz banera albo `null`, gdy wiadomość jest już przeczytana (otwarta skrzynka zdążyła
 * ją przeczytać). Prośba o zgodę, która właśnie przyszła, czeka na TWOJĄ decyzję
 * z definicji - serwer wysyła ją osobom kroku bieżącego - więc prowadzi do kolejki
 * decyzji, zanim kolejka w pamięci zdąży się odświeżyć.
 */
export function toastRow(item: InboxItemDto, context: ToastContext): InboxRowVm | null {
  if (item.readAt != null) return null;
  const bookingId = typeof item.payload.bookingId === 'string' ? item.payload.bookingId : null;
  const [row] = inboxRows({
    ...context,
    items: [item],
    todoIds: new Set(item.kind === 'approval_requested' && bookingId != null ? [bookingId] : []),
    freshIds: new Set(),
  });
  return row == null ? null : { ...row, pill: null, when: 'teraz', isNew: false };
}

/**
 * Czy baner stoi: przy zamkniętej skrzynce i poza ekranem, którego dotyczy (sam adres
 * rzeczy albo adres pod nim - szuflada z zakładką to wciąż ta rzecz). Porównuje się SAMĄ
 * ŚCIEŻKĘ: adres zlecenia niesie połowę listy w parametrach (`?widok=do-mnie`), a szuflada
 * tego zlecenia otwarta nad drugą połową to wciąż ta sama rzecz.
 */
export function toastShows(href: string | null, state: { inboxOpen: boolean; path: string }): boolean {
  if (state.inboxOpen) return false;
  if (href == null) return true;
  const thing = href.split('?')[0]!;
  return state.path !== thing && !state.path.startsWith(`${thing}/`);
}

/**
 * Odliczanie banera. Trzyma je kursor ALBO fokus (klawiatura też ma prawo przeczytać
 * baner do końca) i rusza dopiero, gdy puszczą oba - od tego, co zostało, nie od nowa.
 */
export interface Countdown {
  /** Ile zostało w chwili `since`. */
  left: number;
  /** Od kiedy biegnie; `null` = wstrzymane. */
  since: number | null;
  hover: boolean;
  focus: boolean;
}

export const startCountdown = (now: number): Countdown => ({ left: TOAST_MS, since: now, hover: false, focus: false });

export function hold(countdown: Countdown, what: 'hover' | 'focus', on: boolean, now: number): Countdown {
  const next = { ...countdown, [what]: on };
  const held = next.hover || next.focus;
  if (held && countdown.since != null) {
    return { ...next, left: Math.max(0, countdown.left - (now - countdown.since)), since: null };
  }
  if (!held && countdown.since == null) return { ...next, since: now };
  return next;
}

/** Za ile baner zniknie, licząc od `now`; `null` = odliczanie wstrzymane. */
export const dueIn = (countdown: Countdown, now: number): number | null =>
  countdown.since == null ? null : Math.max(0, countdown.left - (now - countdown.since));
