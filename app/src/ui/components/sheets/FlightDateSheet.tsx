/**
 * UZ Aero — arkusz daty lotu (mockup `design/15e-reczny-data.html`, krok 1 wpisu
 * ręcznego).
 *
 * Od issue #58 sercem arkusza jest KALENDARZ MIESIĘCZNY (`CalendarGrid`) — zgłoszenie
 * z urządzenia odwróciło decyzję z 2026-08-16 (wtedy: stepper ±1 dzień + wpis
 * z klawiatury, „siatka 42 kratek to kontrolka, której pilot musi się dopiero
 * nauczyć"). W praktyce było odwrotnie: kalendarz jest kontrolką, którą pilot ZNA,
 * a odklikiwanie daty przyciskiem ±1 dzień — tą, której musiał się uczyć.
 * Skróty „Dzisiaj" i „Wczoraj" zostają NAD kalendarzem: te dwa dni obsługują
 * niemal każdy wpis, więc zwykle siatki nie trzeba nawet dotykać.
 *
 * Przypis „doba liczy się od uruchomienia silnika" mieszka TUTAJ — i tylko tutaj
 * (issue #58 pkt 3): na formularzu kroku 1 powtarzał się pod polem, a wersalikowa
 * etykieta pola robiła z niego krzyk. Tu jest zwykłym zdaniem pod kalendarzem.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { utcDayStart } from '../../../domain';
import { AppText } from '../foundation/AppText';
import { useTheme } from '../../theme';
import { toneColors } from '../tone';
import { CalendarGrid } from '../input/CalendarGrid';
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
      <View style={styles.quickRow}>
        {quick(today, 'Dzisiaj')}
        {quick(yesterday, 'Wczoraj')}
      </View>

      {/* `key` po widoczności: każde otwarcie montuje siatkę od nowa, więc kartka
          wraca na miesiąc WYBRANEJ doby — nie na ostatnio przeglądany. */}
      <CalendarGrid key={String(visible)} value={value} max={today} today={today} onChange={setValue} />

      {/* Zwykłe zdanie, nie wersalikowa etykieta (issue #58 pkt 3) — to przypis
          o znaczeniu wyboru, a nie nazwa pola. */}
      <AppText variant="body" tone="muted" style={styles.note}>
        Doba liczy się od uruchomienia silnika.
      </AppText>
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
  note: { fontSize: 11, lineHeight: 15 },
});
