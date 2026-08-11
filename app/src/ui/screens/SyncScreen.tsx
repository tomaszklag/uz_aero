/**
 * UZ Aero — 11 SYNCHRONIZACJA.
 *
 * Odwzorowanie mockupów `design/11-eksport.html` (online, komplet wysłany) i
 * `design/11a-sync-offline.html` (outbox niepusty) — to JEDEN ekran, którego stany
 * wynikają z danych, nie z nawigacji: status wysyłki → dane dnia → arkusz docelowy →
 * flagi serwera → ręczny sync → kolejka.
 *
 * Podział źródeł danych wg §6:
 *  • licznik wysyłki, podgląd lotów, paliwo, zrzuty — LOKALNE (zawsze świeże, zero
 *    wariantów offline);
 *  • flagi serwera i `exportUrl` — Z SERWERA: `live` (odpytane teraz) / `cache`
 *    (z ostatniego pusha, z godziną) / nieznane (amber — serwer danych nie widział);
 *  • „SYNCHRONIZUJ TERAZ" — akcja sieciowa: offline = disabled Z POWODEM (§6 pkt 3).
 *
 * Pudełko „Serwer zaktualizował arkusz" pojawi się, gdy `exportUrl` przestanie być
 * `null` — czyli razem z serwerowym eksportem do Sheets (faza 4). Ekran niczego
 * nie eksportuje (§4.7: „Pilot niczego nie eksportuje ręcznie").
 *
 * „GOTOWE" prowadzi na „Mój dzień" (01) i jest jedynym wyjściem w przód — mockupy 11 i 11a
 * kończyły się kiedyś na samej strzałce wstecz (zgłoszenie z urządzenia, 2026-07-29),
 * więc przycisk do nich dopisano.
 *
 * **Ten ekran NIE JEST końcem dnia lotnego i nie kasuje stosu nawigacji** (mockup 11:
 * „NIE czyści już stosu: ten ekran przestał być końcem drogi"). Do 2026-08-08 wołał
 * `navigation.reset`, bo powstał w modelu, w którym dzień pilota domykało się jednym
 * ekranem i za plecami synchronizacji stała cała droga zamknięcia. Po §3.6a synchronizacja
 * jest STATUSEM, który pilot sprawdza w środku dnia — między jednym wzlotem a drugim —
 * a skasowany stos zabierał mu wtedy drogę powrotną do kokpitu, w którym za chwilę
 * uruchamia silnik.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SessionSyncStatus } from '../../application/ports';
import {
  ActionButton,
  AppText,
  Banner,
  Card,
  DataTable,
  ExportedBox,
  Icon,
  KeyValueRow,
  OptionInput,
  QueueBox,
  Screen,
  ScreenHeader,
  SyncChip,
  SyncStatusBox,
  type DataTableRow,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { dateUtcLong, duration, motoHours, timeUtc } from '../format';
import { buildFlightRows, flightsBadge } from './logic/statsDay';
import {
  dayDoneHint,
  dropsShort,
  dropsSummary,
  eventsCount,
  flagCatalog,
  flagLabel,
  fuelEquation,
  fuelSummary,
  sentLabel,
  sentProgress,
  sheetTabName,
} from './logic/syncStatus';

/** Kolumny podglądu arkusza (mockup 11 `.mini-table`): bez „Typ" i bez ołówków. */
const PREVIEW_COLUMNS = [{ label: '#', width: 20 }, { label: 'Takeoff' }, { label: 'Landing' }, { label: 'Block' }];

