/**
 * Ninerdeck - WYKRES ODCZYTÓW karty maszyny: motogodziny albo paliwo w czasie
 * (`design/27-samolot.html`, `.chart-card`; obserwowanie 3.2.0, §6.4).
 *
 * Ta sama technika, co profil pionowy śladu (`VerticalProfile`): łamana z obróconych
 * `<View>` (`TrackPolyline`), zero modułów natywnych, podziałka CZASU w lewym dolnym
 * rogu jako wskaźnik przybliżenia („14 dni" zamiast „90 dni" po zoomie), siatka
 * pionowa co jeden krok podziałki.
 *
 * ══ Z KURSOREM I PRZYBLIŻENIEM OD RAZU ══ (decyzja właściciela 2026-09-25)
 * Jeden palec prowadzi kursor - podpis mówi chwilę, wartość i ŹRÓDŁO punktu (zdanie ·
 * przejęcie · tankowanie · wpis administratora); dwa palce przybliżają WYŁĄCZNIE
 * w poziomie (`zoomAxis: 'x'` - pion jest dobrany do zakresu, więc rozciąganie go
 * niczego nie odsłania; reguła z issue #47); dwuklik wraca do całości. Kursor idzie
 * na KAŻDYM wykresie osobno - oś MH i oś paliwa nie mają wspólnej chwili poza tymi,
 * w których oba odczyty padły naraz.
 *
 * ══ BEZ NORMY I BEZ WERDYKTU ══
 * To jest analityka zużycia (panel 3.2.0) i ma własne reguły. Wykres pokazuje, co
 * pokazały przyrządy; brak danych to brak linii, nie zero (issue #69). Geometrię liczy
 * `screens/logic/aircraftSeries.ts` (z testami) - tu jest samo rysowanie.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useChartGesture } from '../../hooks/useChartGesture';
import {
  axisLabels,
  buildSeriesPlot,
  cursorReading,
  seriesHead,
  type SeriesKind,
  type SeriesPoint,
} from '../../screens/logic/aircraftSeries';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { timeScaleBar } from './timeScaleBar';
import { TrackPolyline, type Point2D } from './TrackPolyline';

/** Miejsce na podpisy osi pionowej po lewej - jak w profilu śladu. */
const AXIS_LEFT = 42;
/** Wysokość pola wykresu (`.chart-wrap` 158 px minus dolny pas podpisów osi). */
const PLOT_H = 122;
/** Dolny pas: podpisy dat (9) + odstęp (4) + podziałka (15) + margines (6). */
const AXIS_BOTTOM = 36;
const SCALE_LEFT = 8;
const SCALE_BOTTOM = 6;
const CURSOR_BOX_W = 150;

export interface ReadingsChartProps {
  kind: SeriesKind;
  title: string;
  points: readonly SeriesPoint[];
  /** Okno osi czasu - te same 90 dni, o które pytała karta; koniec = „teraz". */
  from: number;
  to: number;
  now: number;
  mhFormat: 'hhmm' | 'decimal';
  capacityL?: number | null;
  /** Ile dni obejmuje okno - do nagłówka („w 90 dni"). */
  days: number;
  /** Imię i nazwisko z cache członków - do podpisu kursora. */
  nameOf: (pilotId: string) => string | null;
  /** Legenda pod wykresem - napisy dobiera ekran (inne dla licznika, inne dla paliwa). */
  legend: { color: 'green' | 'blue' | 'dash'; label: string }[];
  /** Treść pod legendą (sumy okien) - w tej samej karcie, oddzielona włosem. */
  footer?: React.ReactNode;
}

