/**
 * Ninerdeck - KARTA SAMOLOTU na kroku 1 rezerwacji (`design/22`, `.ac-card`).
 *
 * Pasek zajętości stoi W KARCIE maszyny - wybór i skutek wyboru w jednym miejscu.
 * Pilot nie przełącza się między listą a kalendarzem, żeby dowiedzieć się, czy to,
 * co właśnie wybrał, jest w ogóle wolne.
 *
 * ══ MASZYNA WYŁĄCZONA Z UŻYTKU NIE ZNIKA Z LISTY ══
 * Karta jest przygaszona i bez celu dotknięcia, a plakietka mówi POWÓD - razem
 * odpowiadają, czemu nie da się jej wybrać, bez ani jednego zdania o blokadzie.
 * Schowana byłaby odpowiedzią na pytanie „czemu nie ma czym latać" ukrytą przed
 * kimś, kto właśnie je zadaje (granica zwijania, `docs/rezerwacje.md` §9.1).
 */

import { freeSpans } from '@ninerdeck/domain';
import { dateUtcDayMonthLong } from '@ninerdeck/format';

import type { ReferenceAircraft } from '../../../domain';

import type { CalendarBooking } from './calendarData';
import { clubHhmm, clubInstant, type ClubDayBounds } from './clubClock';

export interface AircraftOptionVm {
  aircraftId: string;
  reg: string;
  type: string;
  /** „wolne: 06:00-13:00 · 16:00-21:00"; `null` = nie ma ani jednego wolnego pasma. */
  free: string | null;
  /**
   * Wyłączenie z użytku obejmujące CAŁE okno doby - wtedy karta jest nieklikalna.
   * Wyłączenie na kilka godzin zostaje zwykłą zajętością: maszynę da się wziąć obok.
   */
  blocked: { reason: string; until: string } | null;
}

export interface AircraftOptionsInput {
  aircraft: readonly ReferenceAircraft[];
  /** Zajętości WYBRANEJ doby (wszystkie maszyny). */
  bookings: readonly CalendarBooking[];
  day: ClubDayBounds;
  /** Okno osi - to samo, w którym liczą się procenty pasków (`buildFleetGrid`). */
  window: { from: number; to: number };
}

export function buildAircraftOptions(input: AircraftOptionsInput): AircraftOptionVm[] {
  return input.aircraft.map((ac) => {
    const busy = input.bookings.filter((b) => b.aircraftId === ac.id);
    const block = fullDayBlock(busy, input.window);

    return {
      aircraftId: ac.id,
      reg: ac.reg,
      type: ac.type,
      free: block != null ? null : freeText(busy, input.window, input.day),
      blocked:
        block == null
          ? null
          : {
              reason: block.blockReason ?? 'Wyłączony z użytku',
              // Granica jest WYŁĄCZAJĄCA (klamra `[)`, jak wszędzie w tym module),
              // więc nazywamy ostatnią chwilę OBJĘTĄ wyłączeniem - inaczej maszyna
              // „wyłączona do 25 września" byłaby 25 września wolna.
              until: `wyłączony z użytku do ${dateUtcDayMonthLong(
                clubInstant(block.endsAt - 1, input.day),
              ).toLowerCase()}`,
            },
    };
  });
}

/** Wyłączenie z użytku przykrywające całe okno - maszyny nie da się dziś wziąć wcale. */
function fullDayBlock(
  busy: readonly CalendarBooking[],
  window: { from: number; to: number },
): CalendarBooking | null {
  return (
    busy.find((b) => b.kind === 'block' && b.startsAt <= window.from && b.endsAt >= window.to) ??
    null
  );
}

/**
 * „wolne: 06:00-13:00 · 16:00-21:00".
 *
 * Pasma liczy DOMENA (`freeSpans`) - ta sama odpowiedź, z której powstają sugestie
 * slotów, więc napis na karcie i propozycja godzin nie mają jak powiedzieć czegoś
 * innego. Odsiewamy pasma KRÓTSZE NIŻ KWADRANS: pod tym progiem to nie jest termin
 * do wzięcia, tylko szpara między dwiema rezerwacjami, a wypisana wydłużałaby wiersz
 * o rzecz, której nikt nie użyje.
 */
const MIN_SHOWN_MS = 15 * 60_000;

function freeText(
  busy: readonly CalendarBooking[],
  window: { from: number; to: number },
  day: ClubDayBounds,
): string | null {
  const spans = freeSpans(window, busy)
    .filter((span) => span.endsAt - span.startsAt >= MIN_SHOWN_MS)
    .map((span) => `${clubHhmm(span.startsAt, day)}-${clubHhmm(span.endsAt, day)}`);

  return spans.length === 0 ? null : `wolne: ${spans.join(' · ')}`;
}