export function SyncScreen({
  navigation,
}: {
  navigation: {
    goBack: () => void;
    /**
     * Zwykłe przejście na 01. `reset` jest tu ŚWIADOMIE NIEDOSTĘPNY — ten ekran nie ma
     * prawa kasować stosu (patrz nota na górze pliku), a brak metody w typie sprawia,
     * że powrót do niej jest błędem kompilacji, nie cichą regresją.
     */
    navigate: (screen: string) => void;
  };
}) {
  const { theme } = useTheme();

  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const synced = useSessionStore((s) => s.synced);
  const lastSync = useSessionStore((s) => s.lastSync);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const serverFlags = useSessionStore((s) => s.serverFlags);
  const syncNow = useSessionStore((s) => s.syncNow);
  const engine = useSessionStore((s) => s.sync);
  const pilot = useAuthStore((s) => s.pilot);

  const [syncing, setSyncing] = useState(false);

  // Stan sesji po stronie serwera (flagi „na żywo", exportUrl). Odpytywany przy
  // wejściu i po każdej udanej wysyłce; porażka NIE zeruje poprzedniej odpowiedzi.
  const sessionUuid = projection.sessionUuid;
  const [remote, setRemote] = useState<SessionSyncStatus | null>(null);
  const fetchRemote = useCallback(async (): Promise<void> => {
    if (engine == null || sessionUuid == null) return;
    const status = await engine.fetchStatus(sessionUuid);
    if (status != null) setRemote(status);
  }, [engine, sessionUuid]);

  useEffect(() => {
    void fetchRemote();
  }, [fetchRemote, lastSyncAt]);

  const runManualSync = useCallback(async (): Promise<void> => {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  }, [syncNow]);

  /**
   * Powrót na „Mój dzień" — zwykłe przejście, BEZ kasowania stosu.
   *
   * Ekrany za plecami (kokpit, 09, 10) opisują stan nadal żywy: sesja się nie skończyła
   * dlatego, że pilot zajrzał w status wysyłki. Pętla synca żyje poza nawigacją
   * (`useSyncLoop` słucha AppState i pulsu), więc zejście z ekranu niczego nie przerywa.
   */
  const finishDay = useCallback((): void => {
    navigation.navigate('MyDay');
  }, [navigation]);

  const offline = lastSync?.kind === 'offline';
  const allSent = outboxCount === 0;
  const { sent, total, fraction } = sentProgress(events.length, outboxCount);
  const lastSentAt = lastSyncAt != null ? `${timeUtc(lastSyncAt)} UTC` : null;

  const header = (
    <ScreenHeader
      title="SYNCHRONIZACJA"
      size="md"
      onBack={navigation.goBack}
      backLabel="Statystyki"
      right={
        <SyncChip
          status={synced ? 'synced' : 'offline'}
          outboxCount={outboxCount}
          lastSyncAt={lastSyncAt}
        />
      }
    />
  );

  // Bez sesji ekran wciąż ma sens — outbox może nieść ogon poprzednich dni.
  if (sessionUuid == null) {
    return (
      <Screen scroll padded={false} header={header}>
        <View style={[styles.content, { gap: theme.spacing.md }]}>
          <AppText variant="display" style={styles.centerText}>
            BRAK DANYCH SESJI
          </AppText>
          {/* „Gdy zaczniesz dzień" obiecywało krok, którego nie ma: pilot nie otwiera
              dnia, tylko przejmuje samolot (§3.6a). Ten ekran opisuje SESJĘ i o nią pyta. */}
          <AppText variant="body" tone="muted" style={styles.centerText}>
            Wysyłka dotyczy zdarzeń jednej sesji samolotu. Gdy przejmiesz maszynę, licznik
            i podgląd arkusza pojawią się tu same.
          </AppText>
          <QueueBox
            active={outboxCount > 0}
            main={
              outboxCount > 0
                ? `${eventsCount(outboxCount)} czeka na wysyłkę`
                : '0 zdarzeń w kolejce · offline? wysyłka wznowi się sama'
            }
            sub="Zapisane lokalnie · nic nie ginie · nie wylogowuj się"
          />
          {outboxCount > 0 && <ManualSyncButton offline={offline} busy={syncing} onPress={runManualSync} />}
          {/* Ten sam warunek prymatu co niżej: `solid` należy się GOTOWE zawsze, gdy
              obok nie stoi żywa wysyłka (kolejka pusta albo sync wygaszony offline). */}
          <DayDoneButton
            hint={dayDoneHint(outboxCount)}
            primary={outboxCount === 0 || offline}
            onPress={finishDay}
          />
        </View>
      </Screen>
    );
  }

  const aircraft = projection.aircraftId ?? '—';
  const dayLabel = projection.claimedAt != null ? dateUtcLong(projection.claimedAt) : '—';
  // Pytamy o ZDANIE samolotu (`closed`), nie o klamrę służby: od §3.6a `dutyEnd` jest
  // opcjonalny i ekran „Zdaj samolot" go nie wysyła, więc ten warunek nigdy by nie zaszedł.
  // Nazwa mówi o SESJI, nie o dniu — ten ekran opisuje jeden strumień jednej maszyny,
  // a dzień pilota trwa dalej także po zdaniu samolotu (§3.6a).
  const sessionClosed = projection.closed;
  const mhFormat = projection.mhFormat ?? 'decimal';
  const tabName = sheetTabName(projection.claimedAt, projection.aircraftId);
  const showDrops = projection.drops.count > 0 || projection.operation === 'skoki';

  const flightRows: DataTableRow[] = buildFlightRows(projection.flights).map((row) => ({
    id: row.id,
    label: row.label,
    cells: [{ text: row.no, muted: true }, { text: row.takeoff }, { text: row.landing }, { text: row.time }],
  }));

  // Flagi: live (serwer odpytany) → cache (z ostatniego pusha) → nieznane.
  const flagsView: { state: 'live' | 'cache'; flags: { type: string }[] } | null =
    remote != null
      ? { state: 'live', flags: remote.flags }
      : lastSync?.kind === 'synced'
        ? { state: 'cache', flags: serverFlags }
        : null;

  return (
    <Screen scroll padded={false} header={header}>
      <View style={[styles.content, { gap: theme.spacing.md }]}>
        {/* ── status wysyłki ──────────────────────────────────────────────── */}
        <SyncStatusBox
          tone={allSent ? 'ok' : 'pending'}
          label={`Status wysyłki${pilot != null ? ` · PIC: ${pilot.code}` : ''}`}
          value={sentLabel(sent, total)}
          time={lastSentAt}
          progress={
            allSent
              ? null
              : {
                  fraction,
                  left:
                    lastSentAt != null
                      ? `ostatnia udana wysyłka ${lastSentAt}`
                      : 'jeszcze bez udanej wysyłki',
                  right: `${outboxCount} czeka na wysyłkę`,
                }
          }
        />

        {/* Stany silnika, których mockupy nie znały (§3.0) — bez cichych błędów. */}
        {lastSync?.kind === 'auth_expired' && (
          <Banner
            kind="status"
            tone="amber"
            icon="warning"
            title="Sesja serwera wygasła"
            text="Zaloguj się ponownie, żeby wznowić wysyłkę. Dane dnia są bezpieczne na telefonie — nic nie ginie."
          />
        )}
        {lastSync?.kind === 'rejected' && (
          <Banner
            kind="status"
            tone="red"
            icon="warning"
            title="Serwer odrzucił paczkę"
            text={`Zdarzenia zostały na telefonie (kod: ${lastSync.code}). Sprawę rozwiązuje administrator — wysyłka nie będzie ponawiana w ciemno.`}
          />
        )}

        {/* ── dane dnia: podgląd arkusza (komplet) / karta lokalna (zaległość) ── */}
        {allSent ? (
          <Card title="Podgląd arkusza" flush>
            <DataTable
              columns={PREVIEW_COLUMNS}
              rows={flightRows}
              emptyText="Żaden lot nie został zapisany."
            />
            <View
              style={[
                styles.previewFoot,
                {
                  borderTopWidth: theme.borderWidth,
                  borderTopColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceRaised,
                },
              ]}
            >
              <AppText variant="mono" tone="secondary" style={styles.footMain}>
                {`${dayLabel} · ${aircraft} · ${flightsBadge(projection.flights.length)}`}
              </AppText>
              <AppText variant="mono" tone="muted" style={styles.footSub}>
                {`Paliwo: ${fuelSummary(projection.fuel)}`}
              </AppText>
              {showDrops && (
                <AppText variant="mono" style={[styles.footSub, { color: theme.colors.blue }]}>
                  {`Zrzuty: ${dropsSummary(projection.drops, projection.client)}`}
                </AppText>
              )}
            </View>
          </Card>
        ) : (
          <Card title="Dane dnia · lokalne · kompletne" flush>
            <View style={styles.localRows}>
              {/* `.row` z karty „Dane dnia" (11a): etykieta i wartość mono 10 px —
                  krój `mono` wspólnego `KeyValueRow`; odstępy daje rodzic (gap). */}
              <KeyValueRow
                labelVariant="mono"
                label={`${dayLabel} · ${aircraft}`}
                value={flightsBadge(projection.flights.length)}
              />
              <KeyValueRow
                labelVariant="mono"
                label="Block time · MH"
                value={`${duration(projection.blockTimeMs)} · ${motoHours(projection.mh.start, mhFormat)} → ${motoHours(projection.mh.end, mhFormat)}`}
              />
              <KeyValueRow labelVariant="mono" label="Paliwo" value={fuelEquation(projection.fuel)} />
              {showDrops && (
                <KeyValueRow
                  labelVariant="mono"
                  label={projection.client != null ? `Zrzuty · klient ${projection.client}` : 'Zrzuty'}
                  value={dropsShort(projection.drops)}
                />
              )}
              <AppText variant="mono" tone="muted" style={styles.note}>
                {sessionClosed
                  ? 'Samolot jest zdany, a jego sesja policzona na telefonie. Brak sieci nie wpływa na kompletność danych — wpływa tylko na to, kiedy dotrą na serwer.'
                  : 'Sesja liczy się na telefonie na bieżąco. Brak sieci nie wpływa na kompletność danych — wpływa tylko na to, kiedy dotrą na serwer.'}
              </AppText>
            </View>
          </Card>
        )}

        {/* ── arkusz docelowy (§4.7: konwencja YYYY-MM-DD_SP-XXX) ─────────── */}
        <Card title="Arkusz docelowy · konfiguracja serwera" header="inline">
          <OptionInput value={tabName ?? '—'} tone={allSent ? 'green' : 'amber'} />
          {!allSent && (
            <AppText variant="mono" tone="muted" style={styles.note}>
              Arkusz przygotuje serwer po odebraniu wszystkich zdarzeń. Do tego czasu nie
              istnieje — nie ma czego otwierać.
            </AppText>
          )}
        </Card>

        {/* ── eksport serwera — dopiero gdy serwer faktycznie zaktualizował arkusz ── */}
        {remote?.exportUrl != null && (
          <ExportedBox
            url={remote.exportUrl}
            detail={`${tabName ?? '—'} · ${flightsBadge(projection.flights.length)} · ${dayLabel}`}
          />
        )}

        {/* ── flagi serwera (§4.5) ────────────────────────────────────────── */}
        {flagsView != null ? (
          <Card
            title={`Flagi serwera · sesja ${dayLabel}`}
            header="inline"
            headerRight={
              flagsView.flags.length === 0 ? (
                <View style={styles.flagsOk}>
                  <Icon name="check" size={10} color={theme.colors.green} />
                  <AppText variant="mono" style={[styles.flagsOkText, { color: theme.colors.green }]}>
                    brak
                  </AppText>
                </View>
              ) : (
                <AppText variant="mono" style={[styles.flagsOkText, { color: theme.colors.amber }]}>
                  {flagsView.flags.length}
                </AppText>
              )
            }
          >
            {flagsView.flags.length === 0 ? (
              <AppText variant="mono" tone="muted" style={styles.note}>
                {`Serwer nie wykrył niespójności (${flagCatalog(' · ')}). Ewentualne flagi ` +
                  'rozwiązuje administrator — nie wymagają akcji w kokpicie.'}
              </AppText>
            ) : (
              <View style={{ gap: theme.spacing.xs }}>
                {flagsView.flags.map((flag, i) => (
                  <AppText key={`${flag.type}-${i}`} variant="mono" style={{ fontSize: 11, color: theme.colors.amber }}>
                    {`• ${flagLabel(flag.type)}`}
                  </AppText>
                ))}
                <AppText variant="mono" tone="muted" style={styles.note}>
                  Flagi rozwiązuje administrator — nie wymagają akcji w kokpicie.
                </AppText>
              </View>
            )}
            {flagsView.state === 'cache' && (
              <AppText variant="mono" style={[styles.note, { color: theme.colors.amber }]}>
                {`· z cache${lastSentAt != null ? ` · sync ${lastSentAt}` : ''}`}
              </AppText>
            )}
          </Card>
        ) : (
          <Banner
            kind="status"
            tone="amber"
            icon="info"
            title="Flagi serwera: nieznane"
            text={
              outboxCount > 0
                ? `Serwer nie widział jeszcze ${eventsCount(outboxCount)} z tej sesji, więc nie mógł sprawdzić niespójności (${flagCatalog(', ')}). Wynik pojawi się po synchronizacji.`
                : 'Serwer jeszcze nie potwierdził sprawdzenia tej sesji. Wynik pojawi się po najbliższej synchronizacji.'
            }
          />
        )}

        {/* ── ręczny sync + kolejka ───────────────────────────────────────── */}
        <ManualSyncButton
          offline={offline}
          busy={syncing}
          // Komplet na serwerze = ręczna wysyłka nie ma czego wysłać; `solid` przechodzi
          // wtedy na GOTOWE, żeby najgłośniejszy przycisk ekranu nie był pustym gestem.
          primary={!allSent}
          onPress={runManualSync}
        />
        <QueueBox
          active={outboxCount > 0}
          main={
            outboxCount > 0
              ? `${eventsCount(outboxCount)} czeka na wysyłkę`
              : '0 zdarzeń w kolejce · offline? wysyłka wznowi się sama'
          }
          sub="Zapisane lokalnie · nic nie ginie · nie wylogowuj się"
        />

        {/* ── powrót na „Mój dzień" — jedyne wyjście w przód ────────────────── */}
        <DayDoneButton
          hint={dayDoneHint(outboxCount)}
          // O `solid` walczy tylko ŻYWA wysyłka: przy pustej kolejce nie ma czego wysyłać,
          // a offline przycisk synca jest i tak wygaszony (11a) — w obu razach GOTOWE
          // zostaje jedyną sensowną akcją ekranu i to ono ma być najgłośniejsze.
          primary={allSent || offline}
          onPress={finishDay}
        />
      </View>
    </Screen>
  );
}

