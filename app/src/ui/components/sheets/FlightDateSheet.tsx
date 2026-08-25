/**
 * UZ Aero — arkusz daty lotu (mockup `design/15e-reczny-data.html`, krok 1 wpisu
 * ręcznego).
 *
 * Ta sama kontrolka, co przy godzinie (15D / 10E), tylko w skali DOBY: przyciski
 * ±1 dzień, a tapnięcie w wartość otwiera klawiaturę numeryczną i pozwala wpisać
 * datę wprost (kropki stawia maska — `maskDateUtcInput`). Kalendarza miesięcznego
 * NIE MA: wpis ręczny powstaje w praktyce tego samego dnia albo dzień po locie,
 * a siatka 42 kratek to kontrolka, której pilot musi się dopiero nauczyć, żeby
 * cofnąć się o jeden dzień. Stąd też skróty „Dzisiaj" i „Wczoraj" — dwa dni,
 * w których powstaje niemal każdy wpis.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { utcDayStart } from '../../../domain';
import { dateUtcLong, maskDateUtcInput, parseDateUtc } from '../../format';
import { AppText } from '../foundation/AppText';
import { useTheme } from '../../theme';
import { toneColors } from '../tone';
import { Field } from '../input/Field';
import { Stepper } from '../input/Stepper';
import { Sheet } from './Sheet';

const DAY_MS = 86_400_000;

export interface FlightDateSheetProps {
  visible: boolean;
  /** Doba UTC (północ) w edycji. */
  day: number;
  /** „Teraz" — górna granica (lot w przyszłości to nonsens) i kotwica skrótów. */
  now: number;
  /** Wiersz „Sesje w tej dobie" — wołający liczy go z lokalnego rejestru. */
  sessionsInfo?: string | null;
  onConfirm: (day: number) => void;
  onCancel: () => void;
}

export function FlightDateSheet({
  visible,
  day,
  now,
  sessionsInfo,
  onConfirm,
  onCancel,
}: FlightDateSheetProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');
  const [value, setValue] = useState(day);

  useEffect(() => {
    if (visible) setValue(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const today = utcDayStart(now);
  const yesterday = today - DAY_MS;

  const quick = (target: number, label: string) => {
    const selected = value === target;
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={() => setValue(target)}
        style={[
          styles.quick,
          {
            borderColor: selected ? green.border : theme.colors.borderStrong,
            backgroundColor: selected ? green.muted : theme.colors.surface,
          },
        ]}
      >
        <AppText
          variant="mono"
          style={[styles.quickLabel, { color: selected ? green.accent : theme.colors.textSecondary }]}
        >
          {label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <Sheet
      visible={visible}
      title="DATA LOTU"
      rows={sessionsInfo != null ? [{ label: 'Sesje w tej dobie', value: sessionsInfo }] : []}
      confirmLabel="ZAPISZ"
      onConfirm={() => onConfirm(value)}
      onCancel={onCancel}
    >
      <Field label="Doba UTC uruchomienia silnika">
        <Stepper
          value={value}
          onChange={(next) => setValue(utcDayStart(next))}
          step={DAY_MS}
          stepLabel="1 dzień"
          max={today}
          format={dateUtcLong}
          edit={{
            toText: () => '',
            mask: maskDateUtcInput,
            parse: (text) => parseDateUtc(text, value),
            keyboardType: 'number-pad',
            maxLength: 10,
            label: 'Data lotu',
          }}
        />
      </Field>

      <View style={styles.quickRow}>
        {quick(today, 'Dzisiaj')}
        {quick(yesterday, 'Wczoraj')}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  quickRow: { flexDirection: 'row', gap: 8 },
  quick: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
});
