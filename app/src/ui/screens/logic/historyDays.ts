/**
 * UZ Aero — sesje z lokalnego strumienia → treść ekranu 12 (mockup `design/12-historia.html`).
 *
 * Ten sam podział co `statsDay.ts`/`syncStatus.ts`: logika prezentacji w czystych
 * funkcjach, testowalnych bez React Native.
 *
 * CO EKRAN POKAZUJE (issue #35, 2026-08-12): sesje z dni WCZEŚNIEJSZYCH. Dzisiejsze
 * stoją na „Mój dzień" (01), na takich samych kafelkach (issue #42, `sessionCard.ts`) —
 * powtórzone tutaj były drugą listą tych samych lotów, a ekran nazywa się
 * „Poprzednie dni". Doba liczy się
 * tak samo jak na 01: po URUCHOMIENIU silnika (`projectPilotDay`), więc sesja
 * rozpoczęta o 23:50 należy w całości do doby, w której wystartowała.
 *
 * Trzymany samolot też nie jest historią, tylko teraźniejszością — po restarcie
 * wznowienie prowadzi prosto do kokpitu (`navigation/resumeTarget.ts`).
 *
 * Podział na grupy robi okno korekty (decyzja 2026-07-23): w oknie → „Możesz jeszcze
 * poprawić" (karta prowadzi do korekty), po oknie → „Zamknięte" (karta prowadzi do
 * PODGLĄDU — ten sam ekran 10 bez elementów zapisu, mockup `10b`). Do issue #35 sesja
 * po oknie nie miała żadnego wejścia: pilot widział cztery liczby i nie mógł sprawdzić,
 * co właściwie zapisał.
 */

import { correctionWindow, utcDayStart, type SessionState } from '../../../domain';
import type { HistoryDay } from '../../../application';
import { dateUtcLong } from '../../format';
import { type SessionCardVm, sessionStats, sessionTimes } from './sessionCard';
import { dateTimeUtcShort } from './statsDay';

/**
 * Stan wysyłki sesji — plakietka istnieje WYŁĄCZNIE wtedy, gdy coś czeka w kolejce.
 *
 * „Wysłane" zostało usunięte (issue #35 pkt 3): to stan domyślny, a plakietka świecąca
 * przy 99% kart uczy oko ignorować stopkę — dokładnie ta sama reguła, dla której
 * SyncChip online nie rysuje nic (issue #12).
 */
export interface UploadSpec {
  /** „Oczekuje na przesłanie · 8" / „W trakcie wysyłania · 8". */
  label: string;
  /** `queued` = kolejka czeka na okazję, `sending` = pętla synca właśnie pracuje. */
  state: 'queued' | 'sending';
}

/**
 * Karta sesji (mockup `.day-card`) — kształt wspólny z „Mój dzień" (`sessionCard.ts`,
 * issue #42), poszerzony o to, co istnieje wyłącznie w historii: stan wysyłki.
 *
 * Nagłówkiem kafelka jest tutaj DATA, bo lista biegnie przez wiele dni; na 01 w tym
 * samym miejscu stoi numer sesji w dobie.
 */
export interface DayCardSpec extends SessionCardVm {
  /** Zaległość wysyłki albo `null` = wszystko poszło (nie rysujemy nic). */
  upload: UploadSpec | null;
}

/** Karta sesji w oknie korekty — dodatkowo termin i odliczanie. */
export interface EditableDaySpec extends DayCardSpec {
  /** „Korekta do 23 CZE 16:45". */
  deadline: string;
  /** „zostało 23 h 04 min". */
  remaining: string;
}

export interface HistoryGroups {
  editable: EditableDaySpec[];
  closed: DayCardSpec[];
}

/** „zostało 23 h 04 min" / „zostało 42 min" — zero wiodące minut jak w mockupie. */
export function remainingLabel(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return h > 0 ? `zostało ${h} h ${String(min).padStart(2, '0')} min` : `zostało ${min} min`;
}

/**
 * Doba UTC, do której należy sesja — kotwicą jest URUCHOMIENIE silnika, a dopiero
 * w jego braku przejęcie maszyny.
 *
 * Reguła jest przepisana z `projectPilotDay` celowo: to ona decyduje, co stoi na 01,
 * a ekran 12 pokazuje „wszystko poza dniem dzisiejszym". Dwie różne kotwice zrobiłyby
 * przy sesji spod północy dziurę (sesja zniknęłaby z obu list) albo duplikat.
 * Sesja bez biegu silnika (zdanie bez lotu, 09C) na 01 nie ma wiersza — tutaj ma kartę,
 * bo maszyna była zajęta i jest to fakt do obejrzenia.
 */
export function sessionDay(state: SessionState): number | null {
  const anchor = state.legs[0]?.startedAt ?? state.claimedAt;
  return anchor != null ? utcDayStart(anchor) : null;
}

