/**
 * Ninerdeck - KROK „TERMIN I MASZYNA": krok 1 rezerwacji (22) i zlecenia (31).
 *
 * Zlecenie jest rezerwacją, która szuka załogi (`docs/zlecenia.md` §2.1), więc oba
 * formularze pytają tu o dokładnie to samo: kto zajmie tę maszynę w tych godzinach.
 * Te same chipy dni, te same karty maszyn z zajętością wybranego dnia, te same sugestie
 * godzin i ta sama para Od/Do - jeden komponent, bo dwie kopie rozjechałyby się przy
 * pierwszej poprawce jednej z nich. Różnią się wyłącznie podpisem długości w arkuszu
 * godziny (`lengthLabel`).
 *
 * Wylicza go `hooks/useTermPicker.ts`; tu jest wyłącznie rysunek i dwa arkusze kroku
 * (godzina 22B, kalendarz miesięczny 15E). Arkusze zostają ZAMONTOWANE, a chowa je
 * `visible` - rama przeżywa własną niewidzialność, żeby zdążyć z animacją wyjazdu.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { relativeAge } from '@ninerdeck/format';

import {
  BookingAircraftCard,
  BookingDenyCard,
  BookingTimeSheet,
  DayChips,
  Field,
  FlightDateSheet,
  Icon,
  IconAction,
  SlotChips,
  ValueBox,
  type SheetRow,
} from '../components';
import type { TermPicker } from '../hooks/useTermPicker';
import { useTheme, type Theme } from '../theme';
import { duration } from '../format';

import type { BookingDenyVm } from './logic/bookingDeny';
import { slotNote, type TermDraft } from './logic/bookingSteps';
import type { CalendarBooking } from './logic/calendarData';
import { buildDayChips } from './logic/calendarDays';
import { dayHeading } from './logic/calendarHeading';
import { clubHhmm, type ClubDayBounds } from './logic/clubClock';

export interface TermStepProps {
  picker: TermPicker;
  term: TermDraft;
  /** Zmiana pól terminu - jednym ruchem, bo slot z sugestii ustawia oba końce naraz. */
  patch: (change: Partial<TermDraft>) => void;
  /** Odmowa zapisu, która dotyczy terminu - stoi nad krokiem (22C). */
  deny: BookingDenyVm | null;
  pilotId: string;
  now: number;
  nameOf: (id: string | null) => string | null;
  /** „Długość rezerwacji" / „Długość terminu" - wiersz arkusza godziny. */
  lengthLabel: string;
  /**
   * Zdanie o skutku zmiany terminu, pod godzinami - tam, gdzie zmiana się dzieje (edycja
   * zlecenia, ramka 2 makiety 31). Bez niego krok kończy się na godzinach.
   */
  footer?: React.ReactNode;
}

