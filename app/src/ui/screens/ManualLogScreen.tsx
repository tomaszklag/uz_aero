/**
 * UZ Aero — 08 LISTA RĘCZNA (fallback GPS).
 *
 * Odwzorowanie mockupu `design/08-lista-reczna.html`: nagłówek z akcją „Dodaj wpis" →
 * pasek trybu → log SESJI z klamrą biegu silnika → stany paliwa → powrót do kokpitu.
 *
 * §8 klasyfikuje fałszywe detekcje GPS jako ryzyko czerwone: przelot nad pasem bywa
 * uznany za lądowanie, ciasny zakręt gubi start, a bez wysokości automat świadomie
 * nie zgaduje. Ten ekran jest RATUNKIEM na te sytuacje — sesja musi dać się odtworzyć
 * z pamięci — i dlatego jego ton jest zachowawczy: dopisywanie jest dyskretną akcją
 * (`GhostAction`), nie wielkim CTA, a każdy wpis niesie metodę `manual`, widoczną
 * potem w statystykach i arkuszu obok wpisów `auto`.
 *
 * Klamra biegu (nie płaska lista) też jest z §8: pilot odtwarzający zapis myśli
 * „od uruchomienia do zgaszenia" — i to w niej widzi, czego brakuje. Wiersze oczekiwane
 * („— · Landing · W locie…") są dosłownie listą tego, co będzie musiał dopisać ręcznie,
 * jeśli GPS nie wykryje.
 *
 * Słownik po pivocie 2026-08-10: sesja ma DOKŁADNIE JEDEN bieg silnika, więc nie ma tu
 * „cykli" ani licznika „2 / 3" — numer biegu pokazujemy wyłącznie wtedy, gdy strumień
 * jest złamany i niesie więcej niż jeden. Wiele LOTÓW w jednym biegu jest normą.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  EventLog,
  GhostAction,
  Icon,
  ManualEntrySheet,
  ManualEventSheet,
  PillButton,
  Screen,
  ScreenHeader,
  StatGrid,
  SyncChip,
  Tag,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useEventCorrection } from '../hooks/useEventCorrection';
import { dateUtcLong, timeLocal, timeUtc } from '../format';
import { buildLogGroups, runCount } from './logic/manualLog';
import { toneColors } from '../components/tone';

export function ManualLogScreen({
  navigation,
}: {
  navigation: { goBack: () => void };
}) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const lastError = useSessionStore((s) => s.lastError);
  const takeoff = useSessionStore((s) => s.takeoff);
  const landing = useSessionStore((s) => s.landing);
  const manualLogEntry = useSessionStore((s) => s.manualLogEntry);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const { openCorrection, correctionSheet } = useEventCorrection();

  const mhFormat = projection.mhFormat ?? 'decimal';
  const groups = useMemo(
    () => buildLogGroups(events, projection, mhFormat),
    [events, projection, mhFormat],
  );
  const runs = runCount(groups);

  /**
   * Wpis ręczny = ta sama komenda co autodetekcja, tylko z metodą `manual` i czasem
   * wybranym przez pilota. Zdarzeń silnika tu nie dopisujemy: START/STOP z natury są
   * ręczne (przytrzymanie na kokpicie) i nie mają czego „nie wykryć".
   */
  const saveManual = useCallback(
    async (type: 'takeoff' | 'landing', at: number) => {
      setSheetOpen(false);
      setBusy(true);
      try {
        if (type === 'takeoff') await takeoff('manual', null, at);
        else await landing('manual', null, at);
      } catch {
        // Twarde odrzucenie inwariantu jest w `lastError` — baner niżej.
      } finally {
        setBusy(false);
      }
    },
    [landing, takeoff],
  );

  return (
    <Screen
      scroll
      padded={false}
      header={
        <>
          <ScreenHeader
            title="LISTA RĘCZNA"
            size="md"
            onBack={navigation.goBack}
            backLabel="Kokpit"
            right={
              <>
                <SyncChip
                  status={synced ? 'synced' : 'offline'}
                  outboxCount={outboxCount}
                  lastSyncAt={lastSyncAt}
                />
                {/* Mockup 08: „Dodaj wpis" = PEŁNY wpis §3.8 (cztery czasy + uwagi). */}
                <PillButton label="Dodaj wpis" icon="manual-log" onPress={() => setEntryOpen(true)} />
              </>
            }
          />
          {/* Pasek trybu (`.header-sub`). Nie twierdzimy „GPS niedostępny" — stan GPS zna
              kokpit, nie ten ekran; mówimy o roli ekranu, która jest prawdą zawsze. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingTop: 6,
              paddingBottom: 8,
              borderBottomWidth: theme.borderWidth,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Icon name="warning" size={11} color={amber.accent} />
            <AppText variant="micro" tone="amber">
              Fallback GPS
            </AppText>
            <AppText variant="micro" tone="muted">
              {`· tryb ręczny · ${projection.claimedAt != null ? dateUtcLong(projection.claimedAt) : dateUtcLong(now)}`}
            </AppText>
          </View>
        </>
      }
      /* Powrót do kokpitu na końcu listy; przy krótkim logu dosuwa się do dolnej
         krawędzi. Ekran ma własny padding, więc stopka nakłada go sama. */
      footer={
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <ActionButton
            label="WRÓĆ DO KOKPITU"
            tone="neutral"
            variant="secondary"
            size="md"
            icon="back"
            onPress={navigation.goBack}
          />
        </View>
      }
    >
      <View style={{ padding: 14, gap: theme.spacing.md }}>
        {/* `.section-label` — mikro-etykieta z tokenu (dryf światła 2 → 1.5 celowy). */}
        {/* Log SESJI, nie dnia: ekran opisuje jeden strumień jednej maszyny, a dzień
            pilota jest listą sesji (issue #23) i mieszka na 01. Data zostaje, bo sesja
            spod północy potrafi należeć do wczorajszej doby. */}
        <AppText variant="micro" tone="muted">
          {`Log sesji · ${projection.claimedAt != null ? dateUtcLong(projection.claimedAt) : dateUtcLong(now)} · UTC`}
        </AppText>

        {groups.length === 0 && (
          <AppText variant="body" tone="muted">
            Sesja jeszcze nie ma zdarzeń — pojawią się po START ENGINE.
          </AppText>
        )}

        {groups.map((group, i) =>
          group.kind === 'ground' ? (
            // Zdarzenie naziemne poza biegiem — pełną szerokością, w tonie amber.
            <Card key={`g-${i}`} flush>
              <EventLog rows={[group.row]} onCorrect={openCorrection} />
              <NotesFooter notes={group.notes} />
            </Card>
          ) : (
            <Card
              key={`c-${group.index}`}
              title={group.active ? 'Bieg silnika · aktywny' : 'Bieg silnika'}
              // Numer biegu to OSTRZEŻENIE, nie ozdoba: poprawna sesja ma jeden bieg
              // (pivot 2026-08-10), więc plakietka „2 / 3" znaczy strumień złamany.
              // Przy jednym biegu jej nie ma — licznik „1 / 1" byłby szumem.
              headerRight={runs > 1 ? <Tag label={`${group.index} / ${runs}`} tone="amber" /> : undefined}
              flush
              style={
                group.active
                  ? { borderColor: toneColors(theme, 'green').border }
                  : undefined
              }
            >
              {/* Ołówki → arkusz korekty (04c); wiersze oczekiwane celowo bez ołówka —
                  nie da się poprawić czegoś, co nie zostało zapisane. */}
              <EventLog rows={group.rows} onCorrect={openCorrection} />
              {group.active && (
                <GhostAction
                  label="Dodaj zdarzenie ręcznie"
                  icon="manual-log"
                  onPress={() => setSheetOpen(true)}
                />
              )}
              <NotesFooter notes={group.notes} />
            </Card>
          ),
        )}

        {/* Drugie wejście „Dodaj wpis" z mockupu — pod rejestrem, nad paliwem. */}
        <GhostAction
          label="Dodaj wpis ręczny (§3.8)"
          icon="manual-log"
          onPress={() => setEntryOpen(true)}
        />

        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}

        {/* ── stany paliwa sesji (`.fuel-card`) ────────────────────────── */}
        <Card
          title="Stany paliwa sesji"
          header="inline"
          style={{ borderColor: amber.border, backgroundColor: amber.muted }}
        >
          <StatGrid
            flat
            columns={3}
            cells={[
              {
                label: 'Start',
                value: `${Math.round(projection.fuel.startL ?? 0)}`,
                unit: 'litrów',
                tone: 'amber',
              },
              {
                label: 'Dolane',
                value: `${Math.round(projection.fuel.addedL)}`,
                unit: 'litrów',
                tone: 'amber',
              },
              {
                label: 'Bieżący',
                value: `${Math.round(projection.fuel.lastReadingL ?? 0)}`,
                unit: 'litrów',
                tone: 'amber',
              },
            ]}
          />
        </Card>

      </View>

      {/* ── arkusz wpisu ręcznego — wspólny z 05f ─────────────────────────
          Ta sama rodzina problemu i ten sam komponent: typ z przycisku, czas z krokiem
          minutowym, oznaczenie `manual`. Dwa różne arkusze do jednej czynności
          rozjechałyby się przy pierwszej zmianie. */}
      <ManualEventSheet
        visible={sheetOpen}
        initialType={projection.inFlight ? 'landing' : 'takeoff'}
        now={now}
        formatTime={timeUtc}
        formatLocalTime={timeLocal}
        busy={busy}
        onConfirm={saveManual}
        onCancel={() => setSheetOpen(false)}
      />

      {/* ── pełny wpis §3.8 (mockup 08: „Nowy wpis ręczny") ─────────────── */}
      <ManualEntrySheet
        visible={entryOpen}
        now={now}
        formatTime={timeUtc}
        busy={busy}
        onConfirm={(payload) => {
          setEntryOpen(false);
          setBusy(true);
          void manualLogEntry(payload)
            .catch(() => {
              // Twarde odrzucenie (np. czasy poza porządkiem) jest w `lastError`.
            })
            .finally(() => setBusy(false));
        }}
        onCancel={() => setEntryOpen(false)}
      />

      {correctionSheet}
    </Screen>
  );
}

/** Stopka „Uwagi · …" grupy rejestru (§3.8); puste = „—". */
function NotesFooter({ notes }: { notes: string | null }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderTopWidth: theme.borderWidth,
        borderTopColor: theme.colors.border,
      }}
    >
      <AppText variant="micro" tone="muted">
        Uwagi
      </AppText>
      <AppText variant="mono" tone={notes != null ? 'secondary' : 'muted'} style={styles.notesText}>
        {notes ?? '—'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  notesText: { fontSize: 9, flex: 1 },
});
