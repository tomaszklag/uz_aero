/**
 * UZ Aero - SyncChip
 *
 * Jedyny globalny wskaźnik łączności (offline-first, docs/_main.md.txt §4.3, §6).
 * Stany, ich znaczenia i cała treść arkusza mieszkają w `syncIndicator.ts` - tutaj
 * zostaje sam rysunek, bo `.tsx` w tej aplikacji eksportuje wyłącznie komponenty
 * (`docs/architektura-kodu.md` §2).
 *
 * DLACZEGO ZIELONE „SYNC" ZNIKŁO. Zsynchronizowano to stan DOMYŚLNY - plakietka
 * potwierdzająca normalność zajmowała miejsce w każdym nagłówku aplikacji i uczyła oko
 * ignorować róg ekranu, w którym czasem pojawia się rzecz naprawdę ważna. Cisza niesie
 * tu tę samą informację (ta sama reguła co przy `FreshnessNote`: stan `live` nie dostaje
 * żadnej adnotacji), a pill zauważa się dopiero wtedy, gdy jest co zauważać.
 *
 * SZCZEGÓŁY POD TAPNIĘCIEM (issue #23 pkt 5, mockupy `01c` i `01d`). Ekran pokazywał dwa
 * stemple syncu naraz - pod pillem i w stopce „Dane referencyjne" - i oba znikły: pill
 * jest jedynym śladem sieci, a tapnięcie otwiera arkusz ze szczegółami.
 *
 * ARKUSZ MA AKCJĘ „PONÓW PRÓBĘ" (uwaga z urządzenia, 2026-08-30) - i to ODWRACA decyzję
 * z issue #23, która brzmiała „arkusz jest INFORMACYJNY, bez akcji «wyślij teraz»:
 * outbox wysyła sam, a przycisk-atrapa uczyłby, że trzeba pomagać". Uzasadnienie było
 * połowiczne: outbox faktycznie wysyła sam, ale ponowienie NIE JEST atrapą - robi
 * dokładnie to, co „SYNCHRONIZUJ TERAZ" w ustawieniach, czyli dopycha kolejkę I pyta
 * o dane referencyjne z pominięciem bramy wieku (issue #55).
 *
 * ARKUSZ ŻYJE DŁUŻEJ NIŻ PILL (druga uwaga z tego samego dnia). Do 2026-08-30 komponent
 * zaczynał się od `if (status === 'synced') return null`, więc UDANE ponowienie - czyli
 * jedyny przypadek, w którym pilot dostawał dobrą wiadomość - wyrywało mu arkusz z rąk
 * w połowie interakcji: kolejka szła do zera, wskaźnik gasł i całe poddrzewo znikało
 * razem z odpowiedzią. Zniknięcie jest fatalnym raportem, bo wygląda dokładnie tak samo
 * jak awaria. Odtąd gaśnie sam PILL, a arkusz zostaje otwarty ze zdaniem „Wysłano n" -
 * zamyka go pilot, kiedy je przeczyta.
 *
 * WSKAŹNIK LICZY SIĘ TUTAJ, NIE W EKRANACH. Piętnaście ekranów powtarzało
 * `status={synced ? 'synced' : 'offline'}` - piętnaście kopii rachunku, który był
 * nieprawdziwy (pełne uzasadnienie w `syncIndicator.ts`). Ekran podaje dziś samo
 * `<SyncChip />`; propsy zostają wyłącznie jako nadpisania dla katalogu stylów, który
 * musi umieć pokazać stan bez podłączonego serwera.
 *
 * Pill renderuje się PRZEZ `StatusChip`: SYNC i RUNNING stoją obok siebie w pasku 05,
 * więc muszą mieć identyczne metryki - osobna implementacja pilla już raz rozjechała
 * ich wysokości (2026-08-04).
 */

import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { eventsCount, timeUtc } from '../../format';
import { useSessionStore } from '../../store';
import { Banner } from './Banner';
import { Sheet, type SheetRow } from '../sheets/Sheet';
import { StatusChip } from './StatusChip';
import { syncStamp } from './syncStamp';
import {
  attemptStamp,
  syncIndicator,
  syncPillLabel,
  syncPillTone,
  syncReport,
  type SyncIndicator,
} from './syncIndicator';

export interface SyncChipProps {
  /** Nadpisanie stanu - wyłącznie dla katalogu stylów; normalnie liczy go `syncIndicator`. */
  status?: SyncIndicator;
  /** Nadpisanie licznika kolejki (katalog stylów). */
  outboxCount?: number;
  /** Nadpisanie chwili ostatniej UDANEJ synchronizacji (katalog stylów). */
  lastSyncAt?: number | null;
  /**
   * Stempel cache referencyjnego (`reference.checkedAt`, §4.8) - wiersz w arkuszu
   * szczegółów. `undefined` = ekran go nie zna i wiersza nie ma; `null` = wiemy,
   * że cache jeszcze nigdy się nie potwierdził („jeszcze bez synca").
   */
  refCheckedAt?: number | null;
  style?: ViewStyle;
}