/**
 * Plakietka wysyłki sesji. `null` = nic nie czeka, czyli stan domyślny — bez napisu.
 *
 * @param pushing czy ostatni przebieg synca dosięgnął serwera. Aplikacja nie zna stanu
 *                „online" inaczej niż po wyniku ostatniej próby (§4.3), więc to jedyna
 *                uczciwa podstawa rozróżnienia „czeka na sieć" od „już leci".
 */
export function uploadSpec(pendingCount: number, pushing: boolean): UploadSpec | null {
  if (pendingCount <= 0) return null;
  return pushing
    ? { label: `W trakcie wysyłania · ${pendingCount}`, state: 'sending' }
    : { label: `Oczekuje na przesłanie · ${pendingCount}`, state: 'queued' };
}

function cardSpec(day: HistoryDay, pushing: boolean): DayCardSpec {
  const { state, pendingCount } = day;
  const leg = state.legs[0];
  return {
    sessionUuid: state.sessionUuid ?? '',
    title: state.claimedAt != null ? dateUtcLong(state.claimedAt) : '—',
    aircraft: state.aircraftId ?? '—',
    // Godziny biegu silnika: bez nich dwie sesje tej samej doby na tej samej maszynie
    // są nie do odróżnienia.
    times: sessionTimes(leg?.startedAt ?? null, leg?.stoppedAt ?? null),
    // Loty / Blok / Lot — dokładnie to, co niesie kafelek sesji na „Mój dzień"
    // (issue #35 pkt 6; od issue #42 z tej samej funkcji). „Sesja" (czas trzymania
    // maszyny) i „Skoczków" wypadły: pierwsza była wielkością, o którą nikt nie pytał,
    // druga mieszka w szczegółach lotu, do których ta karta prowadzi.
    stats: sessionStats(state.flights.length, state.blockTimeMs, state.flightTimeMs),
    upload: uploadSpec(pendingCount, pushing),
  };
}

/**
 * Podział zamkniętych sesji na grupy ekranu 12.
 *
 * Odpadają: sesje dnia dzisiejszego (są na 01), sesje trzymane (mają kokpit) i strumienie
 * bez claimu (śmieciowe) — patrz docblock modułu.
 *
 * @param now      teraz (epoch ms) — wyznacza dobę dzisiejszą i stan okien korekty,
 * @param pushing  czy sync dosięga serwera (etykieta plakietki wysyłki).
 */
export function buildHistory(days: HistoryDay[], now: number, pushing = false): HistoryGroups {
  const groups: HistoryGroups = { editable: [], closed: [] };
  const today = utcDayStart(now);

  for (const day of days) {
    // Warunkiem jest ZDANIE samolotu (`closed`), nie klamra służby. Do 2026-08-07 stało
    // tu `dutyEnd == null` i po §3.6a znaczyło coś zupełnie innego, niż miało: ekran
    // „Zdaj samolot" `dutyEnd` NIE WYSYŁA, więc poprawnie zdana sesja wypadała z historii
    // W CAŁOŚCI — a to jedyny ekran, z którego pilot dosięga okna korekty.
    if (day.state.sessionUuid == null || !day.state.closed) continue;
    if (sessionDay(day.state) === today) continue;

    const window = correctionWindow(day.state, now);
    if (window.open && window.closesAt != null) {
      groups.editable.push({
        ...cardSpec(day, pushing),
        deadline: `Korekta do ${dateTimeUtcShort(window.closesAt)}`,
        remaining: remainingLabel(window.closesAt - now),
      });
    } else {
      groups.closed.push(cardSpec(day, pushing));
    }
  }
  return groups;
}

/**
 * Plakietka na przycisku „Poprzednie dni" ekranu 01 (`.history-badge`):
 * najświeższa sesja W OKNIE KOREKTY spoza dnia dzisiejszego → „11 SIE — można poprawić";
 * brak → null.
 *
 * Dzień dzisiejszy jest pominięty z tego samego powodu, dla którego nie ma go na liście
 * (issue #35 pkt 1): plakietka obiecuje coś, co pilot znajdzie po wejściu. Sesję z dziś
 * poprawia się kafelkiem tuż obok, na tym samym ekranie.
 */
export function editableBadge(days: HistoryDay[], now: number): string | null {
  const today = utcDayStart(now);
  for (const day of days) {
    // Warunkiem jest OTWARTE OKNO, nie obecność klamry służby. Po §3.6a okno kotwiczy się
    // w ZDANIU samolotu, więc `correctionWindow` odpowiada samo — a wymóg `dutyEnd`/`dutyStart`
    // wyciszał plakietkę na każdej sesji bez deklaracji, czyli na prawie każdej.
    if (day.state.claimedAt == null) continue;
    if (!day.state.closed) continue;
    if (sessionDay(day.state) === today) continue;
    if (correctionWindow(day.state, now).open) {
      // `dateTimeUtcShort` daje „22 CZE 16:45" — plakietka bierze samą datę.
      const label = dateTimeUtcShort(day.state.claimedAt).split(' ').slice(0, 2).join(' ');
      return `${label} — można poprawić`;
    }
  }
  return null;
}
