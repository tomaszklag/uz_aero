/**
 * UZ Aero - DayCard (`.day-card` z mockupów 12 i 01)
 *
 * Karta SESJI: nagłówek display + samolot, godziny biegu silnika, rząd statystyk,
 * opcjonalna stopka z tagami i pas akcji.
 *
 * JEDEN KOMPONENT NA OBA EKRANY (issue #42, 2026-08-13): „Poprzednie dni" (12) i „Mój
 * dzień" (01). Do 2026-08-13 ekran domowy rysował te same trzy wielkości własną tabelą
 * `.leg-row` - dwa układy jednej rzeczy w aplikacji, która ma ich w sumie kilkanaście.
 * Stąd `title` zamiast `date`: nagłówkiem jest data (12, kafelki z różnych dni) albo
 * numer sesji w dobie (01, gdzie data stoi w nagłówku ekranu).
 *
 * Dwa warianty pasa: `editable` (sesja w oknie korekty) jest niebieski - kolor
 * informacyjny, bo korekta to opcja, a nie następny krok procedury; wariant neutralny
 * to PODGLĄD sesji po oknie (issue #35 pkt 2) ORAZ cała lista na 01, gdzie wszystkie
 * sesje są w oknie i błękit przy każdej przestałby cokolwiek znaczyć (ta sama reguła,
 * dla której SyncChip online nie rysuje nic - issue #12). Kartę bez pasa też wolno
 * kliknąć, ale pas mówi wprost, co się stanie - bez niego karta wygląda na martwą.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { fontFamily } from '../../theme/tokens';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors } from '../tone';

export interface DayCardProps {
  /** Nagłówek kafelka: „22 CZERWCA 2026" (12) albo „OPERACJA 1" (01). */
  title: string;
  /**
   * SYGNATURA OPERACJI - „SP-AXA/2026-09-01/AKO/1" (issue #68).
   *
   * ZASTĘPUJE znak samolotu, a nie stoi obok niego: sygnatura zaczyna się od tego
   * samego znaku, więc para powtarzałaby go dwa razy w odległości centymetra. Znak
   * wraca tam, gdzie sygnatury nie ma z czego złożyć (maszyna spoza cache'u floty,
   * operacja bez biegu silnika) - kafelek wygląda wtedy jak przed issue #68.
   *
   * Własna linia, a nie prawa krawędź tytułu: identyfikatora nie wolno skrócić
   * wielokropkiem, a 23 znaki w połowie szerokości telefonu skrócić trzeba.
   */
  signature?: string | null;
  /** Znak samolotu („SP-AXA") - pokazywany, gdy nie ma sygnatury. */
  aircraft: string;
  /** Godziny biegu silnika („08:12 → 10:34 UTC"); `null` = silnik nie ruszył. */
  times?: string | null;
  /** Rząd statystyk (Loty / Blok / Lot). */
  stats: { k: string; v: string }[];
  /**
   * Plakietka przy tytule - dziś wyłącznie „RĘCZNIE" dla sesji wpisanej po fakcie
   * (ekran 15, decyzja 2026-08-16). Przy tytule, bo mówi o CAŁEJ sesji; wiersze osi
   * znaczników nie dostają (issue #40 pkt 6).
   */
  titleTag?: string;
  /** Stopka: tagi stanu i przypisy. Pominięta = karta kończy się na statystykach. */
  foot?: React.ReactNode;
  /** Sesja w oknie korekty - niebieska ramka i niebieski pas akcji. */
  editable?: boolean;
  /** Etykieta pasa akcji; bez niej pasa nie ma. */
  ctaLabel?: string;
  /** Ikona pasa akcji - ołówek dla korekty, oko dla podglądu. */
  ctaIcon?: IconName;
  onPress?: () => void;
  style?: ViewStyle;
}

