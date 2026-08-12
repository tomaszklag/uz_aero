/**
 * UZ Aero — 13 USTAWIENIA (mockup `design/13-ustawienia.html`).
 *
 * Sześć sekcji: motyw → bezpieczeństwo (PIN) → konto → synchronizacja → diagnostyka
 * GPS → o aplikacji.
 *
 * SEKCJA SYNCHRONIZACJI PRZEJĘŁA EKRAN 11 (2026-08-12). Tamten ekran był trzecim
 * widokiem tej samej sesji (tabela lotów i „dane dnia" = ekran 10) i drugim wskaźnikiem
 * sieci (kolejka i ostatnia wysyłka = arkusz pod SyncChipem), a jego „SYNCHRONIZUJ
 * TERAZ" przeczyło regule, którą sam arkusz zapisuje: outbox wysyła się sam. Zostały
 * tu dwie rzeczy, których naprawdę nie ma nigdzie indziej — **uwagi serwera** (§4.5)
 * i **awaryjne ponaglenie wysyłki**. Mieszkają w Ustawieniach, bo Ustawienia widać
 * ZAWSZE: SyncChip pojawia się wyłącznie offline, więc flaga wystawiona przez serwer
 * po udanej wysyłce nie miałaby się gdzie pokazać.
 * Wszystko, co tu można zrobić, DZIAŁA OFFLINE — jedyny wyjątek (ponowne logowanie po
 * wylogowaniu) jest opisany przy przycisku, a sam przycisk przy niepustym outboxie
 * stoi zablokowany Z POWODEM i amber-boxem (§3.0, wzorzec `.outbox-guard` z 00).
 *
 * Diagnostyka GPS to CZUJNIK, nie sieć — mockup celowo pokazuje zdrowy fix przy
 * chipie `Offline · 3`: dwie niezależne osie. Utratę fixa w locie pokazuje kokpit
 * (wariant 05g); tu jest warsztat do sprawdzenia „czy GPS w ogóle żyje" na ziemi.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

import { GPS_STALE_SEC, type GpsFix } from '../../domain';
import { REFERENCE_META_CHECKED_AT } from '../../application';
import {
  ActionButton,
  AppText,
  Banner,
  Card,
  GhostAction,
  KeyValueRow,
  OutboxGuard,
  PinChangeSheet,
  ProfileChip,
  RefDataStamp,
  Screen,
  ScreenHeader,
  SettingsAction,
  SyncChip,
  ThemePicker,
} from '../components';
import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useGps, useTrace } from '../bootstrap/servicesContext';
import { formatLatLon, timeUtc } from '../format';
import { fixAge } from './logic/gpsLoss';
import { eventsCount, flagLabel, plural, serverNoticeLabel } from './logic/syncStatus';

export function SettingsScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void; goBack: () => void };
}) {
  const gps = useGps();

  const pilot = useAuthStore((s) => s.pilot);
  const verifyPin = useAuthStore((s) => s.verifyPin);
  const changePin = useAuthStore((s) => s.changePin);
  const logout = useAuthStore((s) => s.logout);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const lastSync = useSessionStore((s) => s.lastSync);
  const serverFlags = useSessionStore((s) => s.serverFlags);
  const syncNow = useSessionStore((s) => s.syncNow);
  const synced = useSessionStore((s) => s.synced);
  const projection = useSessionStore((s) => s.projection);
  const queries = useSessionStore((s) => s.queries);
  const repo = useSessionStore((s) => s.repo);
  const sessionReset = useSessionStore((s) => s.reset);

  const [pinSheet, setPinSheet] = useState(false);
  const [pinChanged, setPinChanged] = useState(false);

  // ── synchronizacja: awaryjne ponaglenie wysyłki ───────────────────────────
  const [syncing, setSyncing] = useState(false);
  const runManualSync = useCallback(async (): Promise<void> => {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  }, [syncNow]);
  // „Offline" znamy wyłącznie z wyniku OSTATNIEJ próby (§4.3) — innego pojęcia o sieci
  // aplikacja nie ma i nie udaje, że ma.
  const offline = lastSync?.kind === 'offline';

  // ── diagnostyka GPS: żywa subskrypcja na czas otwarcia ekranu ─────────────
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stopRef = useRef<(() => void) | null>(null);

  const subscribe = useCallback(async () => {
    stopRef.current?.();
    stopRef.current = null;
    if (gps == null) {
      setPermission('denied');
      return;
    }
    const granted = await gps.requestPermission();
    if (granted !== 'granted') {
      setPermission('denied');
      return;
    }
    setPermission('granted');
    stopRef.current = await gps.start((incoming) => {
      setFix(incoming);
      setReceivedAt(Date.now());
    });
  }, [gps]);

  useEffect(() => {
    void subscribe();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopRef.current?.();
      clearInterval(tick);
    };
  }, [subscribe]);

  // ── stempel cache referencyjnego + typ samolotu sesji ─────────────────────
  const [refCheckedAt, setRefCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    if (repo == null) return;
    let alive = true;
    void repo.getMeta(REFERENCE_META_CHECKED_AT).then((v) => {
      if (alive) setRefCheckedAt(v != null ? Number(v) : null);
    });
    return () => {
      alive = false;
    };
  }, [repo]);

  const [aircraftType, setAircraftType] = useState<string | null>(null);
  useEffect(() => {
    if (queries == null || projection.aircraftId == null) return;
    let alive = true;
    void queries.aircraftById(projection.aircraftId).then((a) => {
      if (alive) setAircraftType(a?.type ?? null);
    });
    return () => {
      alive = false;
    };
  }, [queries, projection.aircraftId]);

  const [logoutError, setLogoutError] = useState<string | null>(null);
  const doLogout = useCallback(async () => {
    const block = await logout(outboxCount);
    if (block != null) {
      setLogoutError('Wylogowanie zablokowane — kolejka wysyłki nie jest pusta.');
      return;
    }
    // Wylogowanie czyści też stan sesji w pamięci (dane w SQLite zostają — to rejestr
    // samolotu, nie pilota); bramka w App.tsx sama przełączy na 00a-login.
    sessionReset();
  }, [logout, outboxCount, sessionReset]);

  const gpsFresh = receivedAt != null && now - receivedAt <= GPS_STALE_SEC * 1000;
  const logoutBlocked = outboxCount > 0;
  const version = Constants.expoConfig?.version;

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="USTAWIENIA"
          size="md"
          onBack={navigation.goBack}
          backLabel="Kokpit"
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
        {/* ── motyw ─────────────────────────────────────────────────────────── */}
        <Card title="Motyw wyświetlacza" header="inline">
          <ThemePicker detailed />
          <GhostAction label="Podgląd motywów w kokpicie" onPress={() => navigation.navigate('StyleGuide')} />
          {/* Decyzja 2026-07-29: motyw jest preferencją PILOTA — rekord per pilot
              w AsyncStorage, sync przez /me/prefs (LWW). Mockup 13 mówi to samo. */}
          <SectionNote text="Motyw zapisuje się w profilu pilota i wędruje między urządzeniami — zmiana działa offline." />
        </Card>

        {/* ── bezpieczeństwo ────────────────────────────────────────────────── */}
        <Card title="Bezpieczeństwo" header="inline">
          <SettingsAction
            icon="settings"
            name="Zmień PIN"
            sub="najpierw obecny PIN, potem nowy"
            onPress={() => {
              setPinChanged(false);
              setPinSheet(true);
            }}
          />
          {pinChanged && (
            <Banner kind="status" tone="green" icon="check" title="PIN zmieniony" text="Nowy PIN obowiązuje od teraz — stary przestał działać." />
          )}
          <SectionNote text="PIN sprawdzany lokalnie na telefonie — zmiana działa w 100% offline." />
        </Card>

        {/* ── konto (§3.0: ochrona wylogowania) ─────────────────────────────── */}
        <Card title="Konto" header="inline">
          {pilot != null && <ProfileChip name={pilot.name} code={pilot.code} style={styles.profile} />}
          <SettingsAction
            icon="offline"
            name="Wyloguj i zmień konto"
            sub={
              logoutBlocked
                ? `niedostępne — ${eventsCount(outboxCount)} czeka na wysyłkę`
                : 'ponowne logowanie wymaga internetu'
            }
            disabled={logoutBlocked}
            onPress={() => void doLogout()}
          />
          {logoutBlocked && <OutboxGuard count={outboxCount} />}
          {logoutError != null && (
            <Banner kind="warning" tone="red" icon="warning" title="Nie wylogowano" text={logoutError} />
          )}
          <SectionNote text="Ponowne logowanie wymaga internetu — konta zakłada administrator." />
        </Card>

        {/* ── synchronizacja: STAN, nie osobny ekran ────────────────────────
            Ekran 11 usunięty (2026-08-12) — patrz docblock modułu. Trzy wiersze
            i jeden przycisk awaryjny; niczego tu nie ma o danych sesji, bo od tego
            jest rozliczenie (10). */}
        <Card title="Synchronizacja" header="inline">
          <KeyValueRow
            divider
            label="Kolejka wysyłki"
            value={outboxCount === 0 ? 'pusta' : `${eventsCount(outboxCount)} czeka`}
            valueTone={outboxCount === 0 ? 'green' : 'amber'}
          />
          <KeyValueRow
            divider
            label="Ostatnia udana wysyłka"
            value={lastSyncAt != null ? `${timeUtc(lastSyncAt)} UTC` : 'jeszcze żadnej'}
          />
          {/* Wiersz stoi ZAWSZE, także z „brak uwag": inaczej pilot nie odróżni
              „serwer nic nie zgłasza" od „serwer nic nie sprawdził" (§6 pkt 2 —
              cisza nie może znaczyć dwóch rzeczy naraz). */}
          <KeyValueRow
            divider
            label="Uwagi serwera"
            value={serverNoticeLabel(serverFlags.length, lastSyncAt != null)}
            valueTone={serverFlags.length > 0 ? 'amber' : 'green'}
          />
          {/* Jedna flaga potrafi objąć kilka sesji (§4.5), więc wiersz mówi ILE —
              bez tego pilot nie wie, czy chodzi o dzisiejszy lot, czy o cały tydzień. */}
          {serverFlags.map((flag) => (
            <KeyValueRow
              key={flag.type}
              divider
              label={flagLabel(flag.type)}
              value={`${flag.sessionUuids.length} ${plural(flag.sessionUuids.length, 'sesja', 'sesje', 'sesji')}`}
              valueTone="amber"
            />
          ))}
          <ActionButton
            label="SYNCHRONIZUJ TERAZ"
            tone="neutral"
            variant="secondary"
            size="md"
            icon="sync"
            busy={syncing}
            hint="Wysyłka działa sama w tle — to awaryjne ponaglenie"
            disabledReason={
              offline ? 'Brak połączenia — wysyłka ruszy sama, gdy wróci zasięg' : null
            }
            onPress={() => void runManualSync()}
          />
          <SectionNote text="Kolejka opróżnia się sama, gdy jest sieć — nie musisz jej pilnować. Uwagi serwera pochodzą z ostatniej wysyłki; rozwiązuje je administrator w panelu." />
        </Card>

        {/* ── diagnostyka GPS (czujnik — oś niezależna od sieci) ────────────── */}
        <Card title="Diagnostyka GPS" header="inline">
          {/* `.diag-row` — wiersze klucz/wartość z DS (KeyValueRow). */}
          <KeyValueRow
            divider
            label="Status"
            value={permission === 'denied' ? 'BRAK UPRAWNIEŃ' : gpsFresh ? 'FIX' : 'BRAK FIXA'}
            valueTone={permission !== 'denied' && gpsFresh ? 'green' : 'red'}
          />
          <KeyValueRow
            divider
            label="Ostatni fix"
            value={fix != null ? `${timeUtc(fix.time)} UTC · ${fixAge(fix.time, now)}` : '—'}
          />
          <KeyValueRow
            divider
            label="Dokładność"
            value={fix?.accuracyM != null ? `± ${Math.round(fix.accuracyM)} m` : '—'}
          />
          <KeyValueRow
            divider
            label="Pozycja"
            value={fix?.lat != null && fix.lon != null ? formatLatLon(fix.lat, fix.lon) : '—'}
          />
          <TraceRow />
          <GhostAction label="Odśwież" onPress={() => void subscribe()} />
          <SectionNote text="Czujnik lokalny — odczyt działa bez zasięgu. Brak fixa w locie zobaczysz w kokpicie jako czerwony baner." />
        </Card>

        {/* ── o aplikacji ───────────────────────────────────────────────────── */}
        <Card title="O aplikacji" header="inline">
          <KeyValueRow divider label="Aplikacja" value={`UZ Aero${version != null ? ` · v${version}` : ''}`} />
          <KeyValueRow
            divider
            label="Samolot sesji"
            value={
              projection.aircraftId != null
                ? `${projection.aircraftId}${aircraftType != null ? ` · ${aircraftType}` : ''}`
                : '—'
            }
          />
          <RefDataStamp checkedAt={refCheckedAt} style={styles.refRow} />
          <SectionNote text="Dane referencyjne odświeżają się same przy każdym kontakcie z siecią." />
        </Card>
      </View>

      {/* ── arkusz zmiany PIN (obecny → nowy → powtórz, w pełni offline) ────── */}
      <PinChangeSheet
        visible={pinSheet}
        verifyCurrent={verifyPin}
        save={async (current, next) => {
          await changePin(current, next);
        }}
        onDone={() => {
          setPinSheet(false);
          setPinChanged(true);
        }}
        onCancel={() => setPinSheet(false)}
      />
    </Screen>
  );
}

