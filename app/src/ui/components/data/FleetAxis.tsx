/**
 * Ninerdeck - OŚ FLOTY: maszyny × godziny (`design/21-kalendarz.html`, `.grid-card`).
 *
 * Rysuje to, co policzył `buildFleetGrid` - procenty, napisy i tony. Żadnej arytmetyki
 * czasu tutaj nie ma i mieć nie ma: pozycja paska jest wynikiem rachunku, a rachunek
 * ma testy.
 *
 * ══ ŚCIEŻKA JEST KONTROLKĄ, NIE OBRAZKIEM ══
 * Tapnięcie w wolne pasmo zakłada rezerwację z podstawioną godziną i maszyną, tapnięcie
 * w pasek otwiera jego szczegóły - w obu wypadkach pilot nie przepisuje niczego ręcznie.
 * Stąd 30 dp wysokości zamiast 16 dp paska z Pulpitu, gdzie oś jest obrazkiem.
 *
 * ══ SKOSU WYŁĄCZENIA Z UŻYTKU NIE MA I TO JEST CENA BRAKU MODUŁU NATYWNEGO ══
 * Makieta rysuje pasek serwisowy skośnym szrafem (`repeating-linear-gradient`), a RN
 * nie ma gradientów bez modułu natywnego - projekt ich unika (ta sama reguła, przez
 * którą mapa śladu ma własny renderer). Zostaje sam bursztyn, czyli TEN SAM sygnał
 * co w całej aplikacji: uwaga o stanie maszyny. Kształtem odróżnia się za to stan
 * przejściowy (`pending` - ramka przerywana), bo tam kolor jest identyczny.
 */

