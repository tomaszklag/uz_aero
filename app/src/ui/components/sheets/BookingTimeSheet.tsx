/**
 * Ninerdeck - GODZINA REZERWACJI (`design/22b-rezerwacja-czas.html`).
 *
 * Jedna kontrolka, bo jedno pytanie (issue #62): pilot tapnął w „Od" albo w „Do"
 * i chce zmienić właśnie to. Drugi koniec schodzi do wiersza odniesienia - nie znika,
 * bo godzinę ustawia się WZGLĘDEM niego, ale nie prosi o uwagę.
 *
 * ══ CZAS KLUBU, NIE UTC ══
 * Rezerwacja jest umową między ludźmi o godzinie, a nie pomiarem (§6). Rejestr operacji
 * zostaje przy UTC i tam jest to oznaczone tak samo wyraźnie; tu etykieta mówi „czas
 * klubu" i nic innego się nie domyśla.
 *
 * ══ KLAWIATURA NIE WCHODZI SAMA ══
 * Kontrolka otwiera się nad WPISANĄ godziną (termin przyszedł z sugestii albo z paska
 * kalendarza), więc pilot sięgnie raczej po ±1 min - a klawiatura zasłoniłaby wiersze
 * odniesienia pod spodem. Decyzja siedzi w samej kontrolce (`stepperOpensForTyping`),
 * więc arkusz nie musi o niej wiedzieć (issue #62, trzecia tura z urządzenia).
 */

import React from 'react';

import { timeLocal } from '@ninerdeck/format';

import { AppText } from '../foundation/AppText';

import { clubHhmm, type ClubDayBounds } from '../../screens/logic/clubClock';
import { TimeStepper } from '../input/TimeStepper';
import { Sheet, type SheetRow } from './Sheet';

export interface BookingTimeSheetProps {
  visible: boolean;
  /** Który koniec terminu poprawiamy. */
  edge: 'start' | 'end';
  value: number | null;
  /** Doba klubu - z niej liczy się godzina ścienna. */
  day: ClubDayBounds;
  /** „SP-AXA · niedziela 20 września" - czego ta godzina dotyczy. */
  target: string;
  /** Granice, poza które godzina nie ma sensu (okno doby lotnej). */
  min?: number;
  max?: number;
  /** Wiersze odniesienia: wolne pasmo, długość, najbliższa zajętość. */
  rows: SheetRow[];
  /** Powód, dla którego zapisu nie ma; `null` = można zapisać. */
  blocker?: string | null;
  onChange: (next: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BookingTimeSheet({
  visible,
  edge,
  value,
  day,
  target,
  min,
  max,
  rows,
  blocker,
  onChange,
  onConfirm,
  onCancel,
}: BookingTimeSheetProps) {
  const format = (t: number): string => clubHhmm(t, day);

  // Czas urządzenia dochodzi WYŁĄCZNIE przy różnicy stref (§6): pilot w tej samej
  // strefie, co klub, dostałby dwa razy tę samą godzinę.
  const elsewhere = value != null && timeLocal(value) !== format(value);

  return (
    <Sheet
      visible={visible}
      title={edge === 'start' ? 'GODZINA OD' : 'GODZINA DO'}
      rows={rows}
      confirmLabel="ZAPISZ"
      {...(blocker != null ? { confirmDisabledReason: blocker } : {})}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {/* Czego ta godzina dotyczy - `.target-label` z makiety. Stoi POD tytułem
          arkusza, a nie w linii etykiety pola: nazywa CEL, a nie właściwość
          kontrolki, i przy parze godzin jest dla obu ten sam. */}
      <AppText variant="mono" tone="secondary" style={{ fontSize: 11, letterSpacing: 1 }}>
        {target}
      </AppText>

      <TimeStepper
        label="Godzina (czas klubu)"
        value={value}
        onChange={onChange}
        format={format}
        localTime={elsewhere}
        placeholder="--:--"
        {...(min != null ? { min } : {})}
        {...(max != null ? { max } : {})}
      />
    </Sheet>
  );
}