/**
 * Wiersz rejestratora śladu (faza 5): ile surowych fixów czeka i od kiedy.
 * Rejestrator jest zawsze włączony (decyzja 2026-07-29) — wiersz mówi, że działa,
 * i uczciwie pokazuje zaległość wysyłki; retencja 14 dni sprząta sama.
 */
function TraceRow() {
  const trace = useTrace();
  const [stats, setStats] = useState<{ total: number; pendingUpload: number } | null>(null);

  useEffect(() => {
    if (trace == null) return;
    let alive = true;
    void trace.stats().then((s) => {
      if (alive) setStats({ total: s.total, pendingUpload: s.pendingUpload });
    });
    return () => {
      alive = false;
    };
  }, [trace]);

  if (trace == null) return null;
  // Wiersz istnieje od pierwszej klatki, także zanim policzymy fixy (issue #33):
  // dorysowany po odczycie przepychał w dół resztę diagnostyki, którą pilot właśnie
  // czytał. Plamka ma szerokość typowej wartości tego wiersza.
  return (
    <KeyValueRow
      divider
      label="Rejestrator śladu"
      pendingWidth={132}
      value={stats == null ? null : `${stats.total} fixów · ${stats.pendingUpload} do wysłania`}
    />
  );
}

/** `.section-note` — przypis sekcji (mono, muted). */
function SectionNote({ text }: { text: string }) {
  return (
    <AppText variant="mono" tone="muted" style={styles.note}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },
  profile: { minWidth: 0, alignSelf: 'stretch' },
  refRow: { paddingTop: 4 },
  note: { fontSize: 9, lineHeight: 14, letterSpacing: 0.5 },
});
