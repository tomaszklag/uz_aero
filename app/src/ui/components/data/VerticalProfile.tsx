/**
 * UZ Aero — profil pionowy sesji (mockup `14-slad.html`, sekcja „Profil pionowy").
 *
 * Wykres wysokości w czasie, rysowany tą samą techniką co ślad na mapie: łamana
 * z obróconych `<View>` (patrz `TrackPolyline`). Zero zależności natywnych.
 *
 * Skala pionowa zaczyna się od DNA lotu, nie od zera: lot ze zrzutem odbywa się między
 * elewacją pola a 13 000 ft i rozciąganie osi do poziomu morza spłaszczyłoby cały
 * przebieg w pasek przy górnej krawędzi.
 *
 * ══ ZNACZNIKI NA OBU WYKRESACH (issue #47 pkt 2) ══
 * Do issue #47 profil pokazywał sam szczyt, a mapa starty, lądowania i zrzuty — więc
 * dwa rysunki tej samej sesji podpisywały co innego i nie dało się przełożyć zdarzenia
 * z jednego na drugi. Odtąd oba niosą ten sam komplet, z CZASEM przy każdym znaczniku.
 * Podpisem jest sama godzina: rodzaj niesie kolor (ten sam, co w legendzie mapy), bo
 * pełne nazwy przy czterech znacznikach nie mieszczą się w szerokości telefonu —
 * sprawdzone na geometrii mockupu, nie na oko.
 */

import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { timeUtc } from '../../format';
import type { FlightProfile } from '../../../domain';
import { useChartGesture } from '../../hooks/useChartGesture';
import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { assignLabelRows } from './profileLabelRows';
import { timeScaleBar } from './timeScaleBar';
import { TrackPolyline, type Point2D } from './TrackPolyline';

/** Miejsce na etykiety osi — pod wykresem czas, po lewej wysokość. */
const AXIS_LEFT = 42;

/**
 * Dolny pas wykresu, rozpisany na składniki — bo mieszka w nim więcej niż jedna rzecz
 * i sumowanie „na oko" już raz kosztowało ucięte podpisy.
 *
 * Od dołu ku górze: margines, podziałka czasu (podpis + pasek), odstęp, do dwóch rzędów
 * godzin przy znacznikach, odstęp od linii ziemi.
 */
const LABEL_TOP_GAP = 5;
const LABEL_ROW_H = 9;
const LABEL_ROWS = 2;
const SCALE_GAP = 8;
/** Podpis (~9) + odstęp (2) + pasek (4). */
const SCALE_H = 15;
/** Te same wartości, co podziałka mapy (`TrackMap.styles.scale`) — ten sam róg ekranu. */
const SCALE_LEFT = 8;
const SCALE_BOTTOM = 6;

const AXIS_BOTTOM =
  LABEL_TOP_GAP + LABEL_ROWS * LABEL_ROW_H + SCALE_GAP + SCALE_H + SCALE_BOTTOM;

/**
 * Oddech na obu końcach osi czasu (px).
 *
 * Bez niego krzywa zaczynała się DOKŁADNIE na krawędzi pola i tak samo kończyła, a
 * podpis pierwszego i ostatniego znacznika — wyśrodkowany na swoim punkcie — wychodził
 * połową poza przycięte pole i był ucinany. Uruchomienie i wyłączenie silnika to dwie
 * najważniejsze godziny tego wykresu i akurat one traciły po pół napisu.
 */
const PLOT_PAD_X = 16;

/** Szerokość podpisu „08:20" w `micro` — do rozsuwania rzędów. */
const TIME_LABEL_W = 36;

/**
 * Znacznik na profilu. Kolor i podpis dobiera EKRAN — komponent nie zna rodzajów
 * zdarzeń, tak samo jak `TrackMap` (`TrackMapMarker`).
 */
export interface VerticalProfileMarker {
  at: number;
  color: string;
  /**
   * Znacznik siedzi NA KRZYWEJ (zrzut, szczyt) zamiast przy ziemi (start, lądowanie).
   * Ten na krzywej dostaje pionową kreskę prowadzącą do osi — bez niej nie da się
   * odczytać, w którym miejscu osi czasu wypadł.
   */
  onCurve?: boolean;
  /** Podpis dodatkowy przy znaczniku na krzywej — dziś wyłącznie „MAX 12 840 ft". */
  note?: string | null;
}

