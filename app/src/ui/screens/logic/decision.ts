/**
 * Ninerdeck - EKRAN DECYZJI o cudzej rezerwacji (`design/26`, `26c`; 3.1.0, epik R-I;
 * `docs/rezerwacje.md` §9.4, §11).
 *
 * ══ KROKU NIE PISZEMY ══
 * Ekran pyta CIEBIE, więc nazwa kroku odpowiada na pytanie, którego nikt nie zadał.
 * Co się stanie po decyzji, mówi jedno zdanie pod pasem akcji - raz.
 *
 * ══ ODMOWA NIE JEST CZERWONA ══
 * Czerwień niesie w tej aplikacji odwołanie WŁASNEJ rezerwacji i unieważnienie wpisu -
 * rzeczy, które coś kasują. Odmowa jest decyzją i stoi obok zgody jako druga, wyciszona
 * odpowiedź. Powód przy odmowie jest WYMAGANY - pilot czyta go na swoim telefonie.
 *
 * Podglądy pilota i samolotu (26a/26b) NIE prowadzą jeszcze w głąb - osobne zgłoszenie
 * po R-H (decyzja właściciela 2026-09-23), wspólne z szufladą K6 w panelu.
 */

import { duration, litres } from '@ninerdeck/format';

import type { DecisionRefusal, RemoteApproval } from '../../../application';

import type { BookingDetailRow } from './bookingDetails';
import { termIn } from './bookingApproval';
import type { CalendarBooking } from './calendarData';
import { dayShort } from './calendarHeading';
import { clubHhmm, type ClubDayBounds } from './clubClock';
import { agoLabel } from './inbox';
import { operationLabelOf } from './operations';

export interface DecisionInput {
  booking: CalendarBooking;
  day: ClubDayBounds;
  approval: RemoteApproval | null | undefined;
  now: number;
  aircraft: { reg: string; type: string | null } | null;
  /** Rezerwujący i drugi pilot z cache członków; `null` = poza cache'em. */
  pilot: { name: string; code: string } | null;
  dual: { name: string; code: string } | null;
}

export interface DecisionVm {
  /** Karta „Rezerwacja do rozpatrzenia" - wiersze z wartością; puste pola nie stoją z kreską. */
  rows: BookingDetailRow[];
  /** Zdanie pod pasem akcji: co się stanie po zgodzie i po odmowie. */
  footnote: string;
  /** Sprawa naprawdę czeka - inaczej pasa akcji nie ma (rozstrzygnięta, odwołana). */
  decidable: boolean;
  /** „SP-AXA · sob 26 WRZ 09:00-12:00" - wiersz odniesienia w arkuszu odmowy. */
  reference: string;
}

export function decisionView(input: DecisionInput): DecisionVm {
  const b = input.booking;
  const hours = `${clubHhmm(b.startsAt, input.day)}-${clubHhmm(b.endsAt, input.day)}`;
  const dzien = dayShort(input.day);
  const term = `${dzien.charAt(0).toLowerCase()}${dzien.slice(1)} ${hours}`;
  const reg = input.aircraft?.reg ?? b.aircraftId;

  const rows: BookingDetailRow[] = [
    { label: 'Samolot', value: reg, sub: input.aircraft?.type ?? null },
    { label: 'Termin', value: term, sub: null },
    // Rezerwujący: nazwisko czyta się bez zaglądania do listy członków, kod odróżnia
    // dwóch Nowaków. Poza cache'em zostaje kod z rezerwacji - surowy identyfikator
    // nie ma prawa stanąć na ekranie decyzji.
    { label: 'Pilot', value: input.pilot?.name ?? '—', sub: input.pilot?.code ?? null },
  ];
  if (b.dualId != null) {
    rows.push({ label: 'Drugi pilot', value: input.dual?.name ?? '—', sub: input.dual?.code ?? null });
  }
  const zadanie = operationLabelOf(b.operation);
  if (zadanie != null) rows.push({ label: 'Zadanie', value: zadanie, sub: null });

  const trasa = route(b);
  if (trasa != null) rows.push({ label: 'Trasa', value: trasa, sub: null });

  const plan = [
    b.plannedAirMin == null ? null : duration(b.plannedAirMin * 60_000),
    b.plannedFuelL == null ? null : `paliwo ${litres(b.plannedFuelL)}`,
  ].filter((x): x is string => x != null);
  if (plan.length > 0) rows.push({ label: 'Plan lotu', value: plan.join(' · '), sub: null });

  const note = b.note?.trim() ?? '';
  if (note !== '') rows.push({ label: 'Notatka', value: note, sub: null });

  if (b.createdAt != null) {
    rows.push({
      label: 'Czeka od',
      value: agoLabel(b.createdAt, input.now),
      sub: termIn(input.day, input.now),
    });
  }

  return {
    rows,
    footnote: footnote(input.approval),
    decidable: b.status === 'pending' && input.approval?.outcome === 'pending',
    reference: `${reg} · ${term}`,
  };
}

function route(b: CalendarBooking): string | null {
  if (b.fromIcao == null && b.toIcao == null) return null;
  if (b.toIcao == null || b.fromIcao === b.toIcao) return b.fromIcao ?? b.toIcao;
  if (b.fromIcao == null) return b.toIcao;
  return `${b.fromIcao} → ${b.toIcao}`;
}

function footnote(approval: RemoteApproval | null | undefined): string {
  const steps = approval?.steps ?? [];
  const at = steps.findIndex((s) => s.current);
  const next = at >= 0 ? (steps[at + 1]?.label ?? null) : null;
  const zgoda =
    next == null
      ? 'Po zgodzie rezerwacja jest potwierdzona.'
      : `Po zgodzie rezerwacja idzie do kroku „${next}".`;
  return `${zgoda} Po odmowie termin wraca do puli, a pilot dostaje powód.`;
}

/** Odmowa serwera → zdanie przy przycisku. Kody surowe nazywa ekran, nie serwer. */
export const DECISION_REFUSAL_TEXT: Readonly<Record<DecisionRefusal, string>> = {
  not_pending: 'Ta rezerwacja nie czeka już na decyzję.',
  not_your_step: 'To nie jest Twój krok - decyduje ktoś z listy kroku bieżącego.',
  reason_required: 'Napisz, dlaczego nie - pilot przeczyta to na swoim telefonie.',
  booking_closed: 'Ktoś rozstrzygnął tę rezerwację przed chwilą.',
  forbidden: 'Nie masz prawa akceptacji rezerwacji - nadaje je administrator klubu.',
  not_found: 'Nie ma już tej rezerwacji.',
};

export function decisionRefusalText(refusal: DecisionRefusal | string): string {
  return DECISION_REFUSAL_TEXT[refusal as DecisionRefusal] ?? 'Nie udało się zapisać decyzji.';
}
