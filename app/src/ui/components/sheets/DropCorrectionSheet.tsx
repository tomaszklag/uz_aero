/**
 * UZ Aero — DropCorrectionSheet (mockup `design/10g` „Korekta zrzutu")
 *
 * Czas i skład wyniesienia w JEDNYM arkuszu, bo przy zrzucie obie rzeczy mylą się tak
 * samo często: GPS zapisał moment otwarcia drzwi minutę wcześniej, a skoczków wyszło
 * pięciu zamiast czterech. Dwa osobne arkusze kazałyby przechodzić tę samą drogę dwa razy.
 *
 * Wysokość zostaje ODCZYTEM (`CLAUDE.md`: dane z pomiaru mają pierwszeństwo) — to
 * średnia z okna 15 s wokół zrzutu (`detection/dropAltitude.ts`), więc wpisanie jej
 * ręcznie zamieniłoby pomiar na zgadywanie.
 *
 * Skład jest OPCJONALNY (issue #21 pkt 5): `null` znaczy „niepodany", nie zero. Dlatego
 * arkusz rozróżnia „nikt nie wyskoczył" od „nie wiem, ilu" — tego drugiego nie da się
 * wyrazić licznikami, więc służy do tego osobna akcja „nie podano".
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { JumperCounts } from '../../../domain';
import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { HistoryLink } from '../data/HistoryLink';
import { CounterRow } from '../input/CounterRow';
import { ReasonField } from '../input/ReasonField';
import { TimeStepper } from '../input/TimeStepper';
import { Field } from '../input/Field';
import { Sheet } from './Sheet';

/** Co zmieniła korekta — pola pominięte znaczą „bez zmiany". */
export interface DropCorrection {
  newTime?: number;
  jumpers?: JumperCounts | null;
}

export interface DropCorrectionSheetProps {
  visible: boolean;
  /** „Zrzut 2 · lot 2" — cel korekty. */
  title: string;
  originalTime: number;
  /** Skład w mocy TERAZ; `null` = niepodany. */
  jumpers: JumperCounts | null;
  /** Wysokość z GPS („12 600 FT"); `null` = zrzut bez fixa. */
  altitude: string | null;
  formatTime: (t: number) => string;
  /** Górna granica czasu (zwykle „teraz”) — korekta w przyszłość to przepowiednia. */
  maxTime: number;
  busy?: boolean;
  historyCount?: number;
  onOpenHistory?: () => void;
  onSave: (correction: DropCorrection, reason: string | null) => void;
  onVoid: (reason: string | null) => void;
  onCancel: () => void;
}

/** Zakres korekty czasu (min) — dalej niż godzina to nie korekta, tylko inny zrzut. */
const MAX_SHIFT_MIN = 60;

const EMPTY: JumperCounts = { tandem: 0, aff: 0, solo: 0 };

