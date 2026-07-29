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
 * „Poprzednie dni" otwiera historię (12); gdy jakiś dzień jest jeszcze w oknie
 * korekty 24 h, przycisk nosi niebieską plakietkę „22 JUN — można poprawić"
 * (`.history-badge`) — okno ma być widoczne, zanim pilot pomyśli o szukaniu go.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import { REFERENCE_META_CHECKED_AT } from '../../application';
import { AppText, Brand, Icon, RefDataStamp, Screen, Tag } from '../components';
import { useTheme } from '../theme';
import { fontFamily } from '../theme/tokens';
import { useSessionStore } from '../store';
import { editableBadge } from './historyDays';

export function SplashScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void };
}) {
  const { theme } = useTheme();
  const repo = useSessionStore((s) => s.repo);
  const queries = useSessionStore((s) => s.queries);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);

  // Plakietka okna korekty na przycisku historii (`.history-badge`).
  const [badge, setBadge] = useState<string | null>(null);
  useEffect(() => {
    if (queries == null) return;
    let alive = true;
    void queries.historyDays().then((days) => {
      if (alive) setBadge(editableBadge(days, Date.now()));
    });
    return () => {
      alive = false;
    };
  }, [queries]);

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

        {/* ── `.history-link` → 12 Historia ───────────────────────────────── */}
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('History')}
          style={({ pressed }) => [
            styles.historyBtn,
            {
              borderColor: pressed ? theme.colors.greenBorder : theme.colors.borderStrong,
              borderWidth: theme.borderWidth,
            },
          ]}
        >
          <Icon name="clock" size={14} color={theme.colors.textSecondary} />
          <AppText variant="body" tone="secondary" style={styles.historyLabel}>
            Poprzednie dni
          </AppText>
          {badge != null && <Tag label={badge} tone="blue" />}
        </Pressable>
      </View>

      {/* ── `.splash-footer` ──────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <RefDataStamp checkedAt={refCheckedAt} />
        {version != null && (
          // `.version-tag` — mikro-etykieta 1:1 z tokenu `micro`.
          <AppText variant="micro" tone="muted">
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
  historyLabel: { fontSize: 13, fontFamily: fontFamily.bodySemiBold },
  footer: { position: 'absolute', bottom: 36, left: 0, right: 0, alignItems: 'center', gap: 8 },
});
