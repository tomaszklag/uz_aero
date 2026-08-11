/**
 * UZ Aero — SyncChip
 *
 * Jedyny globalny wskaźnik łączności (offline-first, docs/_main.md.txt §4.3, §6):
 *   - synced  → **nic** (od 2026-08-06, issue #12)
 *   - offline → "OFFLINE · n" (amber pill, n = liczba zdarzeń w outboksie)
 *
 * DLACZEGO ZIELONE „SYNC" ZNIKŁO. Zsynchronizowano to stan DOMYŚLNY — plakietka
 * potwierdzająca normalność zajmowała miejsce w każdym nagłówku aplikacji i uczyła oko
 * ignorować róg ekranu, w którym czasem pojawia się rzecz naprawdę ważna. Cisza niesie
 * tu tę samą informację (ta sama reguła co przy `FreshnessNote`: stan `live` nie dostaje
 * żadnej adnotacji), a amber pill zauważa się dopiero wtedy, gdy jest co zauważać.
 *
 * SZCZEGÓŁY POD TAPNIĘCIEM (issue #23 pkt 5, mockup `01c`). Ekran pokazywał dwa stemple
 * syncu naraz — pod pillem i w stopce „Dane referencyjne" — i oba znikły: pill jest
 * jedynym śladem sieci, a tapnięcie otwiera arkusz ze szczegółami (stan kolejki,
 * ostatnia udana synchronizacja, wiek danych referencyjnych). Arkusz jest INFORMACYJNY,
 * bez akcji „wyślij teraz": outbox wysyła sam, gdy wróci sieć (§4.1), a przycisk-atrapa
 * uczyłby, że trzeba pomagać.
 *
 * Pill renderuje się PRZEZ `StatusChip`: SYNC i RUNNING stoją obok siebie w pasku 05,
 * więc muszą mieć identyczne metryki — osobna implementacja pilla już raz rozjechała
 * ich wysokości (2026-08-04). Osobny komponent zostaje, bo wskaźnik sieci jest jeden,
 * nie wolno go mnożyć i ma własny słownik stanów.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { plural, timeUtc } from '../../format';
import { AppText } from '../foundation/AppText';
import { Banner } from './Banner';
import { Sheet } from '../sheets/Sheet';
import { StatusChip } from './StatusChip';
import { syncStamp } from './syncStamp';

export type SyncStatus = 'synced' | 'offline';

export interface SyncChipProps {
  status: SyncStatus;
  /** Liczba zdarzeń w outboksie — renderowana jako "OFFLINE · n" (tylko dla offline). */
  outboxCount?: number;
  /** Chwila ostatniej UDANEJ synchronizacji (`sessionStore.lastSyncAt`); null = jeszcze żadnej. */
  lastSyncAt?: number | null;
  /**
   * Stempel cache referencyjnego (`reference.checkedAt`, §4.8) — wiersz w arkuszu
   * szczegółów. `undefined` = ekran go nie zna i wiersza nie ma; `null` = wiemy,
   * że cache jeszcze nigdy się nie potwierdził („jeszcze bez synca").
   */
  refCheckedAt?: number | null;
  style?: ViewStyle;
}

export function SyncChip({
  status,
  outboxCount,
  lastSyncAt = null,
  refCheckedAt,
  style,
}: SyncChipProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Stan domyślny nie melduje się z niczym — patrz nota wyżej.
  if (status === 'synced') return null;

  const count = outboxCount ?? 0;
  const label = outboxCount != null ? `OFFLINE · ${outboxCount}` : 'OFFLINE';
  const queued = `${count} ${plural(count, 'zdarzenie', 'zdarzenia', 'zdarzeń')}`;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Offline, ${count} w kolejce — szczegóły synchronizacji`}
        onPress={() => setDetailsOpen(true)}
        style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.6 : 1 }, style]}
      >
        <StatusChip label={label} tone="amber" />
      </Pressable>

      <Sheet
        visible={detailsOpen}
        title="SYNCHRONIZACJA"
        rows={[
          { label: 'W kolejce', value: queued },
          { label: 'Ostatnia udana synchronizacja', value: syncStamp(lastSyncAt, Date.now()) },
          ...(refCheckedAt !== undefined
            ? [
                {
                  label: 'Dane referencyjne',
                  value:
                    refCheckedAt != null ? `sync ${timeUtc(refCheckedAt)} UTC` : 'jeszcze bez synca',
                },
              ]
            : []),
        ]}
        cancelLabel="ZAMKNIJ"
        onCancel={() => setDetailsOpen(false)}
        footer={
          <AppText variant="mono" tone="muted" style={styles.note}>
            Pełna kolejka i historia wysyłki: Rozliczenie → Status synchronizacji.
          </AppText>
        }
      >
        <Banner
          kind="status"
          tone="amber"
          icon="sync"
          text={
            `Offline — ${queued} ${plural(count, 'czeka', 'czekają', 'czeka')} w kolejce. ` +
            'Wyślą się same, gdy wróci sieć; brak zasięgu niczego nie blokuje.'
          }
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  // Cel dotykowy: pill jest niski (22 px), więc dotyk rozszerza sam Pressable.
  pill: { minHeight: 34, justifyContent: 'center' },
  note: { fontSize: 8.5, lineHeight: 12, letterSpacing: 0.5, textAlign: 'center' },
});