export function TermStep({ picker, term, patch, deny, pilotId, now, nameOf, lengthLabel, footer }: TermStepProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [timeEdge, setTimeEdge] = useState<'start' | 'end' | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  const { data, day, grid, aircraft, options, chips, minutes } = picker;
  if (data == null) return null;

  const pickSlot = (startsAt: number, endsAt: number) => patch({ startsAt, endsAt });

  const fix = deny?.offerFix === true ? chips[0] : undefined;
  const hint = slotNote({ draft: term, aircraft, bookings: picker.onDay, now });

  return (
    <>
      {deny != null && (
        <BookingDenyCard
          deny={deny}
          {...(fix != null
            ? {
                fix: {
                  label: `Najbliższe wolne ${relativeAge(fix.endsAt - fix.startsAt)}`,
                  hours: fix.hours,
                  onPress: () => pickSlot(fix.startsAt, fix.endsAt),
                },
              }
            : {})}
        />
      )}

      <Field label="Dzień" labelNote="czas klubu">
        <View style={s.dayRow}>
          <View style={s.dayStrip}>
            <DayChips
              days={buildDayChips({ days: data.days, bookings: data.bookings, pilotId, selected: picker.selected ?? '', now })}
              onSelect={(date) => patch({ date })}
            />
          </View>
          {/* `.day-more` z makiety: wyjście do pełnego kalendarza stoi NA KOŃCU paska,
              a nie w nagłówku - dotyczy tego jednego pola, nie ekranu. */}
          <IconAction name="calendar" accessibilityLabel="Wybierz datę z kalendarza" onPress={() => setDateOpen(true)} />
        </View>
      </Field>

      <Field label="Samolot">
        <View style={s.cards}>
          {options.map((option) => (
            <BookingAircraftCard
              key={option.aircraftId}
              option={option}
              bars={grid?.rows.find((r) => r.aircraftId === option.aircraftId)?.bars ?? []}
              selected={term.aircraftId === option.aircraftId}
              onPress={() => patch({ aircraftId: option.aircraftId })}
            />
          ))}
        </View>
      </Field>

      {chips.length > 0 && (
        <Field label="Sugerowane godziny" labelNote={minutes == null ? '2 h' : duration(minutes * 60_000)}>
          <SlotChips chips={chips} onSelect={pickSlot} />
        </Field>
      )}

      <Field label="Godziny" hint={hint ?? undefined}>
        <View style={s.timeRow}>
          <ValueBox
            value={term.startsAt == null || day == null ? '' : clubHhmm(term.startsAt, day)}
            placeholder="--:--"
            meta="Od"
            actionIcon="edit"
            onPress={() => setTimeEdge('start')}
            style={s.timeBox}
          />
          <Icon name="next" size={16} color={theme.colors.textMuted} />
          <ValueBox
            value={term.endsAt == null || day == null ? '' : clubHhmm(term.endsAt, day)}
            placeholder="--:--"
            meta="Do"
            actionIcon="edit"
            onPress={() => setTimeEdge('end')}
            style={s.timeBox}
          />
        </View>
      </Field>

      {footer}

      {day != null && (
        <BookingTimeSheet
          visible={timeEdge != null}
          edge={timeEdge ?? 'start'}
          value={timeEdge === 'end' ? term.endsAt : term.startsAt}
          day={day}
          target={`${aircraft?.reg ?? 'Samolot'} · ${dayHeading(day)}`}
          min={grid?.from ?? day.startsAt}
          max={grid?.to ?? day.endsAt}
          rows={timeRows(term, day, picker.onDay, nameOf, lengthLabel)}
          onChange={(next) => patch(timeEdge === 'end' ? { endsAt: next } : { startsAt: next })}
          onConfirm={() => setTimeEdge(null)}
          onCancel={() => setTimeEdge(null)}
        />
      )}

      {/* Kalendarz miesięczny daty. `FlightDateSheet` powstał dla wpisu RĘCZNEGO, gdzie
          przyszłość jest nonsensem i dlatego `now` jest tam GÓRNĄ GRANICĄ. Termin patrzy
          w drugą stronę, więc granicę przesuwamy o rok do przodu. */}
      <FlightDateSheet
        visible={dateOpen}
        day={day?.startsAt ?? now}
        now={now + 365 * 86_400_000}
        onConfirm={(picked) => {
          // Data spoza okna przestawia KOTWICĘ - następna odpowiedź przyniesie doby wokół
          // niej, a pasek chipów pokaże je zamiast dzisiejszych.
          picker.setAnchor(picked);
          patch({ date: null });
          setDateOpen(false);
        }}
        onCancel={() => setDateOpen(false)}
      />
    </>
  );
}

/** Wiersze odniesienia arkusza godziny - co stoi obok tego terminu. */
function timeRows(
  term: TermDraft,
  day: ClubDayBounds,
  onDay: readonly CalendarBooking[],
  nameOf: (id: string | null) => string | null,
  lengthLabel: string,
): SheetRow[] {
  const rows: SheetRow[] = [];

  if (term.startsAt != null && term.endsAt != null && term.endsAt > term.startsAt) {
    rows.push({ label: lengthLabel, value: duration(term.endsAt - term.startsAt) });
  }

  const next = onDay
    .filter((b) => b.aircraftId === term.aircraftId && term.startsAt != null && b.startsAt >= term.startsAt)
    .sort((a, b) => a.startsAt - b.startsAt)[0];

  if (next != null) {
    const who = next.kind === 'block' ? 'wyłączenie z użytku' : (nameOf(next.pilotId) ?? 'inna rezerwacja');
    rows.push({ label: 'Następna zajętość', value: `${clubHhmm(next.startsAt, day)} · ${who}` });
  }

  return rows;
}

const styles = (_t: Theme) =>
  StyleSheet.create({
    dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dayStrip: { flex: 1 },
    cards: { gap: 7 },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeBox: { flex: 1 },
  });
