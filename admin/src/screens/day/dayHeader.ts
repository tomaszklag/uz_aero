/**
 * UZ Aero — panel: NAGŁÓWEK KARTY DNIA, banery stanu i brama korekty (moduł CZYSTY).
 *
 * Trzy decyzje o treści, których nie da się podjąć w komórce ani w JSX-ie: jak nazwać
 * ten dzień, co powiedzieć nad nim (dzień trwa czy jest zamknięty) i czy wolno wejść
 * w korektę — a jeśli nie, to DLACZEGO.
 */

import type { SessionState } from '@uzaero/domain';
import { dateUtcShort, relativeAge } from '@uzaero/format';

import type { Capability, SessionListItemDto } from '../../api/dto';
import { can, denialReason } from '../../auth/can';
import { OPERATION_META } from '../days/operations';
import { utcStamp } from './daySummary';

export interface DayHeader {
  /** „30 JUL 2026 · SP-KLM" — data dnia i rejestracja, jak w mockupie. */
  title: string;
  /** Linie podtytułu: samolot, załoga, operacja, trasa. Każda jako gotowy napis. */
  lines: string[];
}

/**
 * Tytuł bierze datę z MELDUNKU, bo to on wyznacza dzień lotny — i tak samo działa
 * filtr zakresu na liście. Sesja bez `preflight_confirm` nie ma daty i panel to mówi,
 * zamiast podstawiać datę pierwszego zdarzenia albo „dzisiaj".
 */
export function dayHeader(session: SessionListItemDto, state: SessionState): DayHeader {
  const reg = session.reg ?? session.aircraftId;
  const title =
    session.dutyStart == null
      ? `DZIEŃ BEZ MELDUNKU · ${reg}`
      : `${dateUtcShort(session.dutyStart)} · ${reg}`;

  const crew = [
    `PIC ${session.picName ?? session.picId}${session.picCode == null ? '' : ` (${session.picCode})`}`,
  ];
  if (session.dualId != null) {
    crew.push(`dual ${session.dualName ?? session.dualId}${session.dualCode == null ? '' : ` (${session.dualCode})`}`);
  }

  const lines = [
    [session.aircraftType, ...crew].filter((part) => part != null).join(' · '),
  ];

  const operation =
    session.operation == null ? null : OPERATION_META[session.operation].label.toLowerCase();
  const route =
    state.departureIcao == null && state.arrivalIcao == null
      ? null
      : `${state.departureIcao ?? '?'} → ${state.arrivalIcao ?? '?'}`;
  const second = [
    operation == null ? null : `operacja ${operation}`,
    session.client == null ? null : `klient ${session.client}`,
    route,
  ].filter((part) => part != null);
  if (second.length > 0) lines.push(second.join(' · '));

  return { title, lines };
}

export interface DayBanner {
  tone: 'status' | 'warn';
  title: string;
  body: string;
}

/**
 * Baner nad kartą — jedno zdanie o tym, czy patrzymy na stan KOŃCOWY, czy na migawkę.
 *
 * Dzień otwarty jest tu ważniejszy niż dzień zamknięty i dlatego dostaje pełny opis:
 * wszystkie liczby poniżej są stanem na ostatnią przyjętą paczkę, a kolumny „koniec"
 * po prostu nie istnieją. Panel niczego nie domyśla — i to jest CAŁA treść tego stanu.
 *
 * Czego ten baner NIE ROBI: nie odlicza okna korekty pilota. Próg doby jest wartością
 * domeny (`packages/domain/src/rules/tolerances.ts`), a panelowi wolno importować
 * z domeny wyłącznie typy — kopia progu tutaj byłaby liczbą, która rozjedzie się po
 * cichu z regułą, którą serwer naprawdę egzekwuje przy zapisie.
 */
