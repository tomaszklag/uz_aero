/**
 * UZ Aero — 12 HISTORIA DNI (mockup `design/12-historia.html`).
 *
 * Bez tego ekranu obietnica „możesz poprawić przez 24 h" nie miała drzwi (§ decyzja
 * 2026-07-23): dzień w oknie korekty stoi wyróżniony na górze i otwiera się w ekranie
 * 10, skąd ołówki prowadzą do korekty 04c. Dni po oknie są tylko do odczytu — poprawki
 * wprowadza administrator, o czym mówi przypis z kłódką (słowami mockupu).
 *
 * Wszystko liczy się z LOKALNEGO strumienia (`historyDays` grupuje zdarzenia po
 * sesjach i projektuje tym samym kodem co ekran 10) — historia działa w pełni offline;
 * jedyną „serwerową" informacją jest tag wysyłki, a i on liczy się z outboxa.
 * Tag „arkusz gotowy" z mockupu dołączy do „Wysłane" razem z eksportem Sheets (M4) —
 * dziś twierdzenie o gotowym arkuszu byłoby zmyśleniem.
 *
 * „OTWÓRZ I POPRAW" ładuje zamkniętą sesję do store'u (`loadSession`) — bezpieczne,
 * bo historia jest osiągalna wyłącznie ze splasha, czyli bez otwartego dnia w tle.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import type { HistoryDay } from '../../application';
import {
  AppText,
  DayCard,
  Icon,
  Screen,
  ScreenHeader,
  SyncChip,
  Tag,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { buildHistory, type DayCardSpec, type EditableDaySpec } from './logic/historyDays';

export function HistoryScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const queries = useSessionStore((s) => s.queries);
  const loadSession = useSessionStore((s) => s.loadSession);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const streamRevision = useSessionStore((s) => s.streamRevision);
  const streamHydrated = useSessionStore((s) => s.streamHydrated);

  const [days, setDays] = useState<HistoryDay[] | null>(null);

  // Świeże dane przy każdym wejściu; `outboxCount` w zależnościach odświeża tagi
  // wysyłki, gdy pętla synca opróżni kolejkę, kiedy ekran jest otwarty, a
  // `streamRevision` — całą listę, gdy odtworzenie z serwera dopisze dni (§4.9).
  useEffect(() => {
    if (queries == null) return;
    let alive = true;
    void queries.historyDays().then((result) => {
      if (alive) setDays(result);
    });
    return () => {
      alive = false;
    };
  }, [queries, outboxCount, streamRevision]);

  const openDay = useCallback(
    async (sessionUuid: string) => {
      await loadSession(sessionUuid);
      navigation.navigate('Stats');
    },
    [loadSession, navigation],
  );

  const groups = days != null ? buildHistory(days, Date.now()) : null;
  // Pustej historii wolno wierzyć dopiero po pierwszym uzgodnieniu rejestru z serwerem
  // (§4.9, issue #32): telefon zaraz po czyszczeniu pamięci pokazałby „BRAK ZAMKNIĘTYCH
  // DNI" komuś, kto ma za sobą sezon — a to jest dokładnie ten komunikat, który wygląda
  // jak utrata danych. Historia NIEPUSTA nie czeka na nic: ona nigdy nie kłamie.
  const empty =
    groups != null &&
    groups.editable.length === 0 &&
    groups.closed.length === 0 &&
    streamHydrated;

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="HISTORIA DNI"
          size="md"
          onBack={navigation.goBack}
          backLabel="Start"
          right={
            <SyncChip
              status={synced ? 'synced' : 'offline'}
              outboxCount={outboxCount}
              lastSyncAt={lastSyncAt}
            />
          }
        />
      }
    >
      <View style={styles.content}>
        {empty && (
          <View style={styles.empty}>
            <AppText variant="display" style={styles.emptyTitle}>
              BRAK ZAMKNIĘTYCH DNI
            </AppText>
            <AppText variant="body" tone="muted" style={styles.emptyText}>
              Historia wypełnia się po zatwierdzeniu pierwszego dnia lotnego. Wszystko
              liczy się z zapisu na telefonie — również bez zasięgu.
            </AppText>
          </View>
        )}

        {/* ── dni w oknie korekty ─────────────────────────────────────────── */}
        {groups != null && groups.editable.length > 0 && (
          <>
            <GroupLabel text="Możesz jeszcze poprawić" />
            {groups.editable.map((day) => (
              <DayCard
                key={day.sessionUuid}
                date={day.date}
                aircraft={day.aircraft}
                stats={day.stats}
                editable
                ctaLabel="OTWÓRZ I POPRAW"
                onPress={() => void openDay(day.sessionUuid)}
                foot={
                  <>
                    <Tag label={day.deadline} tone="blue" />
                    <AppText variant="mono" tone="muted" style={styles.footNote}>
                      {day.remaining}
                    </AppText>
                  </>
                }
              />
            ))}
          </>
        )}

        {/* ── dni po oknie ────────────────────────────────────────────────── */}
        {groups != null && groups.closed.length > 0 && (
          <>
            <GroupLabel text="Zamknięte" style={styles.closedLabel} />
            {groups.closed.map((day) => (
              <DayCard
                key={day.sessionUuid}
                date={day.date}
                aircraft={day.aircraft}
                stats={day.stats}
                foot={
                  <>
                    <SyncTag day={day} />
                    <Tag label="Okno minęło" tone="neutral" />
                  </>
                }
              />
            ))}

            <View style={styles.lockedNote}>
              {/* Kłódka, nie trójkąt — „zamknięte" to stan, nie ostrzeżenie (mockup 12). */}
              <Icon name="lock" size={14} color={theme.colors.textMuted} />
              <AppText variant="body" tone="secondary" style={styles.lockedText}>
                Dni po oknie 24 h są zamknięte. Jeśli znalazłeś błąd — zgłoś go
                administratorowi; poprawka zostanie dopisana jako korekta, bez kasowania
                oryginalnego zapisu.
              </AppText>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

/** `.group-lbl` — etykieta grupy nad kartami (mono, wersaliki — token `micro`). */
function GroupLabel({ text, style }: { text: string; style?: object }) {
  return (
    <AppText variant="micro" tone="muted" style={[styles.groupLabel, style]}>
      {text}
    </AppText>
  );
}

/** Tag wysyłki dnia: zielone „Wysłane" albo amber z licznikiem kolejki. */
function SyncTag({ day }: { day: DayCardSpec | EditableDaySpec }) {
  return <Tag label={day.sync.label} tone={day.sync.pending ? 'amber' : 'green'} />;
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 11 },
  groupLabel: { paddingHorizontal: 2 },
  closedLabel: { marginTop: 4 },
  footNote: { fontSize: 9 },
  lockedNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2 },
  lockedText: { flex: 1, fontSize: 11, lineHeight: 16.5 },
  empty: { paddingVertical: 48, gap: 12 },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center' },
});
