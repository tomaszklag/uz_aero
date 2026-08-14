/**
 * UZ Aero — CorrectionSheet (mockup `design/10e` „Korekta zdarzenia"; wcześniej 04c)
 *
 * Arkusz korekty w trybie edycji sesji: karta korygowanego zdarzenia, czas, wiersze
 * odniesienia (metoda wykrycia, wpływ na czasy), opcjonalny powód, wejście w historię
 * zmian i — pod separatorem — akcja destrukcyjna „TEGO … NIE BYŁO".
 *
 * Unieważnienie stoi POD separatorem i w konturze czerwieni: to inna decyzja niż
 * poprawka czasu i nie może być o jeden nieuważny kciuk od „Zapisz".
 *
 * ══ CZEGO TU ŚWIADOMIE NIE MA ══
 * Wyjaśnień, jak działa rejestr (zgłoszenie z urządzenia, 2026-08-14). Baner „korekta
 * nie kasuje historii — zapisujemy osobne zdarzenie korygujące…" i przypis „oznacza
 * zdarzenie jako błędne (nie usuwa go z rejestru)" opisywały wewnętrzną budowę
 * append-only komuś, kto o nią nie pytał. Ta sama reguła zdjęła wcześniej przypis spod
 * pasa edycji i podpowiedzi „litry z paliwomierza": arkusz odpowiada na pytanie ZADANE.
 *
 * Czas ustawia wspólny `TimeStepper` — jedna czynność ma w aplikacji jeden kształt.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { HistoryLink } from '../data/HistoryLink';
import { Icon, type IconName } from '../foundation/Icon';
import { ReasonField } from '../input/ReasonField';
import { TimeStepper } from '../input/TimeStepper';
import { Tag } from '../status/Tag';
import { SheetSurface } from './SheetSurface';
import { toneColors } from '../tone';

export interface CorrectionRef {
  label: string;
  value: string;
}

export interface CorrectionSheetProps {
  visible: boolean;
  /** Nazwa zdarzenia z kontekstem („Landing · Lot 1"). */
  eventLabel: string;
  eventIcon?: IconName;
  /** Pierwotny czas zdarzenia (ms) — punkt odniesienia delty. */
  originalTime: number;
  /** Badge pochodzenia („auto · GPS" / „ręcznie"); null = bez badge'a. */
  methodBadge?: string | null;
  /** Wiersze odniesienia dla bieżąco ustawionego czasu — w tym wpływ na czasy. */
  refsFor: (newTime: number) => CorrectionRef[];
  formatTime: (t: number) => string;
  /** Górna granica czasu (zwykle „teraz") — korekta w przyszłość to przepowiednia. */
  maxTime: number;
  /** Napis akcji destrukcyjnej („TEGO LĄDOWANIA NIE BYŁO"). */
  voidLabel: string;
  busy?: boolean;
  /** Ile poprawek ma już to zdarzenie — wejście w historię zmian (issue #43). */
  historyCount?: number;
  onOpenHistory?: () => void;
  /** Powód jest OPCJONALNY — patrz `ReasonField`. */
  onSave: (newTime: number, reason: string | null) => void;
  onVoid: (reason: string | null) => void;
  onCancel: () => void;
}

/** Zakres korekty czasu (min) — dalej niż godzina to nie korekta, tylko inne zdarzenie. */
const MAX_SHIFT_MIN = 60;

