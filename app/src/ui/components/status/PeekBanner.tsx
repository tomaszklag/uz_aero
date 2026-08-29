/**
 * UZ Aero - PeekBanner (`.ro-banner` z mockupu 04b)
 *
 * Baner podglądu cudzej sesji: ikona oka, nagłówek display, zdanie o tym, kto prowadzi
 * samolot, opcjonalne ostrzeżenie o wieku danych i **stopka z pochodzeniem danych**.
 *
 * Dlaczego to nie jest `Banner kind="status"`, skoro taksonomia z `CLAUDE.md` mówi, że
 * „tylko-odczyt" jest banerem statusu: bo `Banner` niesie tytuł + tekst i na tym kończy.
 * Ten ekran czyta CUDZĄ sesję z serwera, więc §4.8 wymaga, żeby razem ze stanem szła
 * informacja, SKĄD ten stan pochodzi i ile ma lat - a to trzecia linia, w środku tego
 * samego pudełka. Rozbicie jej na osobny `FreshnessNote` pod banerem rozłączyłoby
 * twierdzenie („silnik wyłączony") od jego zastrzeżenia („wg danych sprzed doby"),
 * czyli dokładnie to, przed czym §4.8 ostrzega.
 *
 * Druga różnica wobec `FreshnessNote`: tam `live` **milczy** (cisza = świeżo, bo wartość
 * dotyczy własnego samolotu). Tutaj milczeć nie wolno - nawet dane pobrane sekundę temu
 * opisują telefon innego pilota, więc stopka pojawia się w każdym stanie.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors, type Tone } from '../tone';

/** Fragment zdania; `strong` = wyróżnienie kolorem tekstu podstawowego (`.ro-text strong`). */
export interface PeekTextSegment {
  text: string;
  strong?: boolean;
}

export interface PeekBannerProps {
  /** Nagłówek display, np. „PODGLĄD - TYLKO ODCZYT". */
  title: string;
  /** Zdanie główne. Tablica segmentów pozwala wyróżnić fragment bez parsowania napisu. */
  text: PeekTextSegment[] | string;
  /** Ostrzeżenie o nieaktualności (mockup `.stale-warn`) - tylko przy danych z cache. */
  warning?: string | null;
  /** Stopka `.ro-meta`: skąd dane i z kiedy. Obowiązkowa - patrz nagłówek pliku. */
  meta: string;
  /** Kropka przy stopce: zielona = pobrane teraz, amber = z cache. */
  metaTone?: Tone;
  /** Ton całego pudełka: `blue` = informacja, `amber` = uwaga na wiek danych. */
  tone?: Tone;
  icon?: IconName;
  style?: ViewStyle;
}

export function PeekBanner({
  title,
  text,
  warning = null,
  meta,
  metaTone = 'green',
  tone = 'blue',
  icon = 'peek',
  style,
}: PeekBannerProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const metaC = toneColors(theme, metaTone);
  const segments: PeekTextSegment[] = typeof text === 'string' ? [{ text }] : text;

  return (
    <View
      style={[
        styles.banner,
        {
          paddingVertical: 14,
          paddingHorizontal: 15,
          borderRadius: theme.radius.lg,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <Icon name={icon} size={18} color={c.accent} style={styles.icon} />

      <View style={styles.body}>
        <AppText variant="display" style={[styles.title, { color: c.accent }]}>
          {title}
        </AppText>

        {/* Wyróżnienie idzie zagnieżdżonym <Text>, więc zdanie zostaje jednym akapitem
            i łamie się normalnie - sklejanie kilku osobnych napisów w wierszu psułoby
            zawijanie przy dłuższych kodach pilotów. */}
        <AppText variant="body" tone="secondary" style={styles.text}>
          {segments.map((segment, index) =>
            segment.strong === true ? (
              <AppText
                key={`${index}-${segment.text}`}
                variant="body"
                style={[
                  styles.text,
                  {
                    color: theme.colors.textPrimary,
                    fontFamily: theme.fontFamily.bodySemiBold,
                  },
                ]}
              >
                {segment.text}
              </AppText>
            ) : (
              segment.text
            ),
          )}
        </AppText>

        {warning != null && (
          <AppText variant="body" style={[styles.warning, { color: theme.colors.amber }]}>
            {warning}
          </AppText>
        )}

        <View style={styles.meta}>
          <View style={[styles.dot, { backgroundColor: metaC.accent }]} />
          <AppText variant="mono" tone="muted" style={styles.metaLabel}>
            {meta}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 18, lineHeight: 20, letterSpacing: 2 },
  text: { fontSize: 12, lineHeight: 18 },
  warning: { fontSize: 11, lineHeight: 17, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5, flexShrink: 0 },
  metaLabel: { flex: 1, fontSize: 9, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' },
});
