/**
 * UZ Aero — profil pionowy lotu (mockup `14-slad.html`, sekcja „Profil pionowy").
 *
 * Wykres wysokości w czasie, rysowany tą samą techniką co ślad na mapie: łamana
 * z obróconych `<View>` (patrz `TrackPolyline`). Zero zależności natywnych.
 *
 * Profil jest w PEŁNI lokalny — liczy się z zapisu na telefonie, więc nie ma wariantu
 * offline: rysuje się identycznie z zasięgiem i bez. To odróżnia go od mapy, której
 * tło bywa niedostępne.
 *
 * Skala pionowa zaczyna się od DNA lotu, nie od zera: lot ze zrzutem odbywa się między
 * elewacją pola a 13 000 ft i rozciąganie osi do poziomu morza spłaszczyłoby cały
 * przebieg w pasek przy górnej krawędzi.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { timeUtc } from '../../format';
import type { FlightProfile } from '../../../domain';
import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { TrackPolyline, type Point2D } from './TrackPolyline';

/** Miejsce na etykiety osi — pod wykresem czas, po lewej wysokość. */
const AXIS_LEFT = 42;
const AXIS_BOTTOM = 20;

export interface VerticalProfileProps {
  profile: FlightProfile;
  width: number;
  height: number;
}

export function VerticalProfile({ profile, width, height }: VerticalProfileProps) {
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

    return {
      points: samples.map((s) => toPoint(s.time, s.altitudeFt)),
      toPoint,
      t0,
      t1,
      lowAlt,
      highAlt: maxAlt + pad,
      plotH,
      plotW,
    };
  }, [profile, width, height]);

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

  return (
    <View style={{ width, height }}>
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

      {/* Szczyt — przy skokach to wysokość zrzutu i najczęściej czytana liczba ekranu. */}
      {profile.peakAt != null && profile.peakAltitudeFt != null && (
        <PeakMarker
          point={plot.toPoint(profile.peakAt, profile.peakAltitudeFt)}
          color={theme.colors.blue}
          label={`${Math.round(profile.peakAltitudeFt).toLocaleString('pl-PL')} ft · ${timeUtc(profile.peakAt)}`}
        />
      )}

      <AppText variant="micro" tone="muted" style={[styles.timeLabel, { left: AXIS_LEFT }]}>
        {timeUtc(plot.t0)}
      </AppText>
      <AppText variant="micro" tone="muted" style={[styles.timeLabel, { right: 4 }]}>
        {timeUtc(plot.t1)}
      </AppText>
    </View>
  );
}

function PeakMarker({ point, color, label }: { point: Point2D; color: string; label: string }) {
  return (
    <View pointerEvents="none">
      <View style={[styles.peakDot, { left: point.x - 4, top: point.y - 4, backgroundColor: color }]} />
      <AppText
        variant="micro"
        style={[
          styles.peakLabel,
          // Etykieta ucieka w lewo, gdy szczyt wypadł przy prawej krawędzi.
          point.x > 180 ? { right: 4 } : { left: point.x + 8 },
          { top: point.y + 6, color },
        ]}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  gridLine: { position: 'absolute', height: 1 },
  axisLabel: { position: 'absolute', left: 0, width: AXIS_LEFT - 6, textAlign: 'right' },
  timeLabel: { position: 'absolute', bottom: 2 },
  peakDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  peakLabel: { position: 'absolute' },
});