export interface VerticalProfileProps {
  profile: FlightProfile;
  width: number;
  height: number;
  markers?: readonly VerticalProfileMarker[];
  /**
   * Chwila pod palcem (issue #47 pkt 7) — kursor sprzężony z mapą. `null` = brak gestu.
   * Kursorem na profilu jest CHWILA, więc rysuje się pionową kreską przez cały wykres.
   */
  cursorAt?: number | null;
  /** Palec na profilu wskazał chwilę (albo zszedł: `null`). */
  onCursorChange?: (at: number | null) => void;
  /**
   * Droga narastająco (NM) w danej chwili — z geometrii śladu. Bez niej podziałka
   * podaje sam czas; z nią dokłada dystans dla odcinka, który obejmuje (patrz niżej).
   */
  distanceNmAt?: (at: number) => number | null;
}

export function VerticalProfile({
  profile,
  width,
  height,
  markers = [],
  cursorAt = null,
  onCursorChange,
  distanceNmAt,
}: VerticalProfileProps) {
  const { theme } = useTheme();

  const plot = useMemo(() => {
    const { samples } = profile;
    if (samples.length < 2) return null;

    const plotW = Math.max(1, width - AXIS_LEFT - 8);
    const plotH = Math.max(1, height - AXIS_BOTTOM - 8);

    const t0 = samples[0]!.time;
    const t1 = samples[samples.length - 1]!.time;
    const spanMs = Math.max(1, t1 - t0);

    const altitudes = samples.map((s) => s.altitudeFt);
    const minAlt = Math.min(...altitudes);
    const maxAlt = Math.max(...altitudes);
    // Margines 5 % u góry i dołu, żeby szczyt nie dotykał krawędzi ramki.
    const pad = Math.max(50, (maxAlt - minAlt) * 0.05);
    const lowAlt = minAlt - pad;
    const spanAlt = Math.max(1, maxAlt + pad - lowAlt);

    /** Szerokość NA KRZYWĄ — pole minus oddech z obu stron. */
    const spanW = Math.max(1, plotW - 2 * PLOT_PAD_X);

    const toPoint = (time: number, altitudeFt: number): Point2D => ({
      x: AXIS_LEFT + PLOT_PAD_X + ((time - t0) / spanMs) * spanW,
      y: 8 + plotH - ((altitudeFt - lowAlt) / spanAlt) * plotH,
    });

    /** Wysokość w dowolnej chwili — interpolacja liniowa między próbkami. */
    const altitudeAt = (time: number): number => {
      if (time <= samples[0]!.time) return samples[0]!.altitudeFt;
      const last = samples[samples.length - 1]!;
      if (time >= last.time) return last.altitudeFt;

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1]!;
        const b = samples[i]!;
        if (time <= b.time) {
          const span = b.time - a.time;
          if (span <= 0) return b.altitudeFt;
          return a.altitudeFt + ((b.altitudeFt - a.altitudeFt) * (time - a.time)) / span;
        }
      }
      return last.altitudeFt;
    };

    return {
      points: samples.map((s) => toPoint(s.time, s.altitudeFt)),
      toPoint,
      altitudeAt,
      t0,
      t1,
      lowAlt,
      highAlt: maxAlt + pad,
      plotH,
      plotW,
      spanW,
      baseline: 8 + plotH,
    };
  }, [profile, width, height]);

  /**
   * Gest siedzi na POLU WYKRESU, nie na całym komponencie: dzięki temu współrzędne
   * dotknięcia są od razu w układzie pola (bez `AXIS_LEFT`), a przybliżenie ma ten sam
   * mianownik, co przycinanie. Zoom jest wyłącznie POZIOMY — rozciąga czas, bo to on
   * rozdziela zdarzenia leżące na sobie; wysokość jest już dobrana do zakresu lotu.
   */
  const gesture = useChartGesture({
    size: { width: plot?.plotW ?? width, height },
    zoomable: true,
    zoomAxis: 'x',
    onScrub: useCallback(
      (point: Point2D | null) => {
        if (onCursorChange == null) return;
        if (point == null || plot == null) {
          onCursorChange(null);
          return;
        }
        // Z ekranu → przez kadr → przez oddech na krańcach → na oś czasu.
        const base = (point.x - viewportRef.current.offsetX) / viewportRef.current.scale;
        const ratio = Math.min(1, Math.max(0, (base - PLOT_PAD_X) / plot.spanW));
        onCursorChange(plot.t0 + ratio * (plot.t1 - plot.t0));
      },
      [onCursorChange, plot],
    ),
  });

  const viewportRef = React.useRef(gesture.viewport);
  viewportRef.current = gesture.viewport;

  /** Chwila → X w polu wykresu, już po przybliżeniu. */
  const timeX = useCallback(
    (at: number): number => {
      if (plot == null) return 0;
      const base =
        PLOT_PAD_X + ((at - plot.t0) / Math.max(1, plot.t1 - plot.t0)) * plot.spanW;
      return base * gesture.viewport.scale + gesture.viewport.offsetX;
    },
    [plot, gesture.viewport],
  );

  // Rzędy podpisów przy ziemi liczymy dla WSZYSTKICH naraz, bo kolizja jest sprawą
  // między nimi, a nie cechą pojedynczego znacznika. Przy przybliżeniu znaczniki się
  // rozjeżdżają, więc rzędów ubywa samo z siebie.
  const groundRows = useMemo(() => {
    if (plot == null) return [];
    const ground = markers.filter((m) => m.onCurve !== true);
    return assignLabelRows(
      ground.map((m) => timeX(m.at)),
      ground.map(() => TIME_LABEL_W),
    );
  }, [markers, plot, timeX]);

  if (plot == null) {
    return (
      <View style={[styles.empty, { width, height, backgroundColor: theme.colors.bgTint }]}>
        <AppText variant="body" tone="muted">
          Brak odczytów wysokości w tym locie.
        </AppText>
      </View>
    );
  }

  // Cztery poziomy siatki — tyle mieści się czytelnie na wysokości telefonu.
  const gridSteps = [0, 1, 2, 3];
  let groundIndex = -1;

  const { scale, offsetX } = gesture.viewport;

  /**
   * Podziałka czasu — wskaźnik przybliżenia profilu, dokładnie jak podziałka odległości
   * na mapie: przy przybliżeniu czyta „2 min" zamiast „15 min". Bez niej po zoomie
   * między dwoma znacznikami nie było ani jednej liczby o czasie.
   */
  const timeScale = timeScaleBar(
    (plot.t1 - plot.t0) / (plot.spanW * scale),
    Math.min(70, plot.spanW * 0.3),
  );

  /**
   * SIATKA PIONOWA co jeden krok podziałki — czyli jedna kratka = to, co mówi pasek.
   * Dzięki temu siatka nie jest tłem dla ozdoby, tylko odczytem: „ten garb ma dwie
   * kratki, czyli pół godziny". Linie jadą razem z wykresem (są w przyciętym polu),
   * bo opisują CZAS, a nie ramkę.
   */
  const timeGrid: Array<{ at: number; x: number }> = [];
  if (timeScale != null) {
    const step = timeScale.ms;
    // Zaczynamy od okrągłej wielokrotności kroku — linie padają na pełne kwadranse
    // i minuty, a nie na przypadkową godzinę początku nagrania.
    for (let at = Math.ceil(plot.t0 / step) * step; at <= plot.t1; at += step) {
      const x = timeX(at);
      if (x >= -1 && x <= plot.plotW + 1) timeGrid.push({ at, x });
    }
  }

  /**
   * Droga dla ODCINKA, który obejmuje pasek — nie „NM na piksel".
   *
   * Na osi czasu dystans nie jest proporcjonalny (pięć minut wznoszenia to inna droga
   * niż pięć minut przelotu, a pięć minut postoju to zero), więc jedyną uczciwą
   * odpowiedzią jest droga między DWIEMA KONKRETNYMI chwilami: początkiem paska tam,
   * gdzie stoi, i końcem o krok dalej. Liczba zmienia się przy przesuwaniu wykresu
   * i tak ma być — w innym miejscu lotu samolot leciał inaczej.
   */
  const scaleDistanceNm = (() => {
    if (timeScale == null || distanceNmAt == null) return null;
    // Odcinek liczymy od LEWEJ KRAWĘDZI pola wykresu (pasek stoi pod podpisami
    // wysokości, czyli poza wykresem — jego własne `x` nie leży nad danymi).
    const from = timeAtX(0, plot, gesture.viewport);
    const to = timeAtX(timeScale.pixels, plot, gesture.viewport);
    const a = distanceNmAt(from);
    const b = distanceNmAt(to);
    return a == null || b == null ? null : Math.abs(b - a);
  })();
  /** Punkt krzywej w układzie POLA WYKRESU (bez `AXIS_LEFT`), po przybliżeniu. */
  const curvePoints: Point2D[] = plot.points.map((point) => ({
    x: (point.x - AXIS_LEFT) * scale + offsetX,
    y: point.y,
  }));

  return (
    // Tło TAKIE SAMO, co pod mapą (`bgTint`): oba wykresy są polem pomiarowym, a nie
    // treścią karty, i mają się od niej odcinać tak samo.
    <View style={{ width, height, backgroundColor: theme.colors.bgTint }}>
      {/* Siatka i podpisy wysokości stoją POZA polem wykresu: oś pionowa się nie
          przybliża, więc nie ma powodu, żeby jechała razem z trasą. */}
      {gridSteps.map((i) => {
        const ratio = i / (gridSteps.length - 1);
        const y = 8 + plot.plotH * ratio;
        const altitude = plot.highAlt - (plot.highAlt - plot.lowAlt) * ratio;
        return (
          <View key={i}>
            <View
              style={[
                styles.gridLine,
                { left: AXIS_LEFT, top: y, width: plot.plotW, backgroundColor: theme.colors.border },
              ]}
            />
            <AppText variant="micro" tone="muted" style={[styles.axisLabel, { top: y - 5 }]}>
              {Math.round(altitude).toLocaleString('pl-PL')}
            </AppText>
          </View>
        );
      })}

      {/* POLE WYKRESU: wszystko, co jedzie z czasem, siedzi w przyciętym pudełku —
          przy przybliżeniu trasa i podpisy wyjeżdżają poza kadr zamiast wchodzić
          na podpisy wysokości po lewej. */}
      <View
        style={[styles.plotBox, { left: AXIS_LEFT, width: plot.plotW, height }]}
        {...gesture.panHandlers}
      >
        {/* Siatka pionowa co JEDEN KROK PODZIAŁKI — jedna kratka to dokładnie tyle,
            ile mówi pasek na dole. Dzięki temu siatka jest odczytem („ten garb ma dwie
            kratki, czyli pół godziny"), a nie tłem. Jedzie razem z wykresem, bo opisuje
            czas, a nie ramkę — tak samo jak siatka współrzędnych na mapie opisuje teren. */}
        {timeGrid.map((line) => (
          <View
            key={line.at}
            style={[
              styles.timeGridLine,
              { left: line.x, height: plot.baseline - 8, backgroundColor: theme.colors.border },
            ]}
          />
        ))}

        <TrackPolyline points={curvePoints} color={theme.colors.green} width={2} />

        {markers.map((marker, index) => {
          const x = timeX(marker.at);

          if (marker.onCurve === true) {
            const y = plot.toPoint(marker.at, plot.altitudeAt(marker.at)).y;
            return (
              <View key={`${marker.at}-${index}`} pointerEvents="none">
                {/* Kreska prowadząca do osi — bez niej nie widać, kiedy to było. */}
                <View
                  style={[
                    styles.guide,
                    {
                      left: x,
                      top: y,
                      height: Math.max(0, plot.baseline + 7 - y),
                      backgroundColor: marker.color,
                    },
                  ]}
                />
                <View
                  style={[styles.dot, { left: x - 3.5, top: y - 3.5, backgroundColor: marker.color }]}
                />
                <AppText
                  variant="micro"
                  numberOfLines={1}
                  style={[
                    styles.curveTime,
                    { right: plot.plotW - x + 5, top: y - 12, color: marker.color },
                  ]}
                >
                  {timeUtc(marker.at)}
                </AppText>
                {marker.note != null && (
                  <AppText
                    variant="micro"
                    numberOfLines={1}
                    style={[styles.curveNote, { left: x + 6, top: y - 12, color: marker.color }]}
                  >
                    {marker.note}
                  </AppText>
                )}
              </View>
            );
          }

          groundIndex += 1;
          const row = groundRows[groundIndex] ?? 0;
          return (
            <View key={`${marker.at}-${index}`} pointerEvents="none">
              <View
                style={[
                  styles.dot,
                  { left: x - 3.5, top: plot.baseline - 3.5, backgroundColor: marker.color },
                ]}
              />
              {/* `numberOfLines` jest tu WARUNKIEM POPRAWNOŚCI, nie ozdobą: pudełko ma
                  stałą szerokość, więc godzina odrobinę szersza od niego łamała się na
                  dwie linie i oś czasu robiła się dwurzędowa (zgłoszenie z przeglądu). */}
              <AppText
                variant="micro"
                numberOfLines={1}
                style={[
                  styles.groundTime,
                  {
                    left: x - TIME_LABEL_W / 2,
                    top: plot.baseline + 5 + row * LABEL_ROW_H,
                    color: marker.color,
                  },
                ]}
              >
                {timeUtc(marker.at)}
              </AppText>
            </View>
          );
        })}

        {/* Kursor sprzężony z mapą — biały, bo nie jest zdarzeniem rejestru. */}
        {cursorAt != null && (
          <View pointerEvents="none">
            <View
              style={[
                styles.cursor,
                {
                  left: timeX(cursorAt),
                  height: plot.plotH,
                  backgroundColor: theme.colors.textPrimary,
                },
              ]}
            />
            <View
              style={[
                styles.cursorDot,
                {
                  left: timeX(cursorAt) - 3,
                  top: plot.toPoint(cursorAt, plot.altitudeAt(cursorAt)).y - 3,
                  backgroundColor: theme.colors.textPrimary,
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* PODZIAŁKA — poza polem wykresu, w tym samym rogu i o tych samych odstępach,
          co podziałka odległości na mapie (`TrackMap.styles.scale`). Dwa wykresy
          jednego ekranu trzymają skale w jednym miejscu, więc oko szuka ich raz.
          Dystans dotyczy ODCINKA obejmowanego przez pasek, a nie „NM na piksel" —
          na osi czasu proporcji między czasem a drogą po prostu nie ma. */}
      {timeScale != null && (
        <View pointerEvents="none" style={styles.timeScale}>
          <AppText variant="micro" tone="secondary">
            {timeScale.label}
            {scaleDistanceNm != null && ` · ${scaleDistanceNm.toFixed(1)} NM`}
          </AppText>
          <View
            style={[
              styles.timeScaleBar,
              { width: timeScale.pixels, borderColor: theme.colors.textSecondary },
            ]}
          />
        </View>
      )}
    </View>
  );
}

/** X w polu wykresu → chwila. Odwrotność `timeX`; używa jej odczyt drogi dla paska. */
function timeAtX(
  x: number,
  plot: { t0: number; t1: number; spanW: number },
  viewport: { scale: number; offsetX: number },
): number {
  const base = (x - viewport.offsetX) / viewport.scale;
  const ratio = (base - PLOT_PAD_X) / plot.spanW;
  return plot.t0 + ratio * (plot.t1 - plot.t0);
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  plotBox: { position: 'absolute', top: 0, overflow: 'hidden' },
  gridLine: { position: 'absolute', height: 1 },
  axisLabel: { position: 'absolute', left: 0, width: AXIS_LEFT - 6, textAlign: 'right' },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5 },
  guide: { position: 'absolute', width: 1, opacity: 0.45 },
  curveTime: { position: 'absolute', textAlign: 'right' },
  curveNote: { position: 'absolute' },
  groundTime: { position: 'absolute', width: TIME_LABEL_W, textAlign: 'center' },
  timeGridLine: { position: 'absolute', top: 8, width: 1 },
  // LEWY DOLNY róg — te same `left`/`bottom`, co podziałka mapy.
  timeScale: { position: 'absolute', left: SCALE_LEFT, bottom: SCALE_BOTTOM, gap: 2 },
  timeScaleBar: { height: 4, borderWidth: 1, borderTopWidth: 0 },
  cursor: { position: 'absolute', top: 8, width: 1, opacity: 0.5 },
  cursorDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
});