export function SyncChip({ status, outboxCount, lastSyncAt, refCheckedAt, style }: SyncChipProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  /* Arkusz musi PRZEŻYĆ zgaśnięcie pilla (patrz nota wyżej), ale montowanie go na zapas
     na każdym ekranie nie jest ceną, którą trzeba za to zapłacić: `Sheet` trzyma
     `useKeyboardHeight`, więc wisiałby nasłuch klawiatury przerysowujący to poddrzewo
     przy każdym wysunięciu - akurat na ekranach z polami wpisu, gdzie dzieje się to bez
     przerwy. Warunek montowania jest więc taki jak przed zmianą (pill widoczny),
     poszerzony o „pilot ten arkusz otworzył" - i to wystarcza, bo otworzyć go można
     wyłącznie z widocznego pilla. */
  const [everOpened, setEverOpened] = useState(false);

  const storeCount = useSessionStore((st) => st.outboxCount);
  const storeLastSync = useSessionStore((st) => st.lastSync);
  const storeLastSyncAt = useSessionStore((st) => st.lastSyncAt);
  const lastAttemptAt = useSessionStore((st) => st.lastAttemptAt);
  const syncNow = useSessionStore((st) => st.syncNow);
  const refreshReferenceNow = useSessionStore((st) => st.refreshReferenceNow);
  const restoreEventsNow = useSessionStore((st) => st.restoreEventsNow);

  const count = outboxCount ?? storeCount;
  const indicator = status ?? syncIndicator(count, storeLastSync);
  const syncedAt = lastSyncAt !== undefined ? lastSyncAt : storeLastSyncAt;

  /* Ponowienie to TEN SAM zestaw wywołań, co „SYNCHRONIZUJ TERAZ" w ustawieniach:
     dopchnięcie kolejki, dosyłka zdarzeń z rejestru serwera (issue #75 pkt 1 -
     m.in. unieważnienia wpisane przez administratora) i pytanie o dane referencyjne,
     wszystko z pominięciem bram wieku (issue #55). Pilot sięgający po przycisk
     awaryjny pyta „co serwer wie teraz", a sama wysyłka odpowiadałaby na pół pytania.

     Store bywa pusty (katalog stylów, testy komponentów) - wtedy akcji po prostu nie ma,
     zamiast przycisku, który nic nie robi (§6 pkt 3). */
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async (): Promise<void> => {
    if (syncNow == null) return;
    setRetrying(true);
    try {
      // 'manual' = pilot stoi i czeka, więc port daje dłuższy limit czasu: po ten
      // przycisk sięga się wtedy, gdy długo nic nie szło, czyli gdy serwer zdążył
      // się uśpić - a zimny start bywa dłuższy niż limit pętli tła.
      await syncNow('manual');
      await restoreEventsNow?.();
      await refreshReferenceNow?.();
    } finally {
      setRetrying(false);
    }
  }, [refreshReferenceNow, restoreEventsNow, syncNow]);

  const report = syncReport(indicator, count, storeLastSync);
  const attempt = attemptStamp(storeLastSync, lastAttemptAt);
  const pill = syncPillLabel(indicator, count);

  const rows: SheetRow[] = [
    { label: 'W kolejce', value: eventsCount(count) },
    // NAD stemplem udanego syncu: odpowiada na świeższe pytanie („co się właśnie
    // stało"), a tamten na pytanie o wiek danych.
    ...(attempt != null
      ? [
          {
            label: 'Ostatnia próba',
            value: attempt.value,
            ...(attempt.tone != null && { tone: attempt.tone }),
          },
        ]
      : []),
    { label: 'Ostatnia udana synchronizacja', value: syncStamp(syncedAt ?? null, Date.now()) },
    ...(refCheckedAt !== undefined
      ? [
          {
            label: 'Dane referencyjne',
            value: refCheckedAt != null ? `sync ${timeUtc(refCheckedAt)} UTC` : 'jeszcze bez synca',
          },
        ]
      : []),
  ];

  return (
    <>
      {indicator !== 'hidden' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${pill} - szczegóły synchronizacji`}
          onPress={() => {
            setEverOpened(true);
            setDetailsOpen(true);
          }}
          style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.6 : 1 }, style]}
        >
          <StatusChip label={pill} tone={syncPillTone(indicator)} />
        </Pressable>
      )}

      {(everOpened || indicator !== 'hidden') && (
        <Sheet
          visible={detailsOpen}
          title="SYNCHRONIZACJA"
          rows={rows}
          cancelLabel="ZAMKNIJ"
          onCancel={() => setDetailsOpen(false)}
          /* Stopka „Pełna kolejka i historia wysyłki: Ustawienia → …" USUNIĘTA (uwaga
             z urządzenia, 2026-08-30): odsyłała po przycisk, który stoi teraz TUTAJ. */
          {...(syncNow != null
            ? {
                // Napis mówi, co się DZIEJE, a nie tylko że przycisk jest chwilowo martwy:
                // bez niego jedynym śladem trwającej wysyłki było wyszarzenie,
                // nieodróżnialne od blokady. Powodu tu nie ma i być nie powinno - §6 pkt 3
                // dotyczy blokad, a to jest postęp czynności, o którą pilot właśnie
                // poprosił.
                confirmLabel: retrying ? 'WYSYŁANIE…' : 'PONÓW PRÓBĘ',
                confirmDisabled: retrying,
                onConfirm: () => void retry(),
              }
            : {})}
        >
          <Banner kind="status" tone={report.tone} icon="sync" text={report.text} />
        </Sheet>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Cel dotykowy: pill jest niski (22 px), więc dotyk rozszerza sam Pressable.
  pill: { minHeight: 34, justifyContent: 'center' },
});