export function DropCorrectionSheet({
  visible,
  title,
  originalTime,
  jumpers,
  altitude,
  formatTime,
  maxTime,
  busy = false,
  historyCount = 0,
  onOpenHistory,
  onSave,
  onVoid,
  onCancel,
}: DropCorrectionSheetProps) {
  const { theme } = useTheme();
  const [time, setTime] = useState(originalTime);
  const [counts, setCounts] = useState<JumperCounts | null>(jumpers);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTime(originalTime);
    setCounts(jumpers);
    setReason('');
  }, [visible, originalTime, jumpers]);

  const timeChanged = time !== originalTime;
  const jumpersChanged = !sameJumpers(counts, jumpers);
  const changed = timeChanged || jumpersChanged;

  const bump = (key: keyof JumperCounts, next: number): void => {
    setCounts((prev) => ({ ...(prev ?? EMPTY), [key]: next }));
  };

  const confirm = (): void => {
    const correction: DropCorrection = {};
    if (timeChanged) correction.newTime = time;
    if (jumpersChanged) correction.jumpers = counts;
    onSave(correction, reason.trim() === '' ? null : reason.trim());
  };

  const total = counts == null ? null : counts.tandem + counts.aff + counts.solo;

  return (
    <Sheet
      visible={visible}
      title="KOREKTA ZRZUTU"
      confirmLabel="ZAPISZ KOREKTĘ"
      onConfirm={changed ? confirm : undefined}
      onCancel={onCancel}
      destructive={
        <>
          <ActionButton
            label="TEGO ZRZUTU NIE BYŁO"
            tone="red"
            variant="secondary"
            size="md"
            busy={busy}
            icon="warning"
            onPress={() => onVoid(reason.trim() === '' ? null : reason.trim())}
          />
          <AppText variant="mono" tone="muted" style={styles.voidHint}>
            Wyniesienie wypada z rozliczenia i z sumy sesji · wiersz zostaje w rejestrze
          </AppText>
        </>
      }
    >
      <AppText variant="mono" tone="muted" style={styles.target}>
        {title.toUpperCase()}
      </AppText>

      <TimeStepper
        label="Czas zrzutu (UTC)"
        value={time}
        onChange={setTime}
        format={formatTime}
        originalTime={originalTime}
        min={originalTime - MAX_SHIFT_MIN * 60_000}
        max={Math.min(originalTime + MAX_SHIFT_MIN * 60_000, maxTime)}
        tone="blue"
      />

      {altitude != null && (
        <View style={styles.altRow}>
          <AppText variant="mono" style={{ color: theme.colors.blue, fontSize: 20 }}>
            {altitude}
          </AppText>
          <AppText variant="mono" tone="muted" style={styles.altTag}>
            z GPS · średnia z okna
          </AppText>
        </View>
      )}

      <Field label="Skład — ilu wyskoczyło" tag={{ label: 'opcjonalne' }}>
        <View style={{ gap: 7 }}>
          <CounterRow
            label="Tandem"
            hint="z instruktorem"
            value={counts?.tandem ?? 0}
            onChange={(n) => bump('tandem', n)}
          />
          <CounterRow
            label="AFF"
            hint="szkolenie"
            value={counts?.aff ?? 0}
            onChange={(n) => bump('aff', n)}
          />
          <CounterRow
            label="Solo"
            hint="licencjonowani"
            value={counts?.solo ?? 0}
            onChange={(n) => bump('solo', n)}
          />
        </View>
      </Field>

      <View style={styles.totalRow}>
        <AppText variant="mono" tone="muted" style={styles.totalLabel}>
          {total == null ? 'Skład niepodany' : 'Razem'}
        </AppText>
        {total != null && (
          <AppText variant="display" style={{ color: theme.colors.blue, fontSize: 26 }}>
            {total}
          </AppText>
        )}
      </View>

      {/* „Nie podano" ≠ zero (issue #21 pkt 5). Licznikami tego nie da się wyrazić,
          więc dostaje własną, dyskretną akcję — a znika, gdy skład i tak jest pusty. */}
      {counts != null && (
        <ActionButton
          label="SKŁADU NIE PODANO"
          tone="neutral"
          variant="secondary"
          size="md"
          onPress={() => setCounts(null)}
        />
      )}

      <ReasonField
        value={reason}
        onChangeText={setReason}
        placeholder="np. piąty skoczek doliczony po locie"
      />

      {onOpenHistory != null && <HistoryLink count={historyCount} onPress={onOpenHistory} />}
    </Sheet>
  );
}

function sameJumpers(a: JumperCounts | null, b: JumperCounts | null): boolean {
  if (a == null || b == null) return a === b;
  return a.tandem === b.tandem && a.aff === b.aff && a.solo === b.solo;
}


const styles = StyleSheet.create({
  target: { fontSize: 9, letterSpacing: 1.5 },
  altRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  altTag: { fontSize: 8, letterSpacing: 1.2 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontSize: 10, letterSpacing: 1.5 },
  voidHint: { fontSize: 8.5, letterSpacing: 0.8, lineHeight: 14, textAlign: 'center' },
});