/**
 * „GOTOWE" — powrót na „Mój dzień".
 *
 * Stoi POD kolejką, nie nad nią: pilot ma najpierw zobaczyć, ile jeszcze wisi, a dopiero
 * potem wyjść. Świadomie NIE blokuje się niepustym outboksem — §4.1 („brak sieci nigdy
 * nie blokuje pracy pilota") nie robi wyjątku dla tego ekranu, a lądowanie poza
 * zasięgiem jest normą, nie awarią. Podpis mówi wtedy, że wysyłka dokończy się sama.
 *
 * Wariant wędruje razem z sensem ekranu, bo `solid` przysługuje jednemu przyciskowi
 * (patrz `ActionVariant`): przy pustej kolejce ręczna wysyłka jest pustym gestem i to
 * GOTOWE jest akcją ekranu; z zaległością prymat wraca do wysyłki, a GOTOWE schodzi na
 * przygaszoną zieleń — nadal w pełni klikalną, tylko nie krzyczy.
 */
function DayDoneButton({
  hint,
  primary,
  onPress,
}: {
  hint: string;
  primary: boolean;
  onPress: () => void;
}) {
  return (
    <ActionButton
      label="GOTOWE"
      icon="check"
      tone="green"
      variant={primary ? 'solid' : 'primary'}
      hint={hint}
      onPress={onPress}
    />
  );
}

