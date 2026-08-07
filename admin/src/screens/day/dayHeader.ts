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
 * Tytuł bierze datę z CHWILI PRZEJĘCIA, bo to ona przypisuje sesję do doby — i tak samo
 * działa filtr zakresu na liście. Sesja bez `session_claim` nie ma daty i panel to mówi,
 * zamiast podstawiać datę pierwszego zdarzenia albo „dzisiaj".
 *
 * Karta opisuje SESJĘ SAMOLOTU (przejęcie → zdanie), nie służbę pilota: ta należy do
 * PILOTA i potrafi objąć kilka maszyn (§3.6a), więc na karcie jednej z nich byłaby
 * pomyłką kategorii. Stąd też brak czasu służby w podsumowaniu (`daySummary.ts`).
 */
export function dayHeader(session: SessionListItemDto, state: SessionState): DayHeader {
  const reg = session.reg ?? session.aircraftId;
  const title =
    session.claimedAt == null
      ? `SESJA BEZ CLAIMU · ${reg}`
      : `${dateUtcShort(session.claimedAt)} · ${reg}`;

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
      title: 'Samolot nieoddany — telefon dosyła zdarzenia.',
      body:
        `Sesja nie ma jeszcze \`day_close\`; ${last}. Liczby poniżej są stanem na ostatni sync, ` +
        'nie stanem końcowym — dojdą kolejne wzloty, tankowania i odczyt końcowy. Odczyty ' +
        '„koniec" (MH, FOB) wypełni dopiero zdanie samolotu; do tego czasu panel pokazuje „—" ' +
        'zamiast zgadywać, a wiersz tej zmiany w karcie doby zostaje otwarty.',
    };
  }

  const closed = state.closedAt == null ? '—' : `${utcStamp(state.closedAt)} UTC`;
  const age = state.closedAt == null ? null : relativeAge(nowMs - state.closedAt);
  return {
    tone: 'warn',
    title: `Samolot zdany ${closed}${age == null ? '' : ` (${age} temu)`}.`,
    body:
      'Okno samodzielnej korekty pilota liczy się od ZAMKNIĘCIA WZLOTU (`leg_close`), nie od ' +
      'zdania samolotu — każdy wzlot ma własną dobę, a wzlot niepotwierdzony kotwiczy się ' +
      'w wyłączeniu silnika. Administrator dopisuje zmianę zawsze, nowym zdarzeniem ' +
      '`event_correction`, bo rejestr jest append-only i nic się w nim nie nadpisuje. Panel ' +
      'nie odlicza tych okien za Ciebie: kolizję nazywa serwer w chwili podglądu korekty.',
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
 * ══ ZOSTAŁ JEDEN WARUNEK, I TO JEST ZMIANA MODELU ══
 * Do etapu D warunki były dwa; drugi brzmiał „dzień musi być zamknięty" i lustrzył
 * bramkę serwera `400 day_open`. **Bramka znikła 2026-08-07** (decyzja użytkownika):
 * po §3.6a brak `day_close` przestał znaczyć „dzień trwa", bo zdanie samolotu jest
 * OPCJONALNE — sesja sprzed tygodnia wygląda tak samo jak ta z dzisiejszego poranka,
 * więc warunek odmawiałby korekty przede wszystkim tam, gdzie jest potrzebna.
 * Administrator NIE JEST NIGDY BLOKOWANY; kolizję z pilotem nazywa baner nad formularzem
 * (`correction/correctionWarnings.ts`), a decyzję podejmuje człowiek.
 *
 * Jedyny warunek, egzekwowany też przez serwer — więc to jest podpowiedź dla UI,
 * a nie zabezpieczenie:
 *
 *  • **Zdolność `events.correct` ma TYLKO administrator** — szef wyszkolenia czyta
 *    dni i zamyka flagi, ale nie dopisuje zdarzeń do cudzego rejestru. Powód zostaje
 *    dla niego WIDOCZNY: ukrycie zmusiłoby go do zgadywania, czy funkcji nie ma
 *    w produkcie, czy nie ma jej on.
 */
export function correctionAccess(
  capabilities: readonly Capability[] | undefined,
): CorrectionAccess {
  if (!can(capabilities, 'events.correct')) {
    return {
      label: 'Korekta administratora',
      allowed: false,
      reason: denialReason('events.correct'),
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
