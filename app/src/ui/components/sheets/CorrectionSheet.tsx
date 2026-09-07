/**
 * UZ Aero - CorrectionSheet (mockup `design/10e` „Korekta zdarzenia"; wcześniej 04c)
 *
 * Arkusz korekty w trybie edycji sesji: nazwa korygowanego zdarzenia, czas, wiersze
 * odniesienia (metoda wykrycia, wpływ na czasy), opcjonalny powód i wejście w historię
 * zmian.
 *
 * ══ UNIEWAŻNIENIE JEST IKONĄ, NIE PRZYCISKIEM ══
 * Kosz w nagłówku (uwaga z urządzenia, 2026-08-14). Wcześniej stał tu pełnowymiarowy
 * czerwony przycisk pod separatorem - i choć separator miał go oddalić od „Zapisz",
 * skutek był odwrotny: krzyczał jak akcja główna arkusza. A intencją wchodzącego
 * w korektę jest POPRAWKA; kasowanie to rzadki wyjątek, który ma być dostępny, nie
 * eksponowany.
 *
 * ══ CZEGO TU ŚWIADOMIE NIE MA ══
 * Wyjaśnień, jak działa rejestr (zgłoszenie z urządzenia, 2026-08-14). Baner „korekta
 * nie kasuje historii - zapisujemy osobne zdarzenie korygujące…" i przypis „oznacza
 * zdarzenie jako błędne (nie usuwa go z rejestru)" opisywały wewnętrzną budowę
 * append-only komuś, kto o nią nie pytał. Ta sama reguła zdjęła wcześniej przypis spod
 * pasa edycji i podpowiedzi „litry z paliwomierza": arkusz odpowiada na pytanie ZADANE.
 *
 * Czas ustawia wspólny `TimeStepper` - jedna czynność ma w aplikacji jeden kształt.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { HistoryLink } from '../data/HistoryLink';
import { IconAction } from '../data/IconAction';
import { ReasonField } from '../input/ReasonField';
import { TimeStepper } from '../input/TimeStepper';
import { BugButton } from '../bug/BugButton';
import { SheetSurface } from './SheetSurface';

export interface CorrectionRef {
  label: string;
  value: string;
}

export interface CorrectionSheetProps {
  visible: boolean;
  /** Nazwa zdarzenia z kontekstem („Landing · Lot 1"). */
  eventLabel: string;
  /** Pierwotny czas zdarzenia (ms) - punkt odniesienia delty. */
  originalTime: number;
  /**
   * Pochodzenie zapisu („auto · GPS" / „ręcznie") - od 2026-08-14 NIE JEST plakietką
   * na ekranie, tylko źródłem podpisu przy zmianie czasu („względem odczytu GPS").
   * Metodę wykrycia niesie osobny wiersz odniesienia, więc plakietka ją dublowała.
   */
  methodBadge?: string | null;
  /** Wiersze odniesienia dla bieżąco ustawionego czasu - w tym wpływ na czasy. */
  refsFor: (newTime: number) => CorrectionRef[];
  formatTime: (t: number) => string;
  /** Górna granica czasu (zwykle „teraz") - korekta w przyszłość to przepowiednia. */
  maxTime: number;
  /** Napis akcji destrukcyjnej („TEGO LĄDOWANIA NIE BYŁO"). */
  voidLabel: string;
  busy?: boolean;
  /** Ile poprawek ma już to zdarzenie - wejście w historię zmian (issue #43). */
  historyCount?: number;
  onOpenHistory?: () => void;
  /** Powód jest OPCJONALNY - patrz `ReasonField`. */
  onSave: (newTime: number, reason: string | null) => void;
  onVoid: (reason: string | null) => void;
  onCancel: () => void;
}

/** Zakres korekty czasu (min) - dalej niż godzina to nie korekta, tylko inne zdarzenie. */
const MAX_SHIFT_MIN = 60;

export function CorrectionSheet({
  visible,
  eventLabel,
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

  const [offsetMin, setOffsetMin] = useState(0);
  const [reason, setReason] = useState('');

  // Każde otwarcie startuje od czasu pierwotnego - arkusz nie pamięta porzuconej edycji.
  useEffect(() => {
    if (visible) {
      setOffsetMin(0);
      setReason('');
    }
  }, [visible, originalTime]);

  /** Pusty powód to BRAK powodu, nie pusty napis - historia zmian ma go nie pokazywać. */
  const trimmedReason = (): string | null => (reason.trim() === '' ? null : reason.trim());

  const newTime = originalTime + offsetMin * 60_000;
  const source = methodBadge != null && methodBadge.startsWith('auto') ? 'odczytu GPS' : 'wpisu';

  return (
    <SheetSurface
      visible={visible}
      onCancel={onCancel}
      topRight={<BugButton sheet={'KOREKTA ZDARZENIA'} />}
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
            {/* Bez powodu odmowy pod przyciskiem (uwaga z urządzenia, 2026-08-14):
                „Zmień czas albo użyj akcji poniżej" opisywało stan, który widać -
                arkusz otwarty na wartości pierwotnej niczego jeszcze nie zmienił. */}
            <ActionButton
              label="ZAPISZ KOREKTĘ"
              tone="green"
              variant="solid"
              size="md"
              busy={busy}
              disabled={offsetMin === 0}
              onPress={() => onSave(newTime, trimmedReason())}
              style={{ flex: 2 }}
            />
          </View>
        </>
      }
    >
      {/*
        Tytuł, cel korekty i - po prawej - KOSZ.
        Unieważnienie zdarzenia było wcześniej pełnowymiarowym czerwonym przyciskiem pod
        separatorem i krzyczało jak akcja główna, choć intencją wchodzącego w korektę
        jest poprawka, a nie kasowanie (uwaga z urządzenia, 2026-08-14).
      */}
      <View style={styles.titleRow}>
        <AppText variant="display" style={styles.title}>
          KOREKTA ZDARZENIA
        </AppText>
        <IconAction
          name="trash"
          tone="red"
          accessibilityLabel={voidLabel}
          onPress={() => onVoid(trimmedReason())}
          disabled={busy}
        />
      </View>

      {/*
        CEL KOREKTY jednym wierszem, jak w arkuszu notatki i zrzutu (uwaga z urządzenia).
        Wcześniej stała tu karta w kolorowej ramce, z ikoną typu zdarzenia i plakietką
        metody - trzy ozdoby wokół jednej informacji („co poprawiam"), z których:
         • ramka i ikona niosły ton arkusza, nie stan danych,
         • plakietka „auto · GPS" powtarzała wiersz odniesienia „Metoda wykrycia"
           dwa centymetry niżej.
        Godzina też odpadła: stoi w kontrolce pod spodem, którą się ją zmienia.
      */}
      <AppText variant="mono" tone="muted" style={styles.target}>
        {eventLabel.toUpperCase()}
      </AppText>

      {/* Czas zdarzenia - WSPÓLNA kontrolka, nie własna para przycisków. Do issue #43
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
      />

      {/* Wiersze odniesienia - w tym wpływ na czasy, przeliczany na bieżąco. */}
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
  // Kosz stoi w linii tytułu, a nie pod nim: `marginRight` ujemny wyrównuje jego pole
  // dotknięcia do krawędzi arkusza, żeby ikona nie wisiała wcięta o pół centymetra.
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: -8 },
  title: { flex: 1, fontSize: 22, lineHeight: 24, letterSpacing: 2 },
  target: { fontSize: 9, letterSpacing: 1.5 },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  refText: { fontSize: 10, letterSpacing: 0.5 },
});