export function CorrectionSheet({
  visible,
  eventLabel,
  eventIcon = 'landing',
  originalTime,
  methodBadge,
  refsFor,
  formatTime,
  maxTime,
  voidLabel,
  busy = false,
  historyCount = 0,
  onOpenHistory,
  onSave,
  onVoid,
  onCancel,
}: CorrectionSheetProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');

  const [offsetMin, setOffsetMin] = useState(0);
  const [reason, setReason] = useState('');

  // Każde otwarcie startuje od czasu pierwotnego — arkusz nie pamięta porzuconej edycji.
  useEffect(() => {
    if (visible) {
      setOffsetMin(0);
      setReason('');
    }
  }, [visible, originalTime]);

  /** Pusty powód to BRAK powodu, nie pusty napis — historia zmian ma go nie pokazywać. */
  const trimmedReason = (): string | null => (reason.trim() === '' ? null : reason.trim());

  const newTime = originalTime + offsetMin * 60_000;
  const source = methodBadge != null && methodBadge.startsWith('auto') ? 'odczytu GPS' : 'wpisu';

  return (
    <SheetSurface
      visible={visible}
      onCancel={onCancel}
      gap={13}
      paddingHorizontal={theme.spacing.lg + 2}
      paddingTop={theme.spacing.lg + 2}
      /* 30 dp z mockupu jako podłoga; nad paskiem nawigacji rama ustąpi więcej. */
      designPad={30}
      pinned={
        <>
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
              label="ZAPISZ KOREKTĘ"
              tone="green"
              variant="solid"
              size="md"
              busy={busy}
              disabledReason={offsetMin === 0 ? 'Zmień czas albo użyj akcji poniżej' : null}
              onPress={() => onSave(newTime, trimmedReason())}
              style={{ flex: 2 }}
            />
          </View>

          {/* Strefa destrukcyjna — oddzielona, w konturze czerwieni (`.btn-void`).
              Bez przypisu pod przyciskiem: „oznacza zdarzenie jako błędne (nie usuwa
              go z rejestru)" opisywało wewnętrzną budowę rejestru komuś, kto o nią nie
              pytał, a sam napis „TEGO LĄDOWANIA NIE BYŁO" mówi wszystko, co pilot
              musi wiedzieć przed tapnięciem. */}
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <ActionButton
            label={voidLabel}
            tone="red"
            variant="secondary"
            size="md"
            busy={busy}
            icon="warning"
            onPress={() => onVoid(trimmedReason())}
          />
        </>
      }
    >
      {/* Sam tytuł. Baner „korekta nie kasuje historii — zapisujemy osobne zdarzenie
          korygujące…" USUNIĘTY (zgłoszenie z urządzenia, 2026-08-14) razem z chipem
          „Jak to działa?", którym się zwijał: tłumaczył budowę rejestru komuś, kto
          o nią nie pytał. To ta sama reguła, która zdjęła przypis spod pasa edycji
          i podpowiedzi „litry z paliwomierza" — arkusz odpowiada na pytanie zadane. */}
      <AppText variant="display" style={styles.title}>
        KOREKTA ZDARZENIA
      </AppText>

      {/* Karta korygowanego zdarzenia (`.evt-card`). */}
      <View
        style={[
          styles.eventCard,
          {
            borderRadius: theme.radius.btn,
            borderWidth: theme.borderWidth,
            borderColor: blue.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Icon name={eventIcon} size={18} color={blue.accent} />
        <View style={styles.eventBody}>
          <AppText variant="label">{eventLabel}</AppText>
          <AppText variant="mono" tone="muted" style={styles.eventMeta}>
            {`zapisano ${formatTime(originalTime)} UTC`}
          </AppText>
        </View>
        {methodBadge != null && <Tag label={methodBadge} tone="blue" />}
      </View>

      {/* Czas zdarzenia — WSPÓLNA kontrolka, nie własna para przycisków. Do issue #43
          arkusz miał tu prywatny `MinuteButton`: krok minutowy działał, ale godziny nie
          dało się wpisać z klawiatury, bo kontrolka nie umiała nic poza ±1. */}
      <TimeStepper
        value={newTime}
        onChange={(next) => setOffsetMin(Math.round((next - originalTime) / 60_000))}
        format={formatTime}
        originalTime={originalTime}
        origin={source}
        min={originalTime - MAX_SHIFT_MIN * 60_000}
        max={Math.min(originalTime + MAX_SHIFT_MIN * 60_000, maxTime)}
        tone="green"
      />

      {/* Wiersze odniesienia — w tym wpływ na czasy, przeliczany na bieżąco. */}
      {refsFor(newTime).map((ref) => (
        <View key={ref.label} style={styles.refRow}>
          <AppText variant="mono" tone="muted" style={styles.refText}>
            {ref.label}
          </AppText>
          <AppText variant="mono" tone="secondary" style={styles.refText}>
            {ref.value}
          </AppText>
        </View>
      ))}

      <ReasonField
        value={reason}
        onChangeText={setReason}
        placeholder="np. GPS wykrył lądowanie za późno"
      />

      {onOpenHistory != null && (
        <HistoryLink count={historyCount} onPress={onOpenHistory} />
      )}
    </SheetSurface>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, lineHeight: 24, letterSpacing: 2 },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 12 },
  eventBody: { flex: 1, gap: 2 },
  eventMeta: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  refText: { fontSize: 10, letterSpacing: 0.5 },
  separator: { height: 1, marginTop: 3, marginBottom: 1 },
});