export function dayBanner(
  session: SessionListItemDto,
  state: SessionState,
  nowMs: number,
): DayBanner {
  if (!state.closed) {
    const at = Date.parse(session.updatedAt);
    const last = Number.isNaN(at)
      ? 'czas ostatniej paczki nieznany'
      : `ostatnia paczka dotarła ${utcStamp(at)} UTC (${relativeAge(nowMs - at)} temu)`;
    return {
      tone: 'status',
      title: 'Dzień otwarty — telefon dosyła zdarzenia.',
      body:
        `Sesja nie ma jeszcze \`day_close\`; ${last}. Liczby poniżej są stanem na ostatni sync, ` +
        'nie stanem końcowym — dojdą kolejne loty, tankowania i odczyt końcowy. Odczyty „koniec" ' +
        '(MH, FOB, duty) wypełni dopiero zamknięcie dnia; do tego czasu panel pokazuje „—" ' +
        'zamiast zgadywać, a karta arkusza w ogóle nie powstaje.',
    };
  }

  const closed = state.closedAt == null ? '—' : `${utcStamp(state.closedAt)} UTC`;
  const age = state.closedAt == null ? null : relativeAge(nowMs - state.closedAt);
  return {
    tone: 'warn',
    title: `Dzień zamknięty ${closed}${age == null ? '' : ` (${age} temu)`}.`,
    body:
      'Przez dobę od zamknięcia poprawia sam pilot, na ekranie 04C aplikacji. Potem zmianę ' +
      'dopisuje wyłącznie administrator — nowym zdarzeniem `event_correction`, bo rejestr jest ' +
      'append-only i nic się w nim nie nadpisuje. Panel nie odlicza tego okna za Ciebie: ' +
      'o tym, czy korekta jest jeszcze możliwa, rozstrzyga serwer w chwili zapisu.',
  };
}

export interface CorrectionAccess {
  label: string;
  /** `true` = wolno wejść w korektę któregokolwiek zdarzenia tego dnia. */
  allowed: boolean;
  /** Powód niedostępności — WIDOCZNY tekst, nigdy ciche ukrycie. `null` gdy wolno. */
  reason: string | null;
}

/**
 * Brama przejścia do korekty administracyjnej — informacja, NIE link.
 *
 * ══ DLACZEGO BEZ ADRESU ══
 * Korekta zawsze dotyczy KONKRETNEGO zdarzenia (`/dni/<sesja>/korekta/<zdarzenie>`),
 * a wyboru zdarzenia dokonuje się na osi dnia — oś JEST tym wyborem i drugiego ekranu
 * do wybierania nie budujemy. Ta funkcja odpowiada więc na pytanie „czy w ogóle wolno",
 * a odpowiedź steruje wierszami osi: dostępna korekta dokłada im przejście, niedostępna
 * zostawia widoczny powód nad nimi. Wcześniej zwracała adres `/dni/<sesja>/korekta`,
 * który nie znał celu i prowadził w ekran „w budowie".
 *
 * Dwa warunki, oba egzekwowane też przez serwer, więc to jest podpowiedź dla UI,
 * a nie zabezpieczenie:
 *
 *  1. **Zdolność `events.correct` ma TYLKO administrator** — szef wyszkolenia czyta
 *     dni i zamyka flagi, ale nie dopisuje zdarzeń do cudzego rejestru. Powód zostaje
 *     dla niego WIDOCZNY: ukrycie zmusiłoby go do zgadywania, czy funkcji nie ma
 *     w produkcie, czy nie ma jej on.
 *  2. **Dzień musi być zamknięty.** Przy otwartym pilot ma pełne prawo zapisu
 *     i poprawia sam, a korekta administratora nie wraca na telefon (sync jest
 *     jednokierunkowy) — więc wejście w otwarty dzień rozjechałoby dwa żywe obrazy
 *     tej samej sesji. Serwer odmawia tego wprost (`day_open`).
 */
export function correctionAccess(
  state: SessionState,
  capabilities: readonly Capability[] | undefined,
): CorrectionAccess {
  if (!can(capabilities, 'events.correct')) {
    return {
      label: 'Korekta administratora',
      allowed: false,
      reason: denialReason('events.correct'),
    };
  }

  if (!state.closed) {
    return {
      label: 'Korekta administratora',
      allowed: false,
      reason: 'Dzień jeszcze trwa — do zamknięcia poprawia pilot',
    };
  }

  return { label: 'Korekta administratora', allowed: true, reason: null };
}

/**
 * Adres ekranu korekty JEDNEGO zdarzenia (`A02b`).
 *
 * Jedno miejsce, w którym powstaje ta ścieżka — bo składają ją oś dnia i szuflada
 * flagi, a rozjazd między nimi kończyłby się martwym linkiem w jednej z dwóch dróg.
 */
export function correctionPath(sessionUuid: string, targetUuid: string): string {
  return `/dni/${encodeURIComponent(sessionUuid)}/korekta/${encodeURIComponent(targetUuid)}`;
}