import React, { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import type { BarTone, CalendarBar, FleetGrid, FleetRow } from '../../screens/logic/calendarGrid';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface FleetAxisProps {
  grid: FleetGrid;
  /** Tapnięcie w zajętość - szczegóły rezerwacji albo wyłączenia z użytku. */
  onOpen: (bookingId: string) => void;
  /**
   * Tapnięcie w WOLNE pasmo: maszyna i chwila, w którą pilot celował.
   *
   * Chwilę liczy ten komponent, bo tylko on zna szerokość ścieżki w pikselach -
   * i jest to jedyny rachunek, jaki tu stoi.
   */
  onPick: (aircraftId: string, at: number) => void;
  /** Nagłówek karty - tytuł doby i chip filtra; stoją w tej samej ramce, co oś. */
  header?: React.ReactNode;
  /**
   * Tapnięcie w ZNAK maszyny po lewej osi otwiera jej kartę (27, obserwowanie 3.2.0) -
   * dla osoby ze zdolnością „Obserwowanie samolotów". Bez tego nagłówek wiersza jest
   * SAMĄ ETYKIETĄ (nie wyszarzoną akcją): szewron pojawia się razem z celem.
   */
  onOpenAircraft?: (aircraftId: string) => void;
}

/** Wysokość ścieżki - cel dotknięcia, nie kreska. */
const TRACK_H = 30;

export function FleetAxis({ grid, onOpen, onPick, header, onOpenAircraft }: FleetAxisProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [trackWidth, setTrackWidth] = useState(0);

  const measure = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const pick = useCallback(
    (aircraftId: string, x: number) => {
      if (trackWidth <= 0) return;
      const ratio = Math.min(1, Math.max(0, x / trackWidth));
      onPick(aircraftId, grid.from + ratio * (grid.to - grid.from));
    },
    [grid.from, grid.to, onPick, trackWidth],
  );

  return (
    <View style={s.card}>
      {header}

      {grid.rows.map((row) => (
        <Row
          key={row.aircraftId}
          row={row}
          grid={grid}
          onOpen={onOpen}
          onPick={pick}
          onMeasure={measure}
          onOpenAircraft={onOpenAircraft}
          theme={theme}
        />
      ))}

      <View style={s.scaleRow}>
        <View style={s.regCol} />
        <View style={s.scale}>
          {grid.scale.map((mark) => (
            <AppText
              key={mark.text}
              variant="mono"
              style={[s.scaleText, markPosition(mark.pct)]}
              numberOfLines={1}
            >
              {mark.text}
            </AppText>
          ))}
        </View>
      </View>

      {/* Legenda opisuje to, co na osi widać - doba bez zajętości jej nie dostaje,
          bo tłumaczyłaby wzory, których nie ma (makieta 21C). */}
      {grid.legend.length > 0 && (
        <View style={s.legend}>
          {grid.legend.map((tone) => (
            <View key={tone} style={s.legendItem}>
              <View style={[s.swatch, swatch(tone, theme)]} />
              <AppText variant="mono" style={s.legendText}>
                {LEGEND[tone]}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Row({
  row,
  grid,
  onOpen,
  onPick,
  onMeasure,
  onOpenAircraft,
  theme,
}: {
  row: FleetRow;
  grid: FleetGrid;
  onOpen: (bookingId: string) => void;
  onPick: (aircraftId: string, x: number) => void;
  onMeasure: (e: LayoutChangeEvent) => void;
  onOpenAircraft?: (aircraftId: string) => void;
  theme: Theme;
}) {
  const s = styles(theme);

  const head = (
    <>
      <View style={s.regText}>
        <AppText variant="mono" style={s.reg} numberOfLines={1}>
          {row.reg}
        </AppText>
        <AppText variant="mono" style={s.regType} numberOfLines={1}>
          {row.type}
        </AppText>
      </View>
      {onOpenAircraft != null && <Icon name="more" size={12} color={theme.colors.textMuted} />}
    </>
  );

  return (
    <View style={s.row}>
      {onOpenAircraft == null ? (
        <View style={s.regCol}>{head}</View>
      ) : (
        <Pressable
          style={({ pressed }) => [s.regCol, s.regLink, pressed && { opacity: 0.6 }]}
          onPress={() => onOpenAircraft(row.aircraftId)}
          accessibilityRole="button"
          accessibilityLabel={`${row.reg} - karta maszyny`}
          hitSlop={{ top: 6, bottom: 6, left: 6 }}
        >
          {head}
        </Pressable>
      )}

      <Pressable
        style={s.track}
        onLayout={onMeasure}
        onPress={(e) => onPick(row.aircraftId, e.nativeEvent.locationX)}
        accessibilityRole="button"
        accessibilityLabel={`${row.reg} - wybierz godzinę`}
      >
        {/* Linie pełnych godzin są ODCZYTEM: bez nich paska „gdzieś koło południa"
            nie da się przeczytać co do godziny. */}
        {grid.hourTicks.map((pct) => (
          <View key={`h${pct}`} style={[s.tick, { left: `${pct}%` }]} />
        ))}
        {grid.majorTicks.map((pct) => (
          <View key={`m${pct}`} style={[s.tickMajor, { left: `${pct}%` }]} />
        ))}

        {row.bars.map((bar) => (
          <Bar key={bar.bookingId} bar={bar} onOpen={onOpen} theme={theme} />
        ))}

        {grid.nowPct != null && <View style={[s.now, { left: `${grid.nowPct}%` }]} />}
      </Pressable>
    </View>
  );
}

function Bar({
  bar,
  onOpen,
  theme,
}: {
  bar: CalendarBar;
  onOpen: (bookingId: string) => void;
  theme: Theme;
}) {
  const s = styles(theme);

  return (
    <Pressable
      onPress={() => onOpen(bar.bookingId)}
      accessibilityRole="button"
      accessibilityLabel={`${LEGEND[bar.tone]}: ${bar.label}`}
      style={[s.bar, { left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }, barTone(bar.tone, theme)]}
    >
      <AppText variant="mono" style={[s.barText, barText(bar.tone, theme)]} numberOfLines={1}>
        {bar.label}
      </AppText>
    </Pressable>
  );
}

const LEGEND: Record<BarTone, string> = {
  mine: 'Twoja',
  // Rezerwacja czekająca na akceptację (3.1.0) - w legendzie nie stoi osobno, bo ton
  // ma ten sam; różni się KSZTAŁTEM ramki, a to widać przy samym pasku.
  pending: 'Twoja - czeka na zgodę',
  other: 'Zajęte',
  block: 'Wyłączony',
};

function barTone(tone: BarTone, t: Theme): ViewStyle {
  switch (tone) {
    case 'mine':
      return { backgroundColor: t.colors.greenMuted, borderColor: t.colors.greenBorder };
    case 'pending':
      return {
        backgroundColor: t.colors.greenMuted,
        borderColor: t.colors.greenBorder,
        borderStyle: 'dashed',
      };
    case 'block':
      return { backgroundColor: t.colors.amberMuted, borderColor: t.colors.amberBorder };
    default:
      return { backgroundColor: t.colors.surfaceHover, borderColor: t.colors.borderStrong };
  }
}

function barText(tone: BarTone, t: Theme) {
  if (tone === 'block') return { color: t.colors.amber };
  return tone === 'other' ? { color: t.colors.textSecondary } : { color: t.colors.green };
}

function swatch(tone: BarTone, t: Theme): ViewStyle {
  return barTone(tone, t);
}

/**
 * Podpis skali stoi NA SWOIM procencie, a nie w równych odstępach - okno liczone
 * z efemeryd nie ma równych. Przy krawędziach wyrównanie zmienia się na dosunięte,
 * bo napis wyśrodkowany na 0% wychodzi połową poza ścieżkę.
 */
function markPosition(pct: number): ViewStyle {
  if (pct < 6) return { left: 0 };
  if (pct > 94) return { right: 0 };
  return { left: `${pct}%`, transform: [{ translateX: -7 }] };
}

const styles = (t: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 14,
      paddingTop: 11,
      paddingBottom: 9,
      paddingHorizontal: 12,
      gap: 7,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    regCol: { width: 50 },
    regText: { gap: 1, flexShrink: 1, minWidth: 0 },
    // Znak i szewron w jednym wierszu: cel dotknięcia to CAŁY nagłówek, szewron mówi tylko, że coś otworzy.
    regLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    reg: { fontSize: 10, lineHeight: 12, letterSpacing: 1, color: t.colors.textSecondary },
    regType: { fontSize: 7, lineHeight: 9, letterSpacing: 0.5, color: t.colors.textMuted },
    track: {
      flex: 1,
      height: TRACK_H,
      borderRadius: 7,
      backgroundColor: t.colors.surfaceRaised,
      overflow: 'hidden',
    },
    tick: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: t.colors.hairline },
    tickMajor: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1,
      backgroundColor: t.colors.border,
    },
    bar: {
      position: 'absolute',
      top: 3,
      bottom: 3,
      borderRadius: 5,
      borderWidth: 1,
      justifyContent: 'center',
      paddingHorizontal: 5,
      overflow: 'hidden',
    },
    barText: { fontSize: 7.5, lineHeight: 10, letterSpacing: 0.5 },
    // „Teraz" - jedyna linia pionowa mówiąca o CHWILI, a nie o planie. Wystaje poza
    // ścieżkę, żeby dało się ją odróżnić od linii godzin jednym spojrzeniem.
    now: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: t.colors.red },
    scaleRow: { flexDirection: 'row', gap: 8, paddingTop: 1 },
    scale: { flex: 1, height: 11 },
    scaleText: { position: 'absolute', fontSize: 7.5, lineHeight: 11, color: t.colors.textMuted },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 11,
      paddingTop: 3,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    swatch: { width: 12, height: 8, borderRadius: 2, borderWidth: 1 },
    legendText: { fontSize: 7.5, lineHeight: 10, letterSpacing: 1, color: t.colors.textMuted },
  });
