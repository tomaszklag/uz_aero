/**
 * UZ Aero - 13 USTAWIENIA (mockup `design/13-ustawienia.html`).
 *
 * Pięć sekcji: motyw → synchronizacja → diagnostyka GPS → o aplikacji →
 * bezpieczeństwo (PIN) → konto.
 *
 * ══ JEDNO WEJŚCIE I KOLEJNOŚĆ OD ISSUE #82 ══
 * Zębatka stoi odtąd WYŁĄCZNIE na „Mój dzień" - z kokpitu zniknęła, a w jej miejscu
 * pilot ma przełącznik jasności (`ThemeToggle`). Ustawienia były ostatnim wyjątkiem
 * od modalności kokpitu (`CLAUDE.md`) i przestały nim być.
 *
 * PIN i wylogowanie zjechały NA KONIEC („daj wylogowanie na samym końcu, a przed nim
 * zmianę PIN-u"): obie sekcje dotyczą DOSTĘPU do aplikacji, a wylogowanie jest jedyną
 * rzeczą tutaj, której nie da się cofnąć bez internetu. Na górze stały na drodze
 * każdego, kto przyszedł po cokolwiek innego.
 *
 * SEKCJA SYNCHRONIZACJI PRZEJĘŁA EKRAN 11 (2026-08-12). Tamten ekran był trzecim
 * widokiem tej samej operacji (tabela lotów i „dane dnia" = ekran 10) i drugim
 * wskaźnikiem sieci (kolejka i ostatnia wysyłka = arkusz pod SyncChipem), a jego
 * „SYNCHRONIZUJ TERAZ" przeczyło regule, którą sam arkusz zapisuje: outbox wysyła się
 * sam. Została z niego JEDNA rzecz, której nie ma nigdzie indziej - **awaryjne
 * ponaglenie synchronizacji** (od issue #55 OBU kierunków: dopycha kolejkę wysyłki
 * i pobiera dane referencyjne z pominięciem bramy wieku; pilot sięgający po ten
 * przycisk pyta „co serwer wie teraz", nie „co wiedział kwadrans temu").
 *
 * Uwagi serwera (§4.5) ZNIKNĘŁY stąd przy issue #82: to narzędzie administratora,
 * a pilot dostawał listę rzeczy, których nie naprawi. Dwa stemple czasu scaliły się
 * w jeden - uzasadnienie obu decyzji w `logic/syncStatus.ts`.
 *
 * Wszystko, co tu można zrobić, DZIAŁA OFFLINE - jedyny wyjątek (ponowne logowanie po
 * wylogowaniu) jest opisany przy przycisku, a sam przycisk przy niepustym outboxie
 * stoi zablokowany Z POWODEM i amber-boxem (§3.0, wzorzec `.outbox-guard` z 00).
 *
 * Diagnostyka GPS to CZUJNIK, nie sieć - mockup celowo pokazuje zdrowy fix przy
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
  Screen,
  ScreenHeader,
  SettingsAction,
  SyncChip,
  ThemeSwitch,
} from '../components';
import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useGps, useTrace } from '../bootstrap/servicesContext';
import { formatLatLon, timeUtc } from '../format';
import { fixAge } from './logic/gpsLoss';
import { eventsCount, lastContactAt, lastContactLabel } from './logic/syncStatus';

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
  const syncNow = useSessionStore((s) => s.syncNow);
  const refreshReferenceNow = useSessionStore((s) => s.refreshReferenceNow);
  const restoreEventsNow = useSessionStore((s) => s.restoreEventsNow);
  const repo = useSessionStore((s) => s.repo);
  const sessionReset = useSessionStore((s) => s.reset);

  const [pinSheet, setPinSheet] = useState(false);
  const [pinChanged, setPinChanged] = useState(false);

  // ── stempel cache referencyjnego - czytany na wejściu i po ręcznym syncu ──
  const [refCheckedAt, setRefCheckedAt] = useState<number | null>(null);
  const readRefStamp = useCallback(async (): Promise<void> => {
    if (repo == null) return;
    const v = await repo.getMeta(REFERENCE_META_CHECKED_AT);
    setRefCheckedAt(v != null ? Number(v) : null);
  }, [repo]);

  // ── synchronizacja: awaryjne ponaglenie OBU kierunków ─────────────────────
  // „SYNCHRONIZUJ TERAZ" dopycha kolejkę wysyłki I pobiera świeże dane referencyjne
  // ORAZ zdarzenia z rejestru serwera - wszystko z pominięciem bram wieku (issue #55,
  // rozszerzone przy issue #75 pkt 1): pilot, który sięga po ten przycisk, pyta
  // „co serwer wie teraz", a bez dosyłki zdarzeń unieważnienie wpisane przez
  // administratora czekało na telefonie do kwadransa mimo ręcznego ponaglenia.
  // Stempel wieku czytamy ponownie, żeby wiersz w „O aplikacji" pokazał skutek od razu.
  const [syncing, setSyncing] = useState(false);
  const runManualSync = useCallback(async (): Promise<void> => {
    setSyncing(true);
    try {
      // 'manual': ten przycisk jest awaryjnym ponagleniem, więc czeka dłużej
      // niż pętla tła (patrz `SyncTrigger`).
      await syncNow('manual');
      await restoreEventsNow();
      await refreshReferenceNow();
      await readRefStamp();
    } finally {
      setSyncing(false);
    }
  }, [readRefStamp, refreshReferenceNow, restoreEventsNow, syncNow]);
  // „Offline" znamy wyłącznie z wyniku OSTATNIEJ próby (§4.3) - innego pojęcia o sieci
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

  // ── stempel cache referencyjnego (deklaracja przy ręcznym syncu wyżej) ────
  useEffect(() => {
    void readRefStamp();
  }, [readRefStamp]);

  /*
   * Odczyt typu maszyny odszedł razem z wierszem „Samolot operacji" (issue #82).
   * Ustawienia nie mają nic wspólnego z operacją, którą pilot właśnie prowadzi -
   * mówi o niej pasek kokpitu i kafelek na „Mój dzień".
   */

  const [logoutError, setLogoutError] = useState<string | null>(null);
  const doLogout = useCallback(async () => {
    const block = await logout(outboxCount);
    if (block != null) {
      setLogoutError('Wylogowanie zablokowane - kolejka wysyłki nie jest pusta.');
      return;
    }
    // Wylogowanie czyści też stan sesji w pamięci (dane w SQLite zostają - to rejestr
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
          backLabel="Mój dzień"
          right={<SyncChip />}
        />
      }
    >
      <View style={styles.content}>
        {/* ── motyw ─────────────────────────────────────────────────────────── */}
        {/* Motyw jest preferencją PILOTA (decyzja 2026-07-29): rekord per pilot
            w AsyncStorage, sync przez /me/prefs (LWW). Ekran o tym MILCZY (issue #72) -
            przypis „zapisuje się w profilu pilota … zmiana działa offline" opowiadał
            o budowie aplikacji komuś, kto chce tylko przyciemnić ekran. */}
        <Card title="Motyw wyświetlacza" header="inline">
          <ThemeSwitch />
        </Card>

        {/* ── synchronizacja: STAN, nie osobny ekran ────────────────────────
            Ekran 11 usunięty (2026-08-12) - patrz docblock modułu. DWA wiersze
            i jeden przycisk awaryjny; niczego tu nie ma o danych operacji, bo od tego
            jest rozliczenie (10).

            WIERSZ „UWAGI SERWERA" USUNIĘTY (issue #82): flagi §4.5 są narzędziem
            administratora i pilot nie ma na nie żadnej reakcji - uzasadnienie
            w `logic/syncStatus.ts`. */}
        <Card title="Synchronizacja" header="inline">
          <KeyValueRow
            divider
            label="Kolejka wysyłki"
            value={outboxCount === 0 ? 'pusta' : `${eventsCount(outboxCount)} czeka`}
            valueTone={outboxCount === 0 ? 'green' : 'amber'}
          />
          {/* JEDEN STEMPEL ZAMIAST DWÓCH (issue #82): wysyłka i pobranie danych
              referencyjnych to dwa kierunki jednego mechanizmu, a osobne godziny
              wyglądały jak dwa różne zegary. Do tego stempel wysyłki stał zamrożony
              przy pustej kolejce - patrz `lastContactAt`. */}
          <KeyValueRow
            divider
            label="Ostatnia synchronizacja"
            value={lastContactLabel(lastContactAt(lastSyncAt, refCheckedAt), now)}
          />
          <ActionButton
            label="SYNCHRONIZUJ TERAZ"
            tone="neutral"
            variant="secondary"
            size="md"
            icon="sync"
            busy={syncing}
            hint="Synchronizacja działa sama w tle - to awaryjne ponaglenie"
            disabledReason={
              offline ? 'Brak połączenia - synchronizacja ruszy sama, gdy wróci zasięg' : null
            }
            onPress={() => void runManualSync()}
          />
        </Card>

        {/* ── diagnostyka GPS (czujnik - oś niezależna od sieci) ────────────── */}
        <Card title="Diagnostyka GPS" header="inline">
          {/* `.diag-row` - wiersze klucz/wartość z DS (KeyValueRow). */}
          <KeyValueRow
            divider
            label="Status"
            value={permission === 'denied' ? 'BRAK UPRAWNIEŃ' : gpsFresh ? 'FIX' : 'BRAK FIXA'}
            valueTone={permission !== 'denied' && gpsFresh ? 'green' : 'red'}
          />
          <KeyValueRow
            divider
            label="Ostatni fix"
            value={fix != null ? `${timeUtc(fix.time)} UTC · ${fixAge(fix.time, now)}` : '-'}
          />
          <KeyValueRow
            divider
            label="Dokładność"
            value={fix?.accuracyM != null ? `± ${Math.round(fix.accuracyM)} m` : '-'}
          />
          <KeyValueRow
            divider
            label="Pozycja"
            value={fix?.lat != null && fix.lon != null ? formatLatLon(fix.lat, fix.lon) : '-'}
          />
          <TraceRow />
          <GhostAction label="Odśwież" onPress={() => void subscribe()} />
        </Card>

        {/* ── o aplikacji ─────────────────────────────────────────────────────
            Wiersz „Samolot operacji" USUNIĘTY (issue #82: „nie pisz tam «samolot
            operacji» - to jest do usunięcia"). Mówił, którą maszynę pilot ma w ręce,
            czyli to, co pasek kokpitu i kafelek na 01 niosą w kółko - a przy okazji
            pisał SUROWY identyfikator z panelu, ta sama klasa błędu, co guid
            w nagłówku śladu (issue #84).

            Stempel danych referencyjnych też stąd zszedł: jest częścią jednej godziny
            synchronizacji wyżej (`lastContactAt`), a nie osobną wiadomością. */}
        <Card title="O aplikacji" header="inline">
          <KeyValueRow label="Aplikacja" value={`UZ Aero${version != null ? ` · v${version}` : ''}`} />
        </Card>

        {/* ══ NA KOŃCU: PIN, A POD NIM WYLOGOWANIE (issue #82) ══════════════
            „W ustawieniach daj wylogowanie na samym końcu, a przed nim zmianę PIN-u."
            Obie sekcje dotyczą DOSTĘPU do aplikacji, więc stoją razem, a wylogowanie -
            jedyna rzecz w tych ustawieniach, której nie da się cofnąć bez internetu -
            zamyka ekran. Wcześniej stały na górze, zaraz pod motywem, czyli na drodze
            pilota, który przyszedł tu po cokolwiek innego. */}
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
            <Banner kind="status" tone="green" icon="check" title="PIN zmieniony" text="Nowy PIN obowiązuje od teraz - stary przestał działać." />
          )}
        </Card>

        {/* ── konto (§3.0: ochrona wylogowania) ─────────────────────────────── */}
        <Card title="Konto" header="inline">
          {pilot != null && <ProfileChip name={pilot.name} code={pilot.code} style={styles.profile} />}
          <SettingsAction
            icon="offline"
            name="Wyloguj i zmień konto"
            sub={
              logoutBlocked
                ? `niedostępne - ${eventsCount(outboxCount)} czeka na wysyłkę`
                : 'ponowne logowanie wymaga internetu'
            }
            disabled={logoutBlocked}
            onPress={() => void doLogout()}
          />
          {logoutBlocked && <OutboxGuard count={outboxCount} />}
          {logoutError != null && (
            <Banner kind="warning" tone="red" icon="warning" title="Nie wylogowano" text={logoutError} />
          )}
          <SectionNote text="Ponowne logowanie wymaga internetu - konta zakłada administrator." />
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
 * Rejestrator jest zawsze włączony (decyzja 2026-07-29) - wiersz mówi, że działa,
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

/**
 * `.section-note` - przypis sekcji (mono, muted). ZOSTAŁ JEDEN, przy koncie (issue #72,
 * uwaga z urządzenia): niesie POWÓD, dla którego wylogowanie jest decyzją - ponowne
 * logowanie wymaga internetu, a konta zakłada administrator.
 *
 * Pięć pozostałych (motyw, PIN, synchronizacja, GPS, dane referencyjne) USUNIĘTYCH:
 * opowiadały, JAK aplikacja jest zbudowana („zmiana działa offline", „kolejka opróżnia
 * się sama"), komuś, kto przyszedł przyciemnić ekran albo zmienić PIN. Miejsce takich
 * zdań jest w dokumentacji. Nowy przypis dokładamy WYŁĄCZNIE wtedy, gdy niesie blokadę
 * z powodem albo instrukcję do wykonania.
 */
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
  note: { fontSize: 9, lineHeight: 14, letterSpacing: 0.5 },
});
