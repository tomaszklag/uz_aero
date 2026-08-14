/**
 * UZ Aero — ManualEntrySheet (arkusz „Nowy wpis ręczny" z mockupu 08)
 *
 * Pełny wpis §3.8 — CZTERY czasy (off-block, T/O, LDG, on-block) plus uwagi — gdy GPS
 * milczał dłużej i cały lot trzeba odtworzyć z pamięci. To co innego niż
 * `ManualEventSheet` (05f): tamten ratuje JEDNO przegapione zdarzenie w żywym cyklu,
 * ten dopisuje domknięty przebieg po fakcie, jednym zdarzeniem `manual_log_entry`.
 *
 * Steppery ±1 min (46 px, rękawice) jak w 04c; przytrzymanie powtarza krok — cztery
 * czasy potrafią leżeć godziny wstecz i pojedyncze tapnięcia by nie wystarczyły.
 * W przyszłość nie da się zapisać niczego.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { ManualLogEntryPayload } from '../../../domain';
import { useTheme } from '../../theme';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { SheetSurface } from './SheetSurface';
import { toneColors } from '../tone';

/** Kolejność i etykiety §3.8 — dokładnie jak kolumny rejestru. */
const FIELDS = [
  { key: 'offBlock', label: 'Off-block' },
  { key: 'takeoff', label: 'Takeoff' },
  { key: 'landing', label: 'Landing' },
  { key: 'onBlock', label: 'On-block' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

/** Wstecz maksymalnie dobę — wpis starszy niż dzień to sprawa administratora. */
const MAX_BACK_MIN = 24 * 60;

export interface ManualEntrySheetProps {
  visible: boolean;
  /** „Teraz" (ms) — punkt odniesienia przesunięć. */
  now: number;
  /** Format czasu (UTC). */
  formatTime: (t: number) => string;
  busy?: boolean;
  onConfirm: (payload: ManualLogEntryPayload) => void;
  onCancel: () => void;
}

export function ManualEntrySheet({
  visible,
  now,
  formatTime,
  busy = false,
  onConfirm,
  onCancel,
}: ManualEntrySheetProps) {
  const { theme } = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const amber = toneColors(theme, 'amber');

  /** Przesunięcia minutowe względem `now`, per pole; wszystkie ≤ 0. */
  const [offsets, setOffsets] = useState<Record<FieldKey, number>>({
    offBlock: 0,
    takeoff: 0,
    landing: 0,
    onBlock: 0,
  });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible) return;
    setOffsets({ offBlock: 0, takeoff: 0, landing: 0, onBlock: 0 });
    setNotes('');
  }, [visible]);

  const bump = useCallback((key: FieldKey, delta: number) => {
    setOffsets((prev) => ({
      ...prev,
      [key]: Math.min(0, Math.max(-MAX_BACK_MIN, prev[key] + delta)),
    }));
  }, []);

  const confirm = useCallback(() => {
    const at = (key: FieldKey): number => now + offsets[key] * 60_000;
    onConfirm({
      offBlock: at('offBlock'),
      takeoff: at('takeoff'),
      landing: at('landing'),
      onBlock: at('onBlock'),
      notes: notes.trim().length > 0 ? notes.trim() : null,
    });
  }, [notes, now, offsets, onConfirm]);

  return (
    <SheetSurface
      visible={visible}
      onCancel={onCancel}
      gap={12}
      keyboardHeight={keyboardHeight}
      /* Zapas z mockupu jako podłoga; nad paskiem nawigacji rama ustąpi więcej. */
      designPad={theme.spacing.xxl}
      accentColor={amber.border}
      pinned={
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <ActionButton
            label="ANULUJ"
            tone="neutral"
            variant="secondary"
            size="md"
            onPress={onCancel}
            style={{ flex: 1 }}
          />
          <ActionButton
            label="ZAPISZ WPIS"
            tone="amber"
            variant="solid"
            size="md"
            busy={busy}
            onPress={confirm}
            style={{ flex: 2 }}
          />
        </View>
      }
    >
      <AppText variant="display" style={[styles.title, { color: amber.accent }]}>
        NOWY WPIS RĘCZNY
      </AppText>
      <AppText variant="body" tone="secondary" style={styles.lead}>
        Cały przebieg z pamięci — cztery czasy rejestru (§3.8, UTC). Wpis będzie
        oznaczony jako ręczny.
      </AppText>

      {FIELDS.map((field) => {
        const at = now + offsets[field.key] * 60_000;
        return (
          <View
            key={field.key}
            style={[
              styles.timeRow,
              {
                borderRadius: theme.radius.md,
                borderWidth: theme.borderWidth,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <AppText variant="mono" tone="muted" style={styles.timeLabel}>
              {field.label}
            </AppText>
            <HoldButton
              label="−"
              accessibilityLabel={`${field.label} — minuta wstecz`}
              onStep={() => bump(field.key, -1)}
            />
            <AppText
              variant="mono"
              style={[styles.timeValue, { color: theme.colors.textPrimary }]}
            >
              {formatTime(at)}
            </AppText>
            <HoldButton
              label="+"
              accessibilityLabel={`${field.label} — minuta naprzód`}
              onStep={() => bump(field.key, +1)}
              disabled={offsets[field.key] >= 0}
            />
          </View>
        );
      })}

      {/* Uwagi (§3.8) — trafiają do stopki grupy w rejestrze i do arkusza. */}
      <View
        style={[
          styles.notesBox,
          {
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <AppText variant="mono" tone="muted" style={styles.timeLabel}>
          Uwagi (opcjonalne)
        </AppText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="np. GPS bez fixa od startu — czasy ze stopera"
          placeholderTextColor={theme.colors.textMuted}
          // Rodzina z tokenów wprost — surowy TextInput wziąłby font systemowy.
          style={[
            styles.notesInput,
            { color: theme.colors.textPrimary, fontFamily: theme.fontFamily.body },
          ]}
          maxLength={1000}
        />
      </View>

    </SheetSurface>
  );
}

/** Krok ±1 min; przytrzymanie powtarza (czasy bywają godziny wstecz). Cel 46 px. */
function HoldButton({
  label,
  accessibilityLabel,
  onStep,
  disabled = false,
}: {
  label: string;
  /** Czytnik musi wiedzieć, KTÓRE pole zmienia — samo „+/−" nie niesie kontekstu. */
  accessibilityLabel: string;
  onStep: () => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onStep}
      onLongPress={() => {
        timer.current = setInterval(onStep, 80);
      }}
      onPressOut={stop}
      style={({ pressed }) => [
        styles.hold,
        {
          borderRadius: theme.radius.sm,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.borderStrong,
          backgroundColor: pressed ? theme.colors.surfaceHover : theme.colors.surfaceRaised,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <AppText variant="mono" style={styles.holdLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 23, letterSpacing: 2 },
  lead: { fontSize: 12, lineHeight: 17 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timeLabel: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', width: 72 },
  timeValue: { flex: 1, textAlign: 'center', fontSize: 20, letterSpacing: 1.5 },
  hold: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  holdLabel: { fontSize: 18, lineHeight: 20 },
  notesBox: { gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  notesInput: { fontSize: 13, paddingVertical: 4 },
});