export function DayCard({
  title,
  signature = null,
  aircraft,
  times = null,
  stats,
  titleTag,
  foot,
  editable = false,
  ctaLabel,
  ctaIcon = 'edit',
  onPress,
  style,
}: DayCardProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');

  return (
    <Pressable
      accessibilityRole={onPress != null ? 'button' : undefined}
      disabled={onPress == null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: editable ? blue.muted : theme.colors.surface,
          borderColor: editable
            ? pressed
              ? blue.accent
              : blue.border
            : pressed
              ? theme.colors.borderStrong
              : theme.colors.border,
          borderWidth: theme.borderWidth,
          borderRadius: theme.radius.btn,
          opacity: pressed && onPress != null ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <AppText variant="display" style={styles.title}>
            {title}
          </AppText>
          {titleTag != null && (
            <AppText
              variant="mono"
              tone="muted"
              style={[styles.titleTag, { borderColor: theme.colors.borderStrong }]}
            >
              {titleTag}
            </AppText>
          )}
        </View>
        {/* ZNAK NIE MOŻE ZAGŁODZIĆ TYTUŁU (zgłoszenie z urządzenia, 2026-08-30).
            Napis bez ograniczenia zawijał się na całą szerokość i spychał tytuł razem
            z plakietką do jednej kolumny znaków - kafelek wyglądał jak usterka
            rysowania. Wywołało to co innego (identyfikator zamiast znaku, patrz
            `buildMyDay`), ale rama ma być odporna na DŁUGĄ wartość niezależnie od
            tego, skąd się wzięła: jedna linia i skracanie. */}
        {signature == null && (
          <AppText
            variant="mono"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.aircraft, { color: theme.colors.green }]}
          >
            {aircraft}
          </AppText>
        )}
      </View>

      {signature != null && (
        <AppText variant="mono" style={[styles.signature, { color: theme.colors.green }]}>
          {signature}
        </AppText>
      )}

      {times != null && (
        <AppText variant="mono" tone="muted" style={styles.times}>
          {times}
        </AppText>
      )}

      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.k} style={styles.stat}>
            <AppText variant="label" tone="muted" style={styles.statK}>
              {stat.k}
            </AppText>
            <AppText variant="mono" tone="secondary" style={styles.statV}>
              {stat.v}
            </AppText>
          </View>
        ))}
      </View>

      {/* Stopka tylko wtedy, gdy ma co powiedzieć - pusty pas z kreską nad nim wygląda
          jak treść, która się nie doczytała (issue #35 pkt 3 i 4 zabrały jej oba
          domyślne tagi: „Wysłane" i „Okno minęło"). */}
      {foot != null && (
        <View
          style={[
            styles.foot,
            { borderTopColor: theme.colors.border, borderTopWidth: theme.borderWidth },
          ]}
        >
          {foot}
        </View>
      )}

      {ctaLabel != null && (
        <View
          style={[
            styles.cta,
            {
              backgroundColor: editable ? blue.muted : theme.colors.surfaceRaised,
              borderColor: editable ? blue.border : theme.colors.borderStrong,
              borderWidth: theme.borderWidth,
            },
          ]}
        >
          <Icon
            name={ctaIcon}
            size={15}
            color={editable ? blue.accent : theme.colors.textSecondary}
          />
          {/* `buttonSmall`, nie `display` z ręcznym rozmiarem: to token etykiety
              przycisku (Bebas 16 / ls 2) - dokładnie ten, którym pisze `ActionButton`
              w rozmiarze `md`, czyli przyciski pod listą na 01. Liczby są te same, co
              wpisane wcześniej ręcznie; nazwa mówi, dlaczego akurat te (issue #42). */}
          <AppText
            variant="buttonSmall"
            style={{ color: editable ? blue.accent : theme.colors.textSecondary }}
          >
            {ctaLabel}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 13, paddingHorizontal: 14, gap: 9 },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  title: { fontSize: 21, lineHeight: 22, letterSpacing: 1.5 },
  // Plakietka-przypis: mały mono w ramce, bez wypełnienia - fakt o pochodzeniu
  // zapisu, nie stan ostrzegawczy, więc bez amber.
  titleTag: {
    fontSize: 7.5,
    lineHeight: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  // `flexShrink` z `maxWidth`: znak ustępuje tytułowi, ale nie znika do zera.
  aircraft: { fontSize: 11, letterSpacing: 1.5, flexShrink: 1, maxWidth: '55%' },
  /* Sygnatura: ten sam stopień co znak, ale WĘŻSZY odstęp międzyliterowy - 1,5 przy
     23 znakach rozpychało napis na całą szerokość i kleiło go do krawędzi karty.
     Bez `numberOfLines`: identyfikator ucięty wielokropkiem przestaje identyfikować,
     więc w skrajnym wypadku ma się zawinąć, a nie zniknąć. */
  signature: { fontSize: 11, lineHeight: 14, letterSpacing: 0.5, marginTop: -4 },
  /** `.day-times` - dosunięte do daty ujemnym marginesem, tak jak w mockupie. */
  times: { fontSize: 10, lineHeight: 13, letterSpacing: 0.5, marginTop: -5 },
  stats: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  stat: { gap: 2 },
  statK: { fontSize: 8, letterSpacing: 1.5 },
  statV: { fontSize: 13, fontFamily: fontFamily.monoBold },
  /** Zawijany rząd plakietek: od zera do trzech elementów, więc bez `space-between`. */
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 11,
  },
});
