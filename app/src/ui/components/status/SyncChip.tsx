/**
 * UZ Aero - SyncChip
 *
 * Jedyny globalny wskaźnik łączności (offline-first, docs/_main.md.txt §4.3, §6):
 *   - synced  → **nic** (od 2026-08-06, issue #12)
 *   - offline → "OFFLINE · n" (amber pill, n = liczba zdarzeń w outboksie)
 *
 * DLACZEGO ZIELONE „SYNC" ZNIKŁO. Zsynchronizowano to stan DOMYŚLNY - plakietka
 * potwierdzająca normalność zajmowała miejsce w każdym nagłówku aplikacji i uczyła oko
 * ignorować róg ekranu, w którym czasem pojawia się rzecz naprawdę ważna. Cisza niesie
 * tu tę samą informację (ta sama reguła co przy `FreshnessNote`: stan `live` nie dostaje
 * żadnej adnotacji), a amber pill zauważa się dopiero wtedy, gdy jest co zauważać.
 *
 * SZCZEGÓŁY POD TAPNIĘCIEM (issue #23 pkt 5, mockup `01c`). Ekran pokazywał dwa stemple
 * syncu naraz - pod pillem i w stopce „Dane referencyjne" - i oba znikły: pill jest
 * jedynym śladem sieci, a tapnięcie otwiera arkusz ze szczegółami (stan kolejki,
 * ostatnia udana synchronizacja, wiek danych referencyjnych).
 *
 * ARKUSZ MA AKCJĘ „PONÓW PRÓBĘ" (uwaga z urządzenia, 2026-08-30) - i to ODWRACA decyzję
 * z issue #23, która brzmiała „arkusz jest INFORMACYJNY, bez akcji «wyślij teraz»:
 * outbox wysyła sam, a przycisk-atrapa uczyłby, że trzeba pomagać". Uzasadnienie było
 * połowiczne: outbox faktycznie wysyła sam, ale ponowienie NIE JEST atrapą - robi
 * dokładnie to, co „SYNCHRONIZUJ TERAZ" w ustawieniach, czyli dopycha kolejkę I pyta
 * o dane referencyjne z pominięciem bramy wieku (issue #55). Pilot otwiera ten arkusz
 * z pytaniem „czy teraz?", a odpowiedź „poczekaj albo idź do ustawień" była gorsza niż
 * jedno tapnięcie - zwłaszcza odkąd stopka z tym drogowskazem zniknęła.
 *
 * Pill renderuje się PRZEZ `StatusChip`: SYNC i RUNNING stoją obok siebie w pasku 05,
 * więc muszą mieć identyczne metryki - osobna implementacja pilla już raz rozjechała
 * ich wysokości (2026-08-04). Osobny komponent zostaje, bo wskaźnik sieci jest jeden,
 * nie wolno go mnożyć i ma własny słownik stanów.
 */

import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { plural, timeUtc } from '../../format';
import { useSessionStore } from '../../store';
import { Banner } from './Banner';
import { Sheet } from '../sheets/Sheet';
import { StatusChip } from './StatusChip';
import { syncStamp } from './syncStamp';

export type SyncStatus = 'synced' | 'offline';

export interface SyncChipProps {
  status: SyncStatus;
  /** Liczba zdarzeń w outboksie - renderowana jako "OFFLINE · n" (tylko dla offline). */
  outboxCount?: number;
  /** Chwila ostatniej UDANEJ synchronizacji (`sessionStore.lastSyncAt`); null = jeszcze żadnej. */
  lastSyncAt?: number | null;
  /**
   * Stempel cache referencyjnego (`reference.checkedAt`, §4.8) - wiersz w arkuszu
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

  /* Ponowienie to TA SAMA para wywołań, co „SYNCHRONIZUJ TERAZ" w ustawieniach:
     dopchnięcie kolejki i pytanie o dane referencyjne z pominięciem bramy wieku
     (issue #55). Pilot sięgający po przycisk awaryjny pyta „co serwer wie teraz",
     a sama wysyłka odpowiadałaby na pół pytania.

     Store bywa pusty (StyleGuide, testy komponentów) - wtedy akcji po prostu nie ma,
     zamiast przycisku, który nic nie robi (§6 pkt 3). */
  const syncNow = useSessionStore((st) => st.syncNow);
  const refreshReferenceNow = useSessionStore((st) => st.refreshReferenceNow);
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async (): Promise<void> => {
    if (syncNow == null) return;
    setRetrying(true);
    try {
      await syncNow();
      await refreshReferenceNow?.();
    } finally {
      setRetrying(false);
    }
  }, [refreshReferenceNow, syncNow]);

  // Stan domyślny nie melduje się z niczym - patrz nota wyżej.
  if (status === 'synced') return null;

  const count = outboxCount ?? 0;
  const label = outboxCount != null ? `OFFLINE · ${outboxCount}` : 'OFFLINE';
  const queued = `${count} ${plural(count, 'zdarzenie', 'zdarzenia', 'zdarzeń')}`;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Offline, ${count} w kolejce - szczegóły synchronizacji`}
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
        /* Stopka „Pełna kolejka i historia wysyłki: Ustawienia → …" USUNIĘTA (uwaga
           z urządzenia, 2026-08-30): odsyłała po przycisk, który stoi teraz TUTAJ. */
        {...(syncNow != null
          ? {
              confirmLabel: 'PONÓW PRÓBĘ',
              confirmDisabled: retrying,
              onConfirm: () => void retry(),
            }
          : {})}
      >
        <Banner
          kind="status"
          tone="amber"
          icon="sync"
          text={
            /* „brak zasięgu niczego nie blokuje" USUNIĘTE (uwaga z urządzenia,
               2026-08-30): zdanie odpowiadało na obawę, której pilot nie zgłosił -
               a przez to ją podsuwało. Zostaje sam fakt i to, co się z nim stanie. */
            `Offline - ${queued} ${plural(count, 'czeka', 'czekają', 'czeka')} w kolejce. ` +
            'Wyślą się same, gdy wróci sieć.'
          }
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  // Cel dotykowy: pill jest niski (22 px), więc dotyk rozszerza sam Pressable.
  pill: { minHeight: 34, justifyContent: 'center' },
});
