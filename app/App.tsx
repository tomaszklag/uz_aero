/**
 * UZ Aero — ekran DEMO / style guide (Faza 1, fundament Design System).
 *
 * Dowód, że system motywów działa: przełącznik motywów na górze przemalowuje
 * na żywo wszystkie próbki kolorów, warianty typografii i SyncChip.
 *
 * To NIE jest ekran aplikacji — to katalog tokenów i prymitywów.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';

import { ThemeProvider, useTheme } from './src/theme';
import { AppText, Screen, SyncChip, ThemePicker } from './src/components';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StyleGuide />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function StyleGuide() {
  const { theme, ready } = useTheme();

  const [fontsLoaded, fontError] = useFonts({
    BebasNeue_400Regular,
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  const appReady = ready && (fontsLoaded || fontError != null);

  if (!appReady) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.green} size="large" />
      </View>
    );
  }

  const colorEntries = Object.entries(theme.colors) as [string, string][];

  return (
    <Screen scroll>
      <StatusBar style={theme.isLight ? 'dark' : 'light'} />

      {/* ── Nagłówek ── */}
      <AppText variant="display" style={styles.brand}>
        UZ AERO
      </AppText>
      <AppText variant="mono" tone="muted" style={styles.subtitle}>
        DESIGN SYSTEM · FAZA 1 · MOTYW: {theme.name.toUpperCase()}
      </AppText>

      {/* ── Przełącznik motywów ── */}
      <ThemePicker style={styles.block} />
      <AppText variant="body" tone="secondary" style={styles.caption}>
        Dotknij motywu — cały ekran przemalowuje się z tokenów. Wybór zapisuje się (AsyncStorage).
      </AppText>

      {/* ── SyncChip ── */}
      <SectionTitle>SyncChip · wskaźnik łączności</SectionTitle>
      <View style={styles.chipRow}>
        <SyncChip status="synced" />
        <SyncChip status="offline" outboxCount={7} />
      </View>

      {/* ── Typografia ── */}
      <SectionTitle>Typografia</SectionTitle>
      <View style={styles.typeList}>
        <TypeRow label="display · Bebas Neue">
          <AppText variant="display">UZ AERO CLIMB</AppText>
        </TypeRow>
        <TypeRow label="timer · JetBrains Mono (waga + w jasnych)">
          <AppText variant="timer">00:53:14</AppText>
        </TypeRow>
        <TypeRow label="param · param_value">
          <AppText variant="param">142</AppText>
        </TypeRow>
        <TypeRow label="paramLabel · param_label">
          <AppText variant="paramLabel" tone="muted">
            Ground Speed
          </AppText>
        </TypeRow>
        <TypeRow label="body · Archivo">
          <AppText variant="body">
            Brak sieci nigdy nie blokuje pracy pilota — sieć to okazja do synca.
          </AppText>
        </TypeRow>
        <TypeRow label="label · Archivo SemiBold">
          <AppText variant="label">POTWIERDŹ I ZACZNIJ DZIEŃ</AppText>
        </TypeRow>
        <TypeRow label="mono · kod ICAO / GPS / MH">
          <AppText variant="mono">SP-AXA · EPKK → EPWA · MH 1 238:05</AppText>
        </TypeRow>
      </View>

      {/* ── Tony akcentów ── */}
      <SectionTitle>Tony akcentów</SectionTitle>
      <View style={styles.toneRow}>
        <AppText variant="label" tone="green">
          GREEN
        </AppText>
        <AppText variant="label" tone="amber">
          AMBER
        </AppText>
        <AppText variant="label" tone="red">
          RED
        </AppText>
        <AppText variant="label" tone="blue">
          BLUE
        </AppText>
      </View>

      {/* ── Mini-grid parametrów (kontekst param_value / param_label) ── */}
      <SectionTitle>Param grid (kontekst)</SectionTitle>
      <View style={styles.paramGrid}>
        <ParamCell label="Ground Speed" value="142" unit="KT" />
        <ParamCell label="Altitude" value="3 500" unit="FT" />
        <ParamCell label="Fuel on Board" value="~92" unit="L" tone="amber" />
        <ParamCell label="Flight Time" value="00:47" tone="green" />
      </View>

      {/* ── Wszystkie tokeny kolorów ── */}
      <SectionTitle>Kolory · {colorEntries.length} tokenów</SectionTitle>
      <View style={styles.swatchGrid}>
        {colorEntries.map(([name, value]) => (
          <Swatch key={name} name={name} value={value} />
        ))}
      </View>

      <AppText variant="mono" tone="muted" style={styles.footer}>
        isLight={String(theme.isLight)} · border {theme.borderWidth}px / strong{' '}
        {theme.borderWidthStrong}px
      </AppText>
    </Screen>
  );
}

/* ───────────────────────── lokalne pod-komponenty demo ───────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <AppText
      variant="paramLabel"
      tone="secondary"
      style={[styles.sectionTitle, { borderTopColor: theme.colors.border }]}
    >
      {children}
    </AppText>
  );
}

function TypeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.typeRow}>
      <AppText variant="mono" tone="muted" style={styles.typeRowLabel}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

function ParamCell({
  label,
  value,
  unit,
  tone = 'primary',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'primary' | 'amber' | 'green';
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.paramCell,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <AppText variant="paramLabel" tone="muted">
        {label}
      </AppText>
      <View style={styles.paramValueRow}>
        <AppText variant="param" tone={tone}>
          {value}
        </AppText>
        {unit ? (
          <AppText variant="mono" tone="secondary" style={styles.paramUnit}>
            {unit}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function Swatch({ name, value }: { name: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.swatch}>
      <View
        style={[
          styles.swatchChip,
          {
            backgroundColor: value,
            borderColor: theme.colors.border,
            borderWidth: theme.borderWidth,
            borderRadius: theme.radius.sm,
          },
        ]}
      />
      <AppText variant="mono" tone="primary" style={styles.swatchName} numberOfLines={1}>
        {name}
      </AppText>
      <AppText variant="mono" tone="muted" style={styles.swatchValue} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  block: {
    marginTop: 20,
  },
  caption: {
    marginTop: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 12,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  typeList: {
    gap: 16,
  },
  typeRow: {
    gap: 4,
  },
  typeRowLabel: {
    fontSize: 10,
  },
  toneRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  paramGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paramCell: {
    flexGrow: 1,
    flexBasis: '46%',
    padding: 12,
    gap: 6,
  },
  paramValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  paramUnit: {
    fontSize: 11,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 104,
    gap: 4,
  },
  swatchChip: {
    height: 44,
    width: '100%',
  },
  swatchName: {
    fontSize: 10,
  },
  swatchValue: {
    fontSize: 9,
  },
  footer: {
    fontSize: 10,
    marginTop: 24,
    marginBottom: 8,
  },
});
