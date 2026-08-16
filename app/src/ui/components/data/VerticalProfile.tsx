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
import { TrackPolyline, type Point2D } from './TrackPolyline';

/** Miejsce na etykiety osi — pod wykresem czas, po lewej wysokość. */
const AXIS_LEFT = 42;
const AXIS_BOTTOM = 20;

/** Szerokość podpisu „08:20" w `micro` — do rozsuwania rzędów. */
const TIME_LABEL_W = 30;
const LABEL_ROW_H = 9;

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
}

export function VerticalProfile({
  profile,
  width,
  height,
  markers = [],
  cursorAt = null,
  onCursorChange,
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

    const toPoint = (time: number, altitudeFt: number): Point2D => ({
      x: AXIS_LEFT + ((time - t0) / spanMs) * plotW,
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
      baseline: 8 + plotH,
    };
  }, [profile, width, height]);

  // Rzędy podpisów przy ziemi liczymy dla WSZYSTKICH naraz, bo kolizja jest sprawą
  // między nimi, a nie cechą pojedynczego znacznika.
  const groundRows = useMemo(() => {
    if (plot == null) return [];
    const ground = markers.filter((m) => m.onCurve !== true);
    return assignLabelRows(
      ground.map((m) => plot.toPoint(m.at, 0).x),
      ground.map(() => TIME_LABEL_W),
    );
  }, [markers, plot]);

  /**
   * Na profilu osią jest CZAS, więc kursor to zwykłe przeliczenie X na chwilę —
   * inaczej niż na mapie, gdzie trzeba szukać najbliższego wierzchołka trasy.
   */
  const gesture = useChartGesture({
    size: { width, height },
    onScrub: useCallback(
      (point: Point2D | null) => {
        if (onCursorChange == null) return;
        if (point == null || plot == null) {
          onCursorChange(null);
          return;
        }
        const ratio = (point.x - AXIS_LEFT) / plot.plotW;
        const clamped = Math.min(1, Math.max(0, ratio));
        onCursorChange(plot.t0 + clamped * (plot.t1 - plot.t0));
      },
      [onCursorChange, plot],
    ),
  });

  if (plot == null) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <AppText variant="body" tone="muted">
          Brak odczytów wysokości w tym locie.
        </AppText>
      </View>
    );
  }

  // Cztery poziomy siatki — tyle mieści się czytelnie na wysokości telefonu.
  const gridSteps = [0, 1, 2, 3];
  let groundIndex = -1;

  return (
    <View style={{ width, height }} {...gesture.panHandlers}>
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

      <TrackPolyline points={plot.points} color={theme.colors.green} width={2} />

      {markers.map((marker, index) => {
        const x = plot.toPoint(marker.at, 0).x;

        if (marker.onCurve === true) {
          const y = plot.toPoint(marker.at, plot.altitudeAt(marker.at)).y;
          return (
            <View key={`${marker.at}-${index}`} pointerEvents="none">
              {/* Kreska prowadząca do osi — bez niej nie widać, kiedy to było. */}
              <View
                style={[
                  styles.guide,
                  { left: x, top: y, height: Math.max(0, plot.baseline + 7 - y), backgroundColor: marker.color },
                ]}
              />
              <View
                style={[styles.dot, { left: x - 3.5, top: y - 3.5, backgroundColor: marker.color }]}
              />
              <AppText
                variant="micro"
                style={[styles.curveTime, { right: width - x + 5, top: y - 12, color: marker.color }]}
              >
                {timeUtc(marker.at)}
              </AppText>
              {marker.note != null && (
                <AppText
                  variant="micro"
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
            <AppText
              variant="micro"
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
                left: plot.toPoint(cursorAt, 0).x,
                height: plot.plotH,
                backgroundColor: theme.colors.textPrimary,
              },
            ]}
          />
          <View
            style={[
              styles.cursorDot,
              {
                left: plot.toPoint(cursorAt, 0).x - 3,
                top: plot.toPoint(cursorAt, plot.altitudeAt(cursorAt)).y - 3,
                backgroundColor: theme.colors.textPrimary,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  gridLine: { position: 'absolute', height: 1 },
  axisLabel: { position: 'absolute', left: 0, width: AXIS_LEFT - 6, textAlign: 'right' },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5 },
  guide: { position: 'absolute', width: 1, opacity: 0.45 },
  curveTime: { position: 'absolute', textAlign: 'right' },
  curveNote: { position: 'absolute' },
  groundTime: { position: 'absolute', width: TIME_LABEL_W, textAlign: 'center' },
  cursor: { position: 'absolute', top: 8, width: 1, opacity: 0.5 },
  cursorDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
});
