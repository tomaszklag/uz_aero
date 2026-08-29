/**
 * UZ Aero - miniatura śladu SESJI (mockup `10-statystyki.html`, `.track-thumb`).
 *
 * Uproszczony zapis całego biegu silnika na ekranie sesji: linia i znaczniki startów,
 * lądowań oraz zrzutów. To jest szkic kształtu - „zapis istnieje, tyle było wyniesień
 * i tak z grubsza wyglądały" - a nie mapa do czytania.
 *
 * Czym różni się od `TrackMap` (14) i dlaczego to osobny komponent, a nie tryb tamtego:
 *  • **nie ma siatki, podziałki ani lotnisk.** W 168 px wysokości pas startowy schodzi
 *    do dwóch pikseli, a podziałka mówiłaby o skali rysunku, którego nikt nie mierzy.
 *  • **nie ma atrybucji** - i to jest konsekwencja powyższego, nie przeoczenie: podpis
 *    „© OpenStreetMap" jest wymogiem licencji dla PASÓW LOTNISK. Bez tych danych nie ma
 *    czego podpisywać, a podpis pod rysunkiem, który ich nie używa, byłby myleniem.
 *  • **znaczniki nie mają podpisów.** Przy skokach wszystkie starty i lądowania wypadają
 *    na tym samym placu, więc etykiety zlałyby się w plamę - godziny stoją wiersz niżej,
 *    na osi czasu. Rysunek mówi „ile ich było i gdzie", oś mówi „o której".
 *
 * Rysunek bez modułów natywnych: łamana z obróconych `<View>` (`TrackPolyline`), tak samo
 * jak pełna mapa.
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { boundsOf, fitBounds, toScreen, type LatLon, type TrackVertex } from '../../../domain';
import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { TrackPolyline, type Point2D } from './TrackPolyline';

/**
 * Znacznik do narysowania - ten sam zestaw rodzajów, co na pełnej mapie.
 *
 * `peak` przyjmujemy w typie, ale NIE rysujemy (patrz `dots`): miniatura nie ma miejsca
 * na podpisy, a maksimum bez liczby jest kropką, która niczego nie mówi.
 */
export interface TrackThumbnailMarker {
  kind: 'takeoff' | 'landing' | 'drop' | 'peak';
  position: TrackVertex | null;
}

export interface TrackThumbnailProps {
  line: readonly TrackVertex[];
  height: number;
  /** Szerokość; domyślnie miniatura wypełnia rodzica (karta ma własny padding). */
  width?: number;
  markers?: readonly TrackThumbnailMarker[];
  /** Wejście w pełny ślad (14). Bez tego miniatura jest samym rysunkiem. */
  onPress?: () => void;
}

/** Margines kadru (px) - mniejszy niż na 14, bo i rysunek jest mniejszy. */
const PADDING = 18;

export function TrackThumbnail({ line, height, width, markers, onPress }: TrackThumbnailProps) {
  const { theme } = useTheme();
  const [measured, setMeasured] = React.useState(width ?? 0);
  const boxWidth = width ?? measured;

  const view = useMemo(() => {
    if (boxWidth <= 0) return null;
    const bounds = boundsOf(line as readonly LatLon[]);
    if (bounds == null) return null;
    return fitBounds(bounds, boxWidth, height, PADDING);
  }, [line, boxWidth, height]);

  const points: Point2D[] = useMemo(
    () => (view == null ? [] : line.map((p) => toScreen(p, view))),
    [line, view],
  );

  /**
   * Znaczniki rysujemy z POZYCJI ZDARZEŃ, nie z końców linii.
   *
   * Do issue #38 miniatura stawiała kropkę na pierwszym i ostatnim punkcie zapisu -
   * co przy jednym locie było przybliżeniem, a przy trzech kłamstwem: pokazywała jeden
   * start i jedno lądowanie na sesję, która miała ich po trzy. Znacznik bez pozycji
   * (zapis nie sięga tej chwili) po prostu nie powstaje.
   */
  const dots = useMemo(() => {
    if (view == null || markers == null) return [];
    return markers
      .filter((marker) => marker.position != null && marker.kind !== 'peak')
      .map((marker, index) => ({
        key: `${marker.kind}-${index}`,
        kind: marker.kind,
        at: toScreen(marker.position!, view),
      }));
  }, [markers, view]);

  const body = (
    <View
      style={[styles.frame, { height, backgroundColor: theme.colors.bgTint }]}
      onLayout={(e) => {
        if (width == null) setMeasured(e.nativeEvent.layout.width);
      }}
    >
      <TrackPolyline points={points} color={theme.colors.green} width={2.5} />

      {dots.map((dot) => {
        if (dot.kind === 'takeoff') {
          return (
            <React.Fragment key={dot.key}>
              <View
                style={[
                  styles.ring,
                  { left: dot.at.x - 9, top: dot.at.y - 9, borderColor: theme.colors.green },
                ]}
              />
              <View
                style={[
                  styles.dot,
                  { left: dot.at.x - 5, top: dot.at.y - 5, backgroundColor: theme.colors.green },
                ]}
              />
            </React.Fragment>
          );
        }
        if (dot.kind === 'landing') {
          return (
            <View
              key={dot.key}
              style={[
                styles.dot,
                { left: dot.at.x - 4.5, top: dot.at.y - 4.5, backgroundColor: theme.colors.red },
              ]}
            />
          );
        }
        return (
          <View
            key={dot.key}
            style={[
              styles.ring,
              styles.dropRing,
              { left: dot.at.x - 5, top: dot.at.y - 5, borderColor: theme.colors.blue },
            ]}
          />
        );
      })}

      {onPress != null && (
        <View
          style={[
            styles.cta,
            { borderColor: theme.colors.greenBorder, backgroundColor: theme.colors.overlay },
          ]}
        >
          <AppText variant="micro" style={{ color: theme.colors.green }}>
            PEŁNY ŚLAD
          </AppText>
          <Icon name="next" size={9} color={theme.colors.green} />
        </View>
      )}
    </View>
  );

  if (onPress == null) return <View pointerEvents="none">{body}</View>;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Otwórz pełny ślad sesji" onPress={onPress}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'relative', overflow: 'hidden', width: '100%' },
  dot: { position: 'absolute', width: 9, height: 9, borderRadius: 5 },
  ring: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    opacity: 0.4,
  },
  /** Zrzut: sam pierścień, pełna krycie - ten sam język znaków, co na pełnej mapie. */
  dropRing: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.6, opacity: 1 },
  cta: {
    position: 'absolute',
    right: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
});
