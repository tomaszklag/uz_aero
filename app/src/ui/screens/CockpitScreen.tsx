/**
 * UZ Aero — KOKPIT (mockupy 04: ziemia · 05: lot)
 *
 * Jeden ekran, dwa tryby — zgodnie z §6: aplikacja **sama** przełącza tryb na podstawie
 * stanu silnika, pilot niczego nie wybiera.
 *
 *   • silnik OFF → GROUND (04): przewijalny ekran — status, wielki START ENGINE,
 *     pasek czasu służby, log całego dnia, siatka akcji naziemnych;
 *   • silnik ON  → LOT (05): pasek akcji **przypięty do dołu**, reszta przewijalna —
 *     faza lotu ogromną czcionką, siatka GPS, log bieżącego cyklu z podziałem na loty.
 *
 * Ta różnica układów jest z designu i ma powód: na ziemi pilot czyta, w locie sięga.
 * W powietrzu przyciski muszą być zawsze w tym samym miejscu, niezależnie od tego,
 * ile zdarzeń przybyło w logu.
 *
 * Mockup 05 rysuje w locie układ całkiem sztywny, z przewijanym wyłącznie logiem.
 * Na urządzeniu okazało się to nie do utrzymania (2026-07-29): baner 05g plus większa
 * skala czcionki systemowej wypychały pasek akcji poza ekran, a bez GPS ręczny T/O–LAND
 * jest jedyną drogą zapisu. Przypięty pasek + przewijalny środek trzyma obietnicę
 * mockupu tam, gdzie ona naprawdę jest: przyciski zawsze w tym samym miejscu.
 *
 * Cały ekran jest zbudowany z komponentów Design Systemu — nie ma tu własnych „kart"
 * ani „chipów". Zapis wyłącznie przez komendy; twarde odrzucenie inwariantu i miękkie
 * flagi zawsze widoczne (§6 pkt 3: nigdy cichy błąd).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';

import {
  ActionButton,
  ActionGrid,
  AppBar,
  AppText,
  Banner,
  Card,
  CockpitActions,
  DayLog,
  DetectToast,
  DropSheet,
  FuelStrip,
  LeaveCockpitSheet,
  EventLog,
  ManualEventSheet,
  NoGpsBanner,
  ParamGrid,
  PhaseHero,
  Screen,
  StatusChip,
  SyncChip,
  Tag,
  type ActionCardSpec,
  type IconName,
  type Tone,
} from '../components';
import { useTheme } from '../theme';
import { holdsAircraft } from '../navigation/resumeTarget';
import { useSessionStore } from '../store';
import { useGps, useSensors } from '../bootstrap/servicesContext';
import { useAircraft } from '../hooks/useAircraft';
import { useFlightDetection } from '../hooks/useFlightDetection';
import { useSensorTrace } from '../hooks/useSensorTrace';
import { duration, hhmm, litres, thousands, timeLocal, timeUtc } from '../format';
import { buildCycleRows, buildDaySections } from './logic/cockpitLog';
import { fuelTone } from './logic/fuelNorm';
import { buildCockpitFuel } from './logic/cockpitFuel';
import { cyclesLabel } from './logic/cockpitPeek';
import { flightsBadge } from './logic/statsDay';
import {
  gpsAcquiringText,
  gpsLossText,
  gpsPermissionText,
  gpsSignalState,
  staleCellNote,
  unknownPhaseDetail,
} from './logic/gpsLoss';
import { operationTag, routeLabel } from './logic/operations';
import { isJumpOperation, isSameFieldOperation } from '../../domain';
import type { Event, FlightPhase } from '../../domain';

/** Sekundowy tick — tylko gdy jest co odliczać. */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Napisy faz z mockupu 05 (`.phase-hero-name`). */
const PHASE_LABEL: Record<FlightPhase, string> = {
  idle: 'Engine idle',
  taxi: 'Taxi',
  climb: 'Climb',
  cruise: 'Cruise',
  descent: 'Descent',
};