export function ReadingsChart({
  kind,
  title,
  points,
  from,
  to,
  now,
  mhFormat,
  capacityL = null,
  days,
  nameOf,
  legend,
  footer,
}: ReadingsChartProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [width, setWidth] = useState(0);
  const [cursorAt, setCursorAt] = useState<number | null>(null);

  const measure = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);
  const plotW = Math.max(1, width - AXIS_LEFT - 10);

  const plot = useMemo(
    () => buildSeriesPlot({ kind, points, from, to, width: plotW, height: PLOT_H, capacityL }),
    [kind, points, from, to, plotW, capacityL],
  );
  const head = useMemo(() => seriesHead(kind, points, mhFormat, days), [kind, points, mhFormat, days]);

  const viewportRef = React.useRef({ scale: 1, offsetX: 0 });
  const gesture = useChartGesture({
    size: { width: plotW, height: PLOT_H },
    scrub: true,
    zoomable: true,
    zoomAxis: 'x',
    onScrub: useCallback(
      (point: Point2D | null) => {
        if (point == null) {
          setCursorAt(null);
          return;
        }
        const base = (point.x - viewportRef.current.offsetX) / viewportRef.current.scale;
        setCursorAt(timeAt(base, from, to, plotW));
      },
      [from, to, plotW],
    ),
  });
  viewportRef.current = gesture.viewport;
  const { scale, offsetX } = gesture.viewport;

  const timeX = (at: number): number => xOf(at, from, to, plotW) * scale + offsetX;
  const visible = { from: timeAt(-offsetX / scale, from, to, plotW), to: timeAt((plotW - offsetX) / scale, from, to, plotW) };
  const labels = axisLabels(visible, plotW, now);

  const timeScale = timeScaleBar((to - from) / (plotW * scale), Math.min(60, plotW * 0.3));
  const timeGrid: number[] = [];
  if (timeScale != null) {
    const step = timeScale.ms;
    for (let at = Math.ceil(visible.from / step) * step; at <= visible.to; at += step) timeGrid.push(timeX(at));
  }

  const cursor = cursorAt == null ? null : cursorReading(plot, cursorAt, kind, mhFormat, nameOf);
  const screenPoints: Point2D[] = plot.points.map((p) => ({ x: p.x * scale + offsetX, y: p.y }));

  const dotColor = (source: SeriesPoint['source']): string =>
    source === 'admin' || source === 'refuel' ? theme.colors.blue : theme.colors.green;

  return (
    <View style={s.card} onLayout={measure}>
      <View style={s.head}>
        <AppText variant="micro" tone="muted" style={s.title}>
          {title}
        </AppText>
        <AppText variant="mono" style={s.now}>
          {head.value ?? '—'}
          <AppText variant="mono" style={s.nowNote}>
            {`  ${head.note}`}
          </AppText>
        </AppText>
      </View>

      {/* Tło TAKIE SAMO, co pod profilem śladu (`bgTint`): pole pomiarowe, nie treść karty. */}
      <View style={[s.wrap, { height: PLOT_H + AXIS_BOTTOM, backgroundColor: theme.colors.bgTint }]}>
        {/* Siatka i podpisy pionu stoją POZA polem - oś pionowa się nie przybliża. */}
        {plot.grid.map((line) => (
          <View key={line.label + line.y}>
            <View style={[s.gridLine, { left: AXIS_LEFT, top: line.y, width: plotW, backgroundColor: theme.colors.border }]} />
            <AppText variant="micro" tone="muted" style={[s.axisLabel, { top: line.y - 5 }]}>
              {line.label}
            </AppText>
          </View>
        ))}

        {width > 0 && (
          <View style={[s.plotBox, { left: AXIS_LEFT, width: plotW, height: PLOT_H }]} {...gesture.panHandlers}>
            {timeGrid.map((x) => (
              <View key={x} style={[s.timeGridLine, { left: x, height: PLOT_H, backgroundColor: theme.colors.border }]} />
            ))}

            {/* Odcinki: WEWNĄTRZ operacji pełna zieleń, postój - szara przerywana (issue #75). */}
            {plot.runs.map((run) =>
              run.kind === 'engine' ? (
                <TrackPolyline
                  key={`${run.from}-${run.to}`}
                  points={screenPoints.slice(run.from, run.to + 1)}
                  color={theme.colors.green}
                  width={2}
                />
              ) : (
                <TrackPolyline
                  key={`${run.from}-${run.to}`}
                  points={screenPoints.slice(run.from, run.to + 1)}
                  color={theme.colors.textMuted}
                  width={1.6}
                  dash={[4, 4]}
                />
              ),
            )}

            {plot.points.map((p, i) => (
              <View
                key={`${p.at}-${i}`}
                pointerEvents="none"
                style={[s.dot, { left: screenPoints[i]!.x - 3, top: p.y - 3, backgroundColor: dotColor(p.source) }]}
              />
            ))}

            {cursor != null && (
              <View pointerEvents="none">
                <View
                  style={[s.cursor, { left: cursor.point.x * scale + offsetX, height: PLOT_H, backgroundColor: theme.colors.textPrimary }]}
                />
                <View
                  style={[
                    s.cursorDot,
                    { left: cursor.point.x * scale + offsetX - 4, top: cursor.point.y - 4, borderColor: theme.colors.textPrimary },
                  ]}
                />
                {/* Pudełko podpisu trzyma się wewnątrz pola: przy prawej krawędzi przeskakuje na lewo od kursora. */}
                <View
                  style={[
                    s.cursorBox,
                    {
                      left: Math.max(0, Math.min(plotW - CURSOR_BOX_W, cursor.point.x * scale + offsetX + 8)),
                      backgroundColor: theme.colors.bg,
                      borderColor: theme.colors.borderStrong,
                    },
                  ]}
                >
                  <AppText variant="micro" style={[s.cursorLabel, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                    {cursor.title}
                  </AppText>
                  <AppText variant="micro" style={[s.cursorSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {cursor.sub}
                  </AppText>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Podpisy osi czasu: z okna WIDOCZNEGO, więc po przybliżeniu mówią o tym, co widać. */}
        {labels.map((label) => (
          <AppText
            key={label.anchor}
            variant="micro"
            tone="muted"
            numberOfLines={1}
            style={[
              s.timeLabel,
              { top: PLOT_H + 6 },
              label.anchor === 'start'
                ? { left: AXIS_LEFT + 4 }
                : label.anchor === 'end'
                  ? { right: 8 }
                  : { left: AXIS_LEFT + plotW / 2 - 30, width: 60, textAlign: 'center' },
            ]}
          >
            {label.text}
          </AppText>
        ))}

        {/* PODZIAŁKA w lewym dolnym rogu - wskaźnik przybliżenia, jak na profilu śladu. */}
        {timeScale != null && (
          <View pointerEvents="none" style={s.timeScale}>
            <AppText variant="micro" tone="secondary">
              {timeScale.label}
            </AppText>
            <View style={[s.timeScaleBar, { width: timeScale.pixels, borderColor: theme.colors.textSecondary }]} />
          </View>
        )}
      </View>

      <View style={s.legend}>
        {legend.map((item) => (
          <View key={item.label} style={s.legendItem}>
            {item.color === 'dash' ? (
              <View style={[s.legendDash, { borderColor: theme.colors.textMuted }]} />
            ) : (
              <View style={[s.legendDot, { backgroundColor: item.color === 'blue' ? theme.colors.blue : theme.colors.green }]} />
            )}
            <AppText variant="micro" tone="muted" style={s.legendText}>
              {item.label}
            </AppText>
          </View>
        ))}
      </View>

      {footer != null && <View style={[s.footer, { borderTopColor: theme.colors.border }]}>{footer}</View>}
    </View>
  );
}

/** Chwila → X w polu wykresu (bez przybliżenia) - ten sam oddech na krańcach, co w `buildSeriesPlot`. */
function xOf(at: number, from: number, to: number, plotW: number): number {
  const pad = 10;
  return pad + ((at - from) / Math.max(1, to - from)) * Math.max(1, plotW - 2 * pad);
}

/** X w polu wykresu (bez przybliżenia) → chwila. Odwrotność `xOf`. */
function timeAt(x: number, from: number, to: number, plotW: number): number {
  const pad = 10;
  return from + ((x - pad) / Math.max(1, plotW - 2 * pad)) * (to - from);
}

const styles = (t: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      borderRadius: 14,
      overflow: 'hidden',
    },
    head: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 13,
      paddingTop: 10,
      paddingBottom: 6,
    },
    title: { letterSpacing: 1.5 },
    now: { fontSize: 10.5, letterSpacing: 1, color: t.colors.textPrimary },
    nowNote: { fontSize: 8.5, letterSpacing: 0.5, color: t.colors.textMuted },
    wrap: { position: 'relative' },
    gridLine: { position: 'absolute', height: 1 },
    axisLabel: { position: 'absolute', left: 0, width: AXIS_LEFT - 6, textAlign: 'right' },
    plotBox: { position: 'absolute', top: 0, overflow: 'hidden' },
    timeGridLine: { position: 'absolute', top: 0, width: 1, opacity: 0.7 },
    dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
    cursor: { position: 'absolute', top: 0, width: 1, opacity: 0.7 },
    cursorDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, backgroundColor: 'transparent' },
    cursorBox: {
      position: 'absolute',
      top: 4,
      width: CURSOR_BOX_W,
      borderRadius: 5,
      borderWidth: 1,
      paddingHorizontal: 6,
      paddingVertical: 4,
      gap: 2,
    },
    cursorLabel: { fontSize: 8, letterSpacing: 0.5 },
    cursorSub: { fontSize: 7.5, letterSpacing: 0.5 },
    timeLabel: { position: 'absolute' },
    timeScale: { position: 'absolute', left: SCALE_LEFT, bottom: SCALE_BOTTOM, gap: 2 },
    timeScaleBar: { height: 4, borderWidth: 1, borderTopWidth: 0 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 13, paddingTop: 7, paddingBottom: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 7, height: 7, borderRadius: 3.5 },
    legendDash: { width: 14, height: 0, borderTopWidth: 2, borderStyle: 'dashed' },
    legendText: { fontSize: 7.5, letterSpacing: 1 },
    footer: { borderTopWidth: StyleSheet.hairlineWidth },
  });
