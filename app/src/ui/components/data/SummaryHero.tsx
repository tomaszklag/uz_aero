/**
 * UZ Aero — SummaryHero (`.summary-card` z mockupu 03)
 *
 * Karta „to zaraz zapiszesz": kod obiektu z ikoną, wielki napis display i tagi kontekstu.
 * Wyróżniona tonem zamiast szarej powierzchni — na ekranie potwierdzenia ma być
 * oczywiste, czego dotyczy decyzja, zanim pilot zacznie czytać siatkę szczegółów.
 *
 * Mockup używa delikatnego gradientu (8% → 4% zieleni). Rysujemy płaskie `muted` z tokenów:
 * gradient wymagałby `expo-linear-gradient` (moduł natywny, przebudowa dev clienta),
 * a różnica na 4 punktach krycia jest niewidoczna na telefonie.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Tag } from './Tag';
import { toneColors, type Tone } from './tone';

export interface SummaryHeroProps {
  /** Kod obiektu — znak samolotu. */
  code: string;
  /** Dopisek przy kodzie (typ, rocznik). */
  codeDetail?: string | null;
  icon?: IconName;
  /** Główny napis: trasa („EPKK → EPWA") albo podsumowanie dnia. */
  title: string;
  /** Tagi kontekstu: rodzaj operacji, data. */
  tags?: string[];
  tone?: Tone;
  style?: ViewStyle;
}

export function SummaryHero({
  code,
  codeDetail,
  icon = 'aircraft',
  title,
  tags = [],
  tone = 'green',
  style,
}: SummaryHeroProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      style={[
        {
          gap: 10,
          padding: 18,
          borderRadius: 20,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <View style={styles.codeRow}>
        <Icon name={icon} size={20} color={c.accent} />
        <AppText
          variant="mono"
          style={{
            fontFamily: theme.fontFamily.monoBold,
            fontSize: 22,
            lineHeight: 26,
            letterSpacing: 2,
            color: c.accent,
          }}
        >
          {code}
        </AppText>
        {codeDetail != null && (
          <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.codeDetail}>
            {codeDetail}
          </AppText>
        )}
      </View>

      <AppText variant="display" style={styles.title}>
        {title}
      </AppText>

      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.map((t) => (
            <Tag key={t} label={t} tone={tone} size="md" />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeDetail: { flexShrink: 1, fontSize: 10, letterSpacing: 0.5 },
  title: { fontSize: 32, lineHeight: 34, letterSpacing: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
