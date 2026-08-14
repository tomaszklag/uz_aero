/**
 * UZ Aero — DropSheet (mockup 05e „Zrzut")
 *
 * Arkusz zapisu wyniesienia: wysokość z GPS, trzy liczniki typów skoków, suma
 * i informacja, do jakiego klienta trafi rozliczenie.
 *
 * Dlaczego arkusz nad kokpitem, a nie osobny ekran: zrzut zapisuje się **w powietrzu**,
 * między jednym wyniesieniem a drugim. Pilot nie może stracić z oczu fazy lotu ani
 * parametrów GPS — mockup dosłownie pokazuje kokpit prześwitujący nad arkuszem.
 *
 * Wysokość jest **odczytem z GPS, nie polem do wpisania** (`CLAUDE.md`: dane z pomiaru
 * mają pierwszeństwo) — od issue #21 pkt 2 to ŚREDNIA z okna czasu
 * (`detection/dropAltitude.ts`), nie ostatni fix, bo pojedynczy odczyt niesie
 * kilkadziesiąt stóp szumu.
 *
 * Liczniki skoczków są OPCJONALNE (issue #21 pkt 4–5): gdy pilot zadeklarował skład
 * przy załadunku, arkusz otwiera się WYPEŁNIONY i w locie wystarczy potwierdzenie;
 * bez deklaracji zapis bez liczb też przechodzi — zrzut jest znacznikiem faktu,
 * a raportowanie składu bywa odłożone. Dlatego przycisk zapisu nie ma stanu
 * zablokowanego (napis „Ustaw liczbę skoczków" skakał layoutem i wyleciał).
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { CounterRow } from '../input/CounterRow';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';
import { SheetSurface } from './SheetSurface';
import { jumpersKey } from './jumpersKey';

export interface JumperCounts {
  tandem: number;
  aff: number;
  solo: number;
}

export interface DropSheetProps {
  visible: boolean;
  /**
   * Numer LOTU, w którym dzieje się zrzut — mockup 05e ma w tytule „ZRZUT · LOT 6",
   * spójnie z podpisem fazy („Lot 6 · nad zrzutowiskiem").
   *
   * To NIE jest numer wyniesienia: w jednym locie bywa ich kilka, a numer zrzutu nadaje
   * komenda (`DropInput.dropNumber` domyślnie kolejny). Ekran liczy go helperem
   * `logic/flightNumber.ts` — wpisanie tu wzoru „na piechotę" skończyło się „LOT 2"
   * w pierwszym locie (issue #21 pkt 1).
   */
  flightNumber: number;
  /** Czas zrzutu (sformatowany, UTC). */
  time: string;
  /** Wysokość z GPS (średnia z okna); `null` = brak danych, zapisujemy zrzut bez niej. */
  altitudeFt: number | null;
  /** Klient z preflightu — dziedziczy go zdarzenie zrzutu (denormalizacja dla arkusza). */
  client?: string | null;
  /**
   * Skład zadeklarowany przy załadunku (issue #21 pkt 5) — liczniki otwierają się
   * z tymi wartościami i pilot tylko POTWIERDZA. `null` = załadunku nie było albo
   * był bez liczb: liczniki startują od zera, zapis bez nich też jest legalny.
   */
  initialJumpers?: JumperCounts | null;
  /** Czas załadunku (sformatowany, UTC) — podpis prefillu; `null` gdy brak. */
  boardingTime?: string | null;
  busy?: boolean;
  onConfirm: (jumpers: JumperCounts) => void;
  onCancel: () => void;
}

const EMPTY: JumperCounts = { tandem: 0, aff: 0, solo: 0 };

