/**
 * UZ Aero — SyncChip
 *
 * Jedyny globalny wskaźnik łączności (offline-first, docs/_main.md.txt §4.3, §6):
 *   - synced  → **nic** (od 2026-08-06, issue #12)
 *   - offline → "OFFLINE · n" (amber pill, n = liczba zdarzeń w outboksie)
 *               + stempel ostatniej udanej synchronizacji pod spodem
 *
 * DLACZEGO ZIELONE „SYNC" ZNIKŁO. Zsynchronizowano to stan DOMYŚLNY — plakietka
 * potwierdzająca normalność zajmowała miejsce w każdym nagłówku aplikacji i uczyła oko
 * ignorować róg ekranu, w którym czasem pojawia się rzecz naprawdę ważna. Cisza niesie
 * tu tę samą informację (ta sama reguła co przy `FreshnessNote`: stan `live` nie dostaje
 * żadnej adnotacji), a amber pill zauważa się dopiero wtedy, gdy jest co zauważać.
 *
 * Offline chip mówi też, JAK stare są dane: „OFFLINE · 3" bez stempla zostawia pilota
 * z pytaniem, czy przekazanie sprzed chwili, czy sprzed dwóch dni (napis składa
 * `syncStamp`).
 *
 * Renderuje się PRZEZ `StatusChip`: SYNC i RUNNING stoją obok siebie w pasku 05,
 * więc muszą mieć identyczne metryki — osobna implementacja pilla już raz rozjechała
 * ich wysokości (2026-08-04). Osobny komponent zostaje, bo wskaźnik sieci jest jeden,
 * nie wolno go mnożyć i ma własny słownik stanów.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '../foundation/AppText';
import { StatusChip } from './StatusChip';
import { syncStamp } from './syncStamp';

export type SyncStatus = 'synced' | 'offline';

export interface SyncChipProps {
  status: SyncStatus;
  /** Liczba zdarzeń w outboksie — renderowana jako "OFFLINE · n" (tylko dla offline). */
  outboxCount?: number;
  /** Chwila ostatniej UDANEJ synchronizacji (`sessionStore.lastSyncAt`); null = jeszcze żadnej. */
  lastSyncAt?: number | null;
  style?: ViewStyle;
}

export function SyncChip({ status, outboxCount, lastSyncAt = null, style }: SyncChipProps) {
  // Stan domyślny nie melduje się z niczym — patrz nota wyżej.
  if (status === 'synced') return null;

  const label = outboxCount != null ? `OFFLINE · ${outboxCount}` : 'OFFLINE';

  return (
    <View style={[styles.wrap, style]}>
      <StatusChip
        label={label}
        tone="amber"
        accessibilityLabel={`Offline, ${outboxCount ?? 0} w kolejce`}
      />
      <AppText variant="mono" tone="muted" style={styles.stamp}>
        {syncStamp(lastSyncAt, Date.now())}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: 3 },
  stamp: { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
});
