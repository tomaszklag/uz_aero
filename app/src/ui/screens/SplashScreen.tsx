/**
 * UZ Aero — 01 START (mockup `design/01-splash.html`).
 *
 * To NIE jest loader (feedback do 01: „nie dodawaj spinnera bez celu") — to ekran
 * startowy dnia: znak marki, „NOWY DZIEŃ LOTNY" → preflight, wejście do historii
 * (okno korekty 24 h „nie miało drzwi" bez tego linku) i stopka ze stanem cache
 * referencyjnego + wersją.
 *
 * Pojawia się tylko, gdy NIE ma otwartego dnia — restart w środku dnia wraca prosto
 * do kokpitu (routing w `App.tsx`; §5.2 `session_meta` istnieje właśnie po to).
 *
 * „Poprzednie dni" prowadzi do ekranu 12, którego jeszcze nie ma — przycisk stoi
 * zablokowany Z POWODEM (§6 pkt 3), bez plakietki okna korekty (jej dane przyjdą
 * razem z 12).
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import { REFERENCE_META_CHECKED_AT } from '../../application';
import { AppText, Brand, Icon, Screen } from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { timeUtc } from '../format';

export function SplashScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void };
}) {
  const { theme } = useTheme();
  const repo = useSessionStore((s) => s.repo);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);

  // Stempel ostatniego potwierdzenia cache referencyjnego (§4.8). Zależność od
  // `lastSyncAt` odświeża napis, gdy pętla okazji właśnie zsynchronizowała.
  const [refCheckedAt, setRefCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    if (repo == null) return;
    let alive = true;
    void repo.getMeta(REFERENCE_META_CHECKED_AT).then((value) => {
      if (alive) setRefCheckedAt(value != null ? Number(value) : null);
    });
    return () => {
      alive = false;
    };
  }, [repo, lastSyncAt]);

  const version = Constants.expoConfig?.version;

  return (
    <Screen>
      <View style={styles.wrap}>
        <Brand size="hero" style={styles.brand} />

        {/* ── `.start-btn` — jedyna główna akcja ekranu ───────────────────── */}
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('PreflightAircraft')}
          style={({ pressed }) => [
            styles.startBtn,
            {
              backgroundColor: pressed ? theme.colors.green : theme.colors.greenMuted,
              borderColor: pressed ? theme.colors.green : theme.colors.greenBorder,
              borderWidth: theme.borderWidth,
            },
          ]}
        >
          {({ pressed }) => (
            <>
              <Icon name="start" size={18} color={pressed ? theme.colors.bg : theme.colors.green} />
              <AppText
                variant="display"
                style={[styles.startLabel, { color: pressed ? theme.colors.bg : theme.colors.green }]}
              >
                NOWY DZIEŃ LOTNY
              </AppText>
            </>
          )}
        </Pressable>

        {/* ── `.history-link` — ekran 12 w budowie ────────────────────────── */}
        <View
          style={[
            styles.historyBtn,
            { borderColor: theme.colors.borderStrong, borderWidth: theme.borderWidth, opacity: 0.45 },
          ]}
        >
          <Icon name="clock" size={14} color={theme.colors.textSecondary} />
          <AppText variant="body" tone="secondary" style={styles.historyLabel}>
            Poprzednie dni
          </AppText>
        </View>
        <AppText variant="label" tone="amber" style={styles.reason}>
          Ekran historii w budowie
        </AppText>
      </View>

      {/* ── `.splash-footer` ──────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.refRow}>
          <View
            style={[
              styles.dot,
              { backgroundColor: refCheckedAt != null ? theme.colors.green : theme.colors.amber },
            ]}
          />
          <AppText variant="mono" tone="secondary" style={styles.refText}>
            {refCheckedAt != null
              ? `Dane referencyjne · sync ${timeUtc(refCheckedAt)} UTC`
              : 'Dane referencyjne · jeszcze bez synca'}
          </AppText>
        </View>
        {version != null && (
          <AppText variant="mono" tone="muted" style={styles.version}>
            v{version}
          </AppText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brand: { marginBottom: 48 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    alignSelf: 'stretch',
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  startLabel: { fontSize: 20, letterSpacing: 3 },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 14,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  historyLabel: { fontSize: 13, fontWeight: '600' },
  reason: { marginTop: 6, textAlign: 'center' },
  footer: { position: 'absolute', bottom: 36, left: 0, right: 0, alignItems: 'center', gap: 8 },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  refText: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  version: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
});