/** Kolor fazy: niebieski = w powietrzu, zielony = ziemia z pracującym silnikiem. */
const PHASE_TONE: Record<FlightPhase, Tone> = {
  idle: 'neutral',
  taxi: 'green',
  climb: 'blue',
  cruise: 'blue',
  descent: 'blue',
};

/**
 * Ikona fazy — stan rozpoznawalny bez czytania napisu (komplet 2026-08-04):
 * śmigło = kręci się tylko silnik · taxi = sylwetka na kołach · odloty/przyloty
 * = wznoszenie/zniżanie · pion = przelot. Definicje glifów w rejestrze `Icon`.
 */
const PHASE_ICON: Record<FlightPhase, IconName> = {
  idle: 'phase-idle',
  taxi: 'phase-taxi',
  climb: 'phase-climb',
  cruise: 'phase-cruise',
  descent: 'phase-descent',
};

export function CockpitScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void };
}) {
  const { theme } = useTheme();
  const gps = useGps();
  const sensors = useSensors();

  const context = useSessionStore((s) => s.context);
  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const synced = useSessionStore((s) => s.synced);
  const warnings = useSessionStore((s) => s.warnings);
  const lastError = useSessionStore((s) => s.lastError);
  const startEngine = useSessionStore((s) => s.startEngine);
  const stopEngine = useSessionStore((s) => s.stopEngine);
  const drop = useSessionStore((s) => s.drop);
  const takeoff = useSessionStore((s) => s.takeoff);
  const landing = useSessionStore((s) => s.landing);

  // Konfiguracja i norma zużycia z cache'u referencyjnego — do paska paliwa (mockup 04).
  // Dane lokalne, więc kokpit nigdy nie czeka na sieć.
  const aircraft = useAircraft(projection.aircraftId);

  const [busy, setBusy] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  /**
   * KOKPIT JEST STANEM MODALNYM (decyzja 2026-08-10) — i egzekwuje to także wobec
   * przycisku sprzętowego. Bez tej bramki „wstecz" zdejmował kokpit ze stosu i pokazywał
   * 02a: formularz przejęcia maszyny, która jest już przejęta.
   *
   * `usePreventRemove`, a nie `BackHandler`: łapie KAŻDE zdjęcie ekranu, więc obok
   * przycisku obejmuje też gest cofania krawędzią — a to ten sam błąd popełniony innym
   * ruchem palca.
   *
   * Warunek pyta o TRZYMANIE MASZYNY (`holdsAircraft`), nie o samo istnienie sesji, i to
   * jest tu istotne: po zdaniu samolotu 09B wraca na 01 przez `navigate`, co w stosie
   * ZDEJMUJE kokpit. Gdyby bramka patrzyła na sesję, zablokowałaby jedyne dozwolone
   * wyjście. Ten sam predykat wybiera ekran startowy po restarcie, więc oba miejsca nie
   * mają jak się rozjechać (`navigation/resumeTarget.ts`, test „ZDANY samolot wraca
   * do «Mój dzień»").
   */
  usePreventRemove(holdsAircraft(projection), () => setLeaveOpen(true));
  const engineOn = projection.engineRunning;
  const inFlight = projection.inFlight;
  const now = useTicker(engineOn);

  // Elewacja lotniska = wysokość GPS z chwili ENGINE START (§3.3). Bierzemy ją
  // z payloadu zdarzenia, żeby przetrwała restart aplikacji.
  const fieldElevationFt = useMemo(() => {
    const start = [...events]
      .reverse()
      .find((e): e is Extract<Event, { type: 'engine_start' }> => e.type === 'engine_start');
    return start?.payload.fieldElevationFt ?? null;
  }, [events]);

  const { fix, phase, pending, undo, gpsAvailable, lastFixAt, permissionDenied } =
    useFlightDetection({
      gps,
      enabled: engineOn,
      fieldElevationFt,
      // Skoki latają z i na to samo lotnisko — geofence odcina „lądowanie" daleko od
      // pola (artefakt GPS). Przelot i egzamin lądują gdzie chcą — bez bramki.
      // Ten sam predykat rozstrzyga, czy preflight pyta o jedno lotnisko, czy o parę.
      sameFieldOnly: projection.operation != null && isSameFieldOperation(projection.operation),
    });
  // Nagrywanie czujników pokładowych do śladu kalibracyjnego — ten hook NIC nie decyduje
  // i celowo stoi obok detekcji, a nie w niej (patrz nagłówek `useSensorTrace`).
  useSensorTrace({ sensors, enabled: engineOn });

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      // Powód jest w `lastError` — pokazujemy go banerem niżej.
    } finally {
      setBusy(false);
    }
  }, []);

  const handleStart = useCallback(
    () =>
      run(() =>
        startEngine({
          // Elewację zapisujemy przy starcie — potem nie ma z czego jej odtworzyć.
          fieldElevationFt: fix?.altitudeFt ?? null,
        }),
      ),
    [fix, run, startEngine],
  );

  /**
   * STOP ENGINE kończy jedyny bieg tej sesji (model 2026-08-10) — dalej jest już tylko
   * ZDAJ SAMOLOT. Zapis może odbić reguła (np. w powietrzu), więc nawigacji tu nie ma
   * żadnej: sukces i odmowa oba zostawiają pilota w kokpicie, tylko w innych stanach.
   */
  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      await stopEngine();
      // ZOSTAJEMY w kokpicie (model 2026-08-10): po STOP ENGINE ekran przechodzi sam
      // w stan „po zatrzymaniu" (hero ZDAJ SAMOLOT), bo `engineRunning` gaśnie
      // w projekcji. Do 2026-08-10 stąd otwierał się ekran 09 (zamknięcie wzlotu) —
      // usunięty razem z `leg_close`; zatwierdzenie mieszka na 09B.
    } catch {
      // Powód jest w `lastError` — pokazujemy go banerem niżej.
    } finally {
      setBusy(false);
    }
  }, [stopEngine]);

  if (!context) return <NoSession onStart={() => navigation.navigate('PreflightAircraft')} />;


  const mhFormat = projection.mhFormat ?? 'decimal';
  const liveFlightMs =
    projection.openTakeoffAt != null ? now - projection.openTakeoffAt : projection.flightTimeMs;

  /**
   * Czy w tym dniu wynosi się skoczków — od tego zależy, czy pasek akcji ma przycisk
   * zrzutu (issue #19). Pyta o to domena, tak samo jak o kształt trasy w preflightcie.
   */
  const jumpDay = projection.operation != null && isJumpOperation(projection.operation);

  /**
   * Ton odczytu paliwa z szacunku czasu lotu (issue #19): amber godzinę przed rezerwą,
   * czerwony na rezerwie. `null` = brak normy, czyli nie ma czym kolorować — odczyt
   * zostaje neutralny zamiast świecić na pomarańczowo przy pełnych zbiornikach.
   */
  const fuelToneNow = fuelTone(projection.fuel.lastReadingL, aircraft?.consumption ?? null);

  /**
   * Podział ról między paskiem paliwa i kafelkiem „Tankowanie" — jedna liczba, jedno
   * miejsce (`logic/cockpitFuel.ts`). Ekran sam tego NIE rozstrzyga, bo reguła ma test.
   */
  const fuel = buildCockpitFuel({
    fobL: projection.fuel.lastReadingL,
    addedL: projection.fuel.addedL,
    norm: aircraft?.consumption ?? null,
  });

  /** Komunikaty wspólne dla obu trybów — nigdy cichy błąd (§6 pkt 3). */
  const messages = (
    <>
      {lastError != null && (
        <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
      )}
      {warnings.length > 0 && (
        <Banner
          kind="warning"
          icon="warning"
          title="Zapisane — sprawdź"
          text={warnings.map((w) => w.message).join('\n')}
        />
      )}
    </>
  );

  const toast =
    pending == null ? null : (
      <DetectToast
        title={pending.detection === 'takeoff' ? 'Takeoff' : 'Landing'}
        detail={`${timeUtc(pending.at)} UTC · GS ${
          pending.fix.groundSpeedKt != null ? Math.round(pending.fix.groundSpeedKt) : '—'
        } KT`}
        secondsLeft={pending.secondsLeft}
        undoLabel={pending.detection === 'takeoff' ? 'COFNIJ — NIE BYŁO STARTU' : 'COFNIJ — TO PRZELOT'}
        onUndo={undo}
      />
    );

  /**
   * Arkusz blokady wyjścia (04d) — jeden dla OBU trybów kokpitu. „Wstecz" w locie jest
   * dokładnie tą samą pomyłką co na ziemi, a arkusz na `Modal` z RN wyświetla się nad
   * każdym układem, więc nie ma powodu utrzymywać dwóch kopii.
   */
  const leaveSheet = (
    <LeaveCockpitSheet
      visible={leaveOpen}
      aircraftId={projection.aircraftId ?? '—'}
      since={projection.claimedAt != null ? `${timeUtc(projection.claimedAt)} UTC` : null}
      legCount={projection.legs.length}
      onStay={() => setLeaveOpen(false)}
      onRelease={() => {
        setLeaveOpen(false);
        navigation.navigate('ReleaseAircraft');
      }}
    />
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TRYB LOT (mockup 05) — układ stały, przewija się tylko log cyklu.
  // ─────────────────────────────────────────────────────────────────────────
  if (engineOn) {
    const cycleRows = buildCycleRows(events, projection, mhFormat, now);
    const landings = cycleRows.filter((r) => r.kind === 'landing').length;
    const takeoffs = cycleRows.filter((r) => r.kind === 'takeoff').length;
    /**
     * Czy w tym cyklu JEST JUŻ CO POKAZYWAĆ (issue #19).
     *
     * Zaraz po START ENGINE log cyklu składa się z samego uruchomienia silnika i wiersza
     * „na żywo" — a nagłówek ogłaszał wtedy „Cykl bieżący · 0 T/O · 0 LDG" i plakietkę
     * „Lot #1", czyli trzy liczby o niczym. Karta pojawia się więc dopiero, gdy system
     * wykryje pierwsze zdarzenie lotu: kołowanie, start, lądowanie albo zrzut.
     */
    const cycleHasEvents = cycleRows.some((r) => r.kind !== 'live' && r.kind !== 'start');
    // Degradacja CZUJNIKA (mockup 05g) — osobna oś od sieci: SyncChip może świecić
    // zielono, a autodetekcja stoi. Baner-przyrząd + ręczny zapis jako jedyna droga.
    // `gpsLost` steruje degradacją danych (siatka, faza, etykiety ręczne) — brak
    // danych to brak danych. TON banera różnicuje dopiero `signal`: rozruch
    // odbiornika po START ENGINE to nie awaria (decyzja UX 2026-08-04).
    const gpsLost = !gpsAvailable;
    const signal = gpsSignalState(gpsAvailable, lastFixAt, permissionDenied);

    return (
      <Screen padded={false}>
        <AppBar
          aircraft={projection.aircraftId}
          subtitle={[projection.departureIcao, projection.arrivalIcao].filter(Boolean).join(' → ')}
          compact
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <SyncChip
                status={synced ? 'synced' : 'offline'}
                outboxCount={outboxCount}
                lastSyncAt={lastSyncAt}
              />
              <StatusChip label="Running" tone="green" />
            </View>
          }
          onSettings={() => navigation.navigate('Settings')}
        />

        {/*
          Środek przewija się w całości, pasek akcji jest przypięty do dołu (poprawka
          z urządzenia, 2026-07-29). Mockup 05 zakłada układ sztywny z przewijanym
          wyłącznie logiem i przy czterech sekcjach to działa — ale baner 05g plus
          większa skala czcionki systemowej dokładają tyle, że sztywne sekcje przestają
          się mieścić. Wypychały wtedy T/O–LAND i STOP poza ekran, a bez GPS ręczny zapis
          jest JEDYNĄ drogą: pilot tracił i autodetekcję, i przycisk, który ją zastępuje.
          Gdy treść się mieści, przewijanie nie zmienia niczego wizualnie.
        */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── `.no-gps` (05g): baner typu STATUS — przyrząd, znika sam z powrotem fixa.
               Trzy stany: rozruch (amber, spokojny), utrata (czerwony 05g), brak
               uprawnienia (czerwony + instrukcja ustawień). ── */}
          {signal === 'acquiring' && (
            <NoGpsBanner
              tone="amber"
              title="GPS: wyszukiwanie sygnału · autodetekcja uzbraja się"
              text={gpsAcquiringText()}
              onManualEvent={() => setManualOpen(true)}
              onManualList={() => navigation.navigate('ManualLog')}
            />
          )}
          {signal === 'permission' && (
            <NoGpsBanner
              title="GPS: brak uprawnienia · autodetekcja wyłączona"
              text={gpsPermissionText()}
              onManualEvent={() => setManualOpen(true)}
              onManualList={() => navigation.navigate('ManualLog')}
            />
          )}
          {signal === 'lost' && (
            <NoGpsBanner
              text={gpsLossText(lastFixAt, now)}
              onManualEvent={() => setManualOpen(true)}
              onManualList={() => navigation.navigate('ManualLog')}
            />
          )}

          <PhaseHero
            // Fazy z GPS nie znamy; „w locie" wiemy ZE ZDARZEŃ — projekcja nie potrzebuje fixa.
            phase={gpsLost && inFlight ? 'In Flight' : PHASE_LABEL[phase.phase]}
            icon={gpsLost && inFlight ? 'phase-cruise' : PHASE_ICON[phase.phase]}
            tone={gpsLost ? 'amber' : PHASE_TONE[phase.phase]}
            // Linia kontekstu tylko przy utracie GPS (FAZA NIEZNANA · BEZ FIXA OD…).
            // Prędkość wznoszenia wyleciała (2026-08-04): rejestrator, nie przyrząd —
            // wariometr pilot ma na tablicy, a trend niesie sama nazwa fazy.
            detail={gpsLost ? unknownPhaseDetail(lastFixAt) : undefined}
          />

          <ParamGrid
            cells={
              gpsLost
                ? [
                    { label: 'Ground speed', value: '— —', unit: 'KT', stale: true, note: staleCellNote(lastFixAt) },
                    { label: 'Altitude', value: '— —', unit: 'FT', stale: true, note: staleCellNote(lastFixAt) },
                    {
                      label: 'Fuel on board',
                      value: `~${Math.round(projection.fuel.lastReadingL ?? 0)}`,
                      unit: 'L',
                      // Ton z szacunku, nie „zawsze amber" — patrz `fuelToneNow`.
                      tone: fuelToneNow ?? 'neutral',
                      tint: fuelToneNow != null && fuelToneNow !== 'neutral',
                      note: 'dane lokalne — bez GPS',
                    },
                    {
                      label: 'Flight time',
                      value: hhmm(liveFlightMs),
                      note: 'zegar — liczy normalnie',
                    },
                  ]
                : [
                    {
                      label: 'Ground speed',
                      // Brak prędkości od odbiornika to „—", nie „0" — zero jest odczytem,
                      // a tego odczytu nikt nie wykonał (patrz `toFix` w adapterze GPS).
                      value: fix?.groundSpeedKt != null ? `${Math.round(fix.groundSpeedKt)}` : '—',
                      unit: 'KT',
                    },
                    {
                      label: 'Altitude',
                      value: fix?.altitudeFt != null ? thousands(fix.altitudeFt) : '—',
                      unit: 'FT',
                    },
                    {
                      // Tylda jak w mockupach 05/05g: to ostatni ODCZYT, nie stan
                      // bieżący — w locie paliwa jest już mniej i „~" mówi to wprost.
                      label: 'Fuel on board',
                      value: `~${Math.round(projection.fuel.lastReadingL ?? 0)}`,
                      unit: 'L',
                      // AMBER TYLKO WTEDY, GDY JEST O CO (issue #19): kolor ostrzegawczy
                      // świecący przy pełnych zbiornikach przestaje cokolwiek znaczyć.
                      tone: fuelToneNow ?? 'neutral',
                      tint: fuelToneNow != null && fuelToneNow !== 'neutral',
                    },
                    // `hhmm` (00:47), nie `duration` (0:47) — mockup trzyma w tej komórce
                    // format karty lotów. Bez zieleni (issue #19): czas lotu jest odczytem,
                    // a nie stanem wymagającym uwagi — wyróżniał się bez powodu.
                    { label: 'Flight time', value: hhmm(liveFlightMs) },
                  ]
            }
          />

          {/* Komunikaty NAD logiem: log rośnie bez ograniczeń, więc wszystko, co ma być
              przeczytane, stoi przed nim — inaczej „Nie zapisano" lądowałoby poniżej
              krawędzi ekranu, a §6 pkt 3 nie zna cichego błędu. */}
          {(lastError != null || warnings.length > 0) && (
            <View style={{ paddingHorizontal: 14, paddingTop: theme.spacing.sm, gap: theme.spacing.sm }}>
              {messages}
            </View>
          )}

          {/* Log bieżącego cyklu — jedyny element bez własnej wysokości: rośnie z liczbą
              zdarzeń, a przy krótkim logu rozpycha się do paska akcji (`flexGrow`), więc
              pełnoekranowa wstęga z mockupu zostaje. `flexShrink: 0` pilnuje, żeby się
              nie ścisnął, gdy sekcje wyżej zabiorą całą wysokość. */}
          {cycleHasEvents && (
            <Card
              title={`Cykl bieżący · ${takeoffs} T/O · ${landings} LDG`}
              headerRight={<Tag label={`Lot #${projection.flights.length + (inFlight ? 1 : 0)}`} />}
              flush
              style={{
                flexGrow: 1,
                flexShrink: 0,
                borderRadius: 0,
                borderLeftWidth: 0,
                borderRightWidth: 0,
              }}
              contentStyle={{ flexGrow: 1 }}
            >
              <EventLog rows={cycleRows} emptyText="Cykl dopiero się zaczął." />
            </Card>
          )}
        </ScrollView>

        <CockpitActions
          // 05g: bez fixa ręczny zapis to JEDYNA droga — etykieta i amber mówią to
          // wprost, zanim pilot doczyta baner.
          // Pełne nazwy zamiast skrótów „T/O" i „LAND" (issue #19): pasek akcji jest
          // jedynym miejscem, gdzie pilot ZAPISUJE zdarzenie, a skrót oszczędzał znaki
          // na przycisku, który ma dwie trzecie szerokości ekranu.
          primaryLabel={
            inFlight
              ? gpsLost
                ? 'Landing · ręcznie'
                : 'Landing'
              : gpsLost
                ? 'Take off · ręcznie'
                : 'Take off'
          }
          primaryTone={gpsLost ? 'amber' : undefined}
          primaryIcon={inFlight ? 'landing' : 'takeoff'}
          onPrimary={() => setManualOpen(true)}
          // Zrzut istnieje TYLKO w dniu skokowym (issue #19): przy przelocie,
          // egzaminie czy locie technicznym nie ma czego wynosić, więc przycisku nie
          // ma w ogóle. `undefined` to brak akcji, nie blokada — patrz `CockpitActions`.
          onDrop={jumpDay ? () => setDropOpen(true) : undefined}
          // Wyniesienie z definicji dzieje się w powietrzu (§3.3).
          dropDisabledReason={inFlight ? null : 'Zrzut zapiszesz w powietrzu'}
          onStop={handleStop}
          // `engine_stop` w powietrzu byłby fałszywym wpisem — blokujemy z powodem (§3.2).
          stopDisabledReason={inFlight ? 'Silnik zatrzymasz po wylądowaniu i dobiegu' : null}
        />

        {/* ── zrzut (mockup 05e) — arkusz nad kokpitem, nie osobny ekran ── */}
        <DropSheet
          visible={dropOpen}
          // Numer LOTU, nie zrzutu — w jednym locie bywa kilka wyniesień.
          flightNumber={projection.flights.length + (inFlight ? 1 : 0)}
          time={timeUtc(now)}
          // Wysokość bierzemy z GPS, nie z palca — pilot ustawia tylko liczby skoczków.
          altitudeFt={fix?.altitudeFt ?? null}
          client={projection.client}
          busy={busy}
          onConfirm={(jumpers) => {
            setDropOpen(false);
            void run(() => drop({ jumpers, altitudeFt: fix?.altitudeFt ?? null }));
          }}
          onCancel={() => setDropOpen(false)}
        />

        {/* ── wpis ręczny (mockup 05f) — ratunek na fałszywą detekcję GPS ── */}
        <ManualEventSheet
          visible={manualOpen}
          initialType={inFlight ? 'landing' : 'takeoff'}
          now={now}
          formatTime={timeUtc}
          formatLocalTime={timeLocal}
          busy={busy}
          onConfirm={(type, at) => {
            setManualOpen(false);
            // Czas wybrany przez pilota JEST czasem zdarzenia — zapis dostaje go jawnie,
            // a chwila zapisu zostaje w `deviceTime` (§5.1, dwa zegary).
            void run(() =>
              type === 'takeoff' ? takeoff('manual', null, at) : landing('manual', null, at),
            );
          }}
          onCancel={() => setManualOpen(false)}
        />

        {leaveSheet}
        {toast}
      </Screen>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRYB GROUND (mockup 04) — przewijalny ekran dnia.
  // ─────────────────────────────────────────────────────────────────────────
  const daySections = buildDaySections(events, projection, mhFormat);

  /**
   * Akcje naziemne (`.action-grid`). Każda niesie podpis ze stanem, żeby pilot widział,
   * czy warto tam wchodzić, bez otwierania ekranu i wracania.
   */
  const groundActions: ActionCardSpec[] = [
    {
      id: 'refuel',
      icon: 'refuel',
      label: 'Tankowanie',
      tone: 'amber',
      // Podpis zależy od tego, czy pasek paliwa jest na ekranie: gdy jest, kafelek nie
      // powtarza litrów; gdy go nie ma, to ON niesie stan zbiorników (`cockpitFuel.ts`).
      sub: fuel.refuelSub,
      onPress: () => navigation.navigate('Refuel'),
    },
    {
      id: 'crew',
      icon: 'crew',
      label: 'Zmiana załogi',
      sub: `PIC: ${projection.picId ?? '—'}${projection.dualId != null ? ` · DUAL: ${projection.dualId}` : ''}`,
      onPress: () => navigation.navigate('CrewChange'),
    },
    {
      id: 'manual',
      icon: 'manual-log',
      label: 'Lista ręczna',
      // Odmiana z `flightsBadge` — „1 lotów" na żywym kokpicie wyglądało jak literówka
      // w przyrządzie. Ta sama funkcja liczy badge na 10 i 11.
      sub: `Fallback GPS · ${flightsBadge(projection.flights.length)}`,
      onPress: () => navigation.navigate('ManualLog'),
    },
    {
      id: 'release',
      icon: 'end-day',
      label: 'Zdaj samolot',
      tone: 'red',
      // Nie „Zakończ dzień": zdanie maszyny NIE kończy służby pilota (§3.6a). Kafelek
      // prowadzi na 09B, gdzie odczyt liczników jest wymagany, bo staje się przekazaniem.
      sub: 'Odczyty końcowe · przekazanie',
      onPress: () => navigation.navigate('ReleaseAircraft'),
    },
  ];

  return (
    <Screen scroll padded={false}>
      <AppBar
        aircraft={projection.aircraftId}
        subtitle={[
          routeLabel(projection.operation, projection.departureIcao, projection.arrivalIcao),
          projection.operation == null ? null : operationTag(projection.operation),
        ]
          .filter(Boolean)
          .join(' · ')}
        right={
          <SyncChip
            status={synced ? 'synced' : 'offline'}
            outboxCount={outboxCount}
            lastSyncAt={lastSyncAt}
          />
        }
        // `.settings-btn` z mockupu 04 → ekran 13 (ustawienia: motyw, PIN, konto,
        // diagnostyka GPS). Do czasu 13 prowadził do StyleGuide.
        onSettings={() => navigation.navigate('Settings')}
      />

      <View style={{ padding: theme.spacing.lg, gap: 14 }}>
        <ActionButton
          label="START ENGINE"
          tone="green"
          size="hero"
          icon="start"
          holdMs={2000}
          busy={busy}
          hint="Przytrzymaj 2 sekundy aby potwierdzić"
          onPress={handleStart}
        />

        {/* KOKPIT JEST STANEM MODALNYM (decyzja 2026-08-10) — stąd nie ma paska sesji
            ani żadnego innego wyjścia na 01. Kto trzyma samolot, oddaje go przez „Zdaj
            samolot" (09B); dopóki go trzyma, ekranem pilota jest kokpit.

            Pasek stał tu wcześniej i niósł dwie rzeczy, obie zbędne: link „Mój dzień →"
            (czyli właśnie tę drogę powrotną) oraz „SP-AXA · Twój od 09:11 · N wzlotów"
            — a maszynę i trasę mówi już pasek górny, a liczbę cykli nagłówek logu dnia.
            Przed pierwszym uruchomieniem silnika wychodziło z tego pół ekranu na napis
            „jeszcze żadnego wzlotu". */}

        {/* Pasek paliwa stoi tu WYŁĄCZNIE jako przyrząd — czyli gdy ma czym być: odczyt
            plus szacunek wystarczalności z normy samolotu, ton ostrzeżenia i adnotacja
            o źródle. Bez normy pokazywał samą liczbę, tę samą co kafelek „Tankowanie"
            niżej; decyzję i podział ról opisuje `logic/cockpitFuel.ts` (2026-08-10). */}
        {fuel.strip != null && (
          <FuelStrip
            fuel={litres(projection.fuel.lastReadingL)}
            tone={fuelToneNow ?? 'neutral'}
            endurance={fuel.strip.endurance}
            source={fuel.strip.source}
          />
        )}

        {messages}

        <Card
          // `cyclesLabel` — ten sam nagłówek co w podglądzie 04b, gdzie odmiana była
          // od początku poprawna („1 cykl", nie „1 cykli").
          title={`Log dnia · UTC · ${cyclesLabel(projection.legs.length)} · ${projection.takeoffCount} T/O`}
          flush
        >
          {/* Log dnia jest w kokpicie WYŁĄCZNIE potwierdzeniem zapisu — bez ołówków
              (korekta = świadoma operacja w Liście ręcznej 08 i statystykach 10; tam
              mieszka arkusz 04c). Zamknięte cykle zwijają się do nagłówków, ostatni
              zostaje rozwinięty — świeża pamięć dnia (obie decyzje 2026-08-04). */}
          <DayLog
            sections={daySections}
            initiallyExpanded="last"
            emptyText="Brak zdarzeń — zacznij od START ENGINE."
          />
        </Card>

        <ActionGrid actions={groundActions} />
      </View>

      {leaveSheet}
      {toast}
    </Screen>
  );
}

/**
 * Brak sesji — dzień jeszcze się nie zaczął.
 *
 * Jedyne wejście prowadzi przez preflight (02 → 02a → 03): to tam pilot wybiera
 * samolot i odczytuje liczniki, a odczyt startowy jest początkiem łańcucha MH (§4.5).
 * Skrótu „otwórz dzień na sztywno" celowo nie ma — omijałby odczyty.
 */
function NoSession({ onStart }: { onStart: () => void }) {
  const { theme } = useTheme();
  const lastError = useSessionStore((s) => s.lastError);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
        <AppText variant="display" style={{ textAlign: 'center' }}>
          BRAK SESJI
        </AppText>
        <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
          Dzień lotny zaczyna się od preflightu — wyboru samolotu i odczytu liczników.
        </AppText>
        <ActionButton label="ROZPOCZNIJ PREFLIGHT" tone="green" variant="solid" onPress={onStart} />
        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}
      </View>
    </Screen>
  );
}