/**
 * `.btn-export` / `.btn-sync`: ręczna wysyłka to FALLBACK — pętla okazji robi to sama,
 * co przycisk mówi wprost w podpisie. Offline = disabled z powodem (§6 pkt 3);
 * odblokuje się samo, bo pętla ponawia z pulsu i z powrotu do aplikacji.
 */
function ManualSyncButton({
  offline,
  busy,
  primary = true,
  onPress,
}: {
  offline: boolean;
  busy: boolean;
  /** `false` = outbox pusty; `solid` oddajemy wtedy akcji GOTOWE (patrz `DayDoneButton`). */
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <ActionButton
      label="SYNCHRONIZUJ TERAZ"
      icon="sync"
      tone="green"
      variant={primary ? 'solid' : 'secondary'}
      hint={offline ? 'niedostępne bez sieci' : 'Wysyłka działa automatycznie w tle'}
      busy={busy}
      disabledReason={offline ? 'Brak połączenia — wysyłka ruszy sama, gdy wróci zasięg' : null}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 14 },
  centerText: { textAlign: 'center' },
  previewFoot: { paddingVertical: 8, paddingHorizontal: 12, gap: 3 },
  footMain: { fontSize: 9 },
  footSub: { fontSize: 8.5, lineHeight: 13 },
  localRows: { paddingVertical: 11, paddingHorizontal: 13, gap: 7 },
  note: { fontSize: 9, lineHeight: 15 },
  flagsOk: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flagsOkText: { fontSize: 10, letterSpacing: 1 },
});