export function DropSheet({
  visible,
  flightNumber,
  time,
  altitudeFt,
  client,
  initialJumpers = null,
  boardingTime = null,
  busy = false,
  onConfirm,
  onCancel,
}: DropSheetProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');
  const keyboardHeight = useKeyboardHeight();
  const [jumpers, setJumpers] = useState<JumperCounts>(EMPTY);

  // Każde otwarcie zaczyna od składu z załadunku (a bez niego — od zera): arkusz nie
  // pamięta poprzedniego wyniesienia, bo tamten skład już wyskoczył. Skład
  // w zależnościach domyka rzadki wyścig arkusz-otwarty-podczas-zapisu-załadunku —
  // ale jako KLUCZ LICZB, nie identyczność obiektu (`jumpersKey`): projekcja wraca
  // ze strumienia po każdym zdarzeniu, a przeładowanie prefillu przy niezmienionym
  // składzie kasowałoby liczniki pod palcami pilota.
  const prefillKey = jumpersKey(initialJumpers);
  useEffect(() => {
    if (visible) setJumpers(initialJumpers ?? EMPTY);
  }, [visible, prefillKey]);

  const total = jumpers.tandem + jumpers.aff + jumpers.solo;
  const set = (key: keyof JumperCounts) => (value: number) =>
    setJumpers((j) => ({ ...j, [key]: value }));

  return (
    <SheetSurface
      visible={visible}
      onCancel={onCancel}
      keyboardHeight={keyboardHeight}
      /* Zapas z mockupu jako podłoga; nad paskiem nawigacji rama ustąpi więcej. */
      designPad={theme.spacing.xxl + 2}
      accentColor={blue.border}
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
          {/* Bez stanu zablokowanego (issue #21 pkt 4–5): skład jest opcjonalny, więc
              zapis z zerami jest legalny („skład niepodany"), a znikający napis
              powodu nie ma już jak szarpać layoutem. */}
          <ActionButton
            label="ZAPISZ ZRZUT"
            tone="blue"
            variant="solid"
            size="md"
            busy={busy}
            onPress={() => onConfirm(jumpers)}
            style={{ flex: 2 }}
          />
        </View>
      }
    >
      <View style={styles.head}>
        <AppText variant="display" style={[styles.title, { color: blue.accent }]}>
          {`ZRZUT · LOT ${flightNumber}`}
        </AppText>
        <AppText variant="mono" tone="muted" style={styles.headSub}>
          {`${time} UTC`}
        </AppText>
      </View>

      {/* Wysokość z GPS — odczyt, nie pole. */}
      <View
        style={[
          styles.altRow,
          {
            // Mockup 05e daje `.alt-row` promień 13 — znormalizowany do kanonu
            // `radius.btn`; dryf 13/14 ubity celowo, wzorem `colors.overlay`.
            borderRadius: theme.radius.btn,
            borderWidth: theme.borderWidth,
            borderColor: blue.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Icon name="drop" size={18} color={blue.accent} />
        <AppText
          variant="mono"
          style={{
            flex: 1,
            fontFamily: theme.fontFamily.monoBold,
            fontSize: 24,
            letterSpacing: 1,
            color: altitudeFt != null ? blue.accent : theme.colors.textMuted,
          }}
        >
          {altitudeFt != null ? `${Math.round(altitudeFt)} ft` : '— ft'}
        </AppText>
        <AppText variant="mono" tone="muted" style={styles.altTag}>
          {altitudeFt != null ? 'wysokość z GPS' : 'brak sygnału GPS'}
        </AppText>
      </View>

      <CounterRow
        label="Tandem"
        hint="z instruktorem"
        value={jumpers.tandem}
        onChange={set('tandem')}
      />
      <CounterRow label="AFF" hint="szkolenie" value={jumpers.aff} onChange={set('aff')} />
      <CounterRow
        label="Solo"
        hint="licencjonowani"
        value={jumpers.solo}
        onChange={set('solo')}
      />

      {/* `.total-row` — wypełniona karta w tonie zrzutu, nie przypis pod licznikami.
          Suma jest tym, co faktycznie trafi do rozliczenia, więc ma wagę równą
          polom, z których powstała. */}
      <View
        style={[
          styles.total,
          {
            // Mockup 05e: `.total-row` też ma 13 — znormalizowane do `radius.btn` jak `.alt-row`.
            borderRadius: theme.radius.btn,
            borderWidth: theme.borderWidth,
            borderColor: blue.border,
            backgroundColor: blue.muted,
          },
        ]}
      >
        <AppText variant="mono" style={[styles.totalLabel, { color: blue.accent }]}>
          Skoczków w tym wyniesieniu
        </AppText>
        <AppText variant="display" style={[styles.totalValue, { color: blue.accent }]}>
          {total}
        </AppText>
      </View>

      {/* Podpis prefillu — skąd wzięły się liczby, zanim pilot czegokolwiek dotknął.
          Bez niego wypełnione liczniki wyglądają jak resztki po poprzednim zrzucie. */}
      {initialJumpers != null && (
        <AppText variant="mono" tone="muted" style={styles.client}>
          {boardingTime != null
            ? `Skład z załadunku ${boardingTime} UTC — potwierdź albo popraw`
            : 'Skład z załadunku — potwierdź albo popraw'}
        </AppText>
      )}

      {client != null && client.length > 0 && (
        <AppText variant="mono" tone="muted" style={styles.client}>
          {`Rozliczenie trafi do klienta ${client} (z preflightu)`}
        </AppText>
      )}

    </SheetSurface>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 23, lineHeight: 25, letterSpacing: 2 },
  headSub: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  altRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  altTag: { fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase' },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  totalLabel: { flexShrink: 1, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalValue: { fontSize: 30, lineHeight: 32, letterSpacing: 1 },
  client: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
});
