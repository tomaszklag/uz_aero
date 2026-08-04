/**
 * UZ Aero — SyncChip
 *
 * Jedyny globalny wskaźnik łączności (offline-first, docs/_main.md.txt §4.3, §6):
 *   - synced  → "SYNC"        (zielony pill)
 *   - offline → "OFFLINE · n" (amber pill, n = liczba zdarzeń w outboksie)
 *
 * Renderuje się PRZEZ `StatusChip`: SYNC i RUNNING stoją obok siebie w pasku 05,
 * więc muszą mieć identyczne metryki — osobna implementacja pilla już raz rozjechała
 * ich wysokości (2026-08-04). Osobny komponent zostaje, bo wskaźnik sieci jest jeden,
 * nie wolno go mnożyć i ma własny słownik stanów.
 */

import React from 'react';
import type { ViewStyle } from 'react-native';

import { StatusChip } from './StatusChip';

export type SyncStatus = 'synced' | 'offline';

export interface SyncChipProps {
  status: SyncStatus;
  /** Liczba zdarzeń w outboksie — renderowana jako "OFFLINE · n" (tylko dla offline). */
  outboxCount?: number;
  style?: ViewStyle;
}

export function SyncChip({ status, outboxCount, style }: SyncChipProps) {
  const synced = status === 'synced';
  const label = synced
    ? 'SYNC'
    : outboxCount != null
      ? `OFFLINE · ${outboxCount}`
      : 'OFFLINE';

  return (
    <StatusChip
      label={label}
      tone={synced ? 'green' : 'amber'}
      accessibilityLabel={synced ? 'Zsynchronizowano' : `Offline, ${outboxCount ?? 0} w kolejce`}
      style={style}
    />
  );
}
