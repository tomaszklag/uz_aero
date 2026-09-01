/**
 * UZ Aero - KOKPIT (mockupy 04: ziemia · 05: lot)
 *
 * Jeden ekran, dwa tryby - zgodnie z §6: aplikacja **sama** przełącza tryb na podstawie
 * stanu silnika, pilot niczego nie wybiera.
 *
 *   • silnik OFF → GROUND (04): przewijalny ekran - status, wielki START ENGINE,
 *     pasek czasu służby, log całego dnia, siatka akcji naziemnych;
 *   • silnik ON  → LOT (05): pasek akcji **przypięty do dołu**, reszta przewijalna -
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
 * Cały ekran jest zbudowany z komponentów Design Systemu - nie ma tu własnych „kart"
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
  BoardingSheet,
  Card,
  CockpitActions,
  DetectToast,
  DropSheet,
  FuelStrip,
  LeaveCockpitSheet,
  ManualEventSheet,
  NoGpsBanner,
  ParamGrid,
  PhaseHero,
  ReadingSheet,
  Screen,
  SessionAxis,
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
import { duration, hhmm, litres, oilLitres, parseLitres, thousands, timeUtc } from '../format';
import { boardingInitialJumpers, boardingPrefill } from './logic/boardingPrefill';
import { buildCockpitActions } from './logic/cockpitActions';
import { cockpitFlightTimeMs } from './logic/cockpitFlightTime';
import { buildCockpitAxis } from './logic/cockpitLog';
import { currentFlightNumber } from './logic/flightNumber';
import { fuelTone } from './logic/fuelNorm';
import { buildCockpitFuel } from './logic/cockpitFuel';
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

/** Sekundowy tick - tylko gdy jest co odliczać. */
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
 * Ikona fazy - stan rozpoznawalny bez czytania napisu (komplet 2026-08-04):
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
  navigation: { navigate: (screen: string, params?: object) => void };
}) {
  const { theme } = useTheme();
  const gps = useGps();
  const sensors = useSensors();

  const context = useSessionStore((s) => s.context);
  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const warnings = useSessionStore((s) => s.warnings);
  const lastError = useSessionStore((s) => s.lastError);
  const startEngine = useSessionStore((s) => s.startEngine);
  const stopEngine = useSessionStore((s) => s.stopEngine);
  const drop = useSessionStore((s) => s.drop);
  const boarding = useSessionStore((s) => s.boarding);
  const addOil = useSessionStore((s) => s.addOil);
  const taxi = useSessionStore((s) => s.taxi);
  const takeoff = useSessionStore((s) => s.takeoff);
  const landing = useSessionStore((s) => s.landing);

  // Konfiguracja i norma zużycia z cache'u referencyjnego - do paska paliwa (mockup 04).
  // Dane lokalne, więc kokpit nigdy nie czeka na sieć.
  const aircraft = useAircraft(projection.aircraftId);

  const [busy, setBusy] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [boardingOpen, setBoardingOpen] = useState(false);
  // Dolewka oleju z kokpitu (issue #60) - arkusz, nie ekran: jedna liczba.
  const [oilOpen, setOilOpen] = useState(false);
  // Czas w nagłówku arkusza załadunku - łapany przy OTWARCIU: na ziemi przed startem
  // ticker sekundowy nie chodzi (`useTicker(engineOn)`), więc „teraz" z rendera
  // potrafiłoby być sprzed kilku minut.
  const [boardingOpenedAt, setBoardingOpenedAt] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  /**
   * KOKPIT JEST STANEM MODALNYM (decyzja 2026-08-10) - i egzekwuje to także wobec
   * przycisku sprzętowego. Bez tej bramki „wstecz" zdejmował kokpit ze stosu i pokazywał
   * 02a: formularz przejęcia maszyny, która jest już przejęta.
   *
   * `usePreventRemove`, a nie `BackHandler`: łapie KAŻDE zdjęcie ekranu, więc obok
   * przycisku obejmuje też gest cofania krawędzią - a to ten sam błąd popełniony innym
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

  const { fix, phase, dropAltitudeFt, pending, undo, gpsAvailable, lastFixAt, permissionDenied } =
    useFlightDetection({
      gps,
      enabled: engineOn,
      fieldElevationFt,
      // Skoki latają z i na to samo lotnisko - geofence odcina „lądowanie" daleko od
      // pola (artefakt GPS). Przelot i egzamin lądują gdzie chcą - bez bramki.
      // Ten sam predykat rozstrzyga, czy preflight pyta o jedno lotnisko, czy o parę.
      sameFieldOnly: projection.operation != null && isSameFieldOperation(projection.operation),
    });
  // Nagrywanie czujników pokładowych do śladu kalibracyjnego - ten hook NIC nie decyduje
  // i celowo stoi obok detekcji, a nie w niej (patrz nagłówek `useSensorTrace`).
  useSensorTrace({ sensors, enabled: engineOn });

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      // Powód jest w `lastError` - pokazujemy go banerem niżej.
    } finally {
      setBusy(false);
    }
  }, []);

  const handleStart = useCallback(
    () =>
      run(() =>
        startEngine({
          // Elewację zapisujemy przy starcie - potem nie ma z czego jej odtworzyć.
          fieldElevationFt: fix?.altitudeFt ?? null,
        }),
      ),
    [fix, run, startEngine],
  );

  /**
   * STOP ENGINE kończy jedyny bieg tej sesji (model 2026-08-10) - dalej jest już tylko
   * ZDAJ SAMOLOT. Zapis może odbić reguła (np. w powietrzu), więc nawigacji tu nie ma
   * żadnej: sukces i odmowa oba zostawiają pilota w kokpicie, tylko w innych stanach.
   */
  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      await stopEngine();
      // ZOSTAJEMY w kokpicie (model 2026-08-10): po STOP ENGINE ekran przechodzi sam
      // w stan „po zatrzymaniu" (hero ZDAJ SAMOLOT), bo `engineRunning` gaśnie
      // w projekcji. Do 2026-08-10 stąd otwierał się ekran 09 (zamknięcie wzlotu) -
      // usunięty razem z `leg_close`; zatwierdzenie mieszka na 09B.
    } catch {
      // Powód jest w `lastError` - pokazujemy go banerem niżej.
    } finally {
      setBusy(false);
    }
  }, [stopEngine]);

  if (!context) return <NoSession onStart={() => navigation.navigate('PreflightAircraft')} />;

  /**
   * LOG SESJI - ta sama oś, co w rozliczeniu (issue #44), plus wiersz „na żywo"
   * i znaczniki outboxa. Format motogodzin bierze z projekcji sam builder, więc ekran
   * nie przekazuje go już osobno.
   */
  const axis = buildCockpitAxis(events, projection, now);

  /**
   * Czas lotu SESJI: loty zamknięte (wszystko jedno, czy z GPS, czy dopisane ręcznie)
   * plus lot otwarty na żywo. Reguła ma test i mieszka w `logic/cockpitFlightTime.ts` -
   * ekran jej nie rozstrzyga, bo poprzedni wzór stał w JSX i po cichu gubił w locie
   * wszystkie wcześniejsze loty.
   */
  const liveFlightMs = cockpitFlightTimeMs({
    closedMs: projection.flightTimeMs,
    openTakeoffAt: projection.openTakeoffAt,
    now,
  });

  /**
   * Czy w tym dniu wynosi się skoczków - od tego zależy, czy pasek akcji ma przycisk
   * zrzutu (issue #19). Pyta o to domena, tak samo jak o kształt trasy w preflightcie.
   */
  const jumpDay = projection.operation != null && isJumpOperation(projection.operation);

  /**
   * Ton odczytu paliwa z szacunku czasu lotu (issue #19): amber godzinę przed rezerwą,
   * czerwony na rezerwie. `null` = brak normy, czyli nie ma czym kolorować - odczyt
   * zostaje neutralny zamiast świecić na pomarańczowo przy pełnych zbiornikach.
   */
  const fuelToneNow = fuelTone(projection.fuel.lastReadingL, aircraft?.consumption ?? null);

  /**
   * Podział ról między paskiem paliwa i kafelkiem „Tankowanie" - jedna liczba, jedno
   * miejsce (`logic/cockpitFuel.ts`). Ekran sam tego NIE rozstrzyga, bo reguła ma test.
   */
  const fuel = buildCockpitFuel({
    fobL: projection.fuel.lastReadingL,
    addedL: projection.fuel.addedL,
    norm: aircraft?.consumption ?? null,
  });

  /** Komunikaty wspólne dla obu trybów - nigdy cichy błąd (§6 pkt 3). */
  const messages = (
    <>
      {lastError != null && (
        <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
      )}
      {warnings.length > 0 && (
        <Banner
          kind="warning"
          icon="warning"
          title="Zapisane - sprawdź"
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
          pending.fix.groundSpeedKt != null ? Math.round(pending.fix.groundSpeedKt) : '-'
        } KT`}
        secondsLeft={pending.secondsLeft}
        undoLabel={pending.detection === 'takeoff' ? 'COFNIJ - NIE BYŁO STARTU' : 'COFNIJ - TO PRZELOT'}
        onUndo={undo}
      />
    );

  /**
   * Arkusz blokady wyjścia (04d) - jeden dla OBU trybów kokpitu. „Wstecz" w locie jest
   * dokładnie tą samą pomyłką co na ziemi, a arkusz na `Modal` z RN wyświetla się nad
   * każdym układem, więc nie ma powodu utrzymywać dwóch kopii.
   */
  const leaveSheet = (
    <LeaveCockpitSheet
      visible={leaveOpen}
      aircraftId={projection.aircraftId ?? '-'}
      since={projection.claimedAt != null ? `${timeUtc(projection.claimedAt)} UTC` : null}
      flightCount={projection.flights.length}
      onStay={() => setLeaveOpen(false)}
      onRelease={() => {
        setLeaveOpen(false);
        navigation.navigate('ReleaseAircraft');
      }}
    />
  );

  /**
   * Skład CZEKAJĄCY na zrzut - jedno źródło dla obu arkuszy skokowych (issue #28):
   * zrzut otwiera nim liczniki do potwierdzenia, a ponownie otwarty załadunek pokazuje
   * to, co pilot już zadeklarował (zamiast kasować się do zera). Reguła i przypadek
   * „załadunek bez liczb" mieszkają w `logic/boardingPrefill.ts`.
   */
  const pendingBoarding = boardingPrefill(projection.boarding);

  /**
   * Arkusz załadunku (05i) - JEDEN dla obu trybów kokpitu, jak arkusz blokady wyjścia:
   * przed pierwszym uruchomieniem silnika załadunek wchodzi z siatki akcji naziemnych
   * (04a), między lotami - ze slotu paska akcji (issue #21 pkt 7). Skład jest
   * opcjonalny; zadeklarowany stanie się prefill-em arkusza zrzutu.
   */
  const openBoarding = () => {
    setBoardingOpenedAt(Date.now());
    setBoardingOpen(true);
  };
  const boardingSheet = (
    <BoardingSheet
      visible={boardingOpen}
      flightNumber={currentFlightNumber(projection.flights.length, inFlight)}
      time={timeUtc(boardingOpenedAt)}
      initialJumpers={boardingInitialJumpers(projection.boarding, projection.jumperDefaults)}
      declaredTime={pendingBoarding.at != null ? timeUtc(pendingBoarding.at) : null}
      busy={busy}
      onConfirm={(jumpers) => {
        setBoardingOpen(false);
        void run(() => boarding({ jumpers }));
      }}
      onCancel={() => setBoardingOpen(false)}
    />
  );

  /**
   * Arkusz dolewki oleju (issue #60, decyzja 2026-08-27: dolewka zdarza się także PO
   * przejęciu). Jedna liczba - poziomu po dolewce nie ma jak uczciwie zmierzyć (silnik
   * zwykle gorący), a rachunek interwału olejowego traktuje dolewkę jako składnik,
   * nie granicę. Wiersze odniesienia: co wiadomo z przejęcia i z konfiguracji.
   */
  const oilSheet = (
    <ReadingSheet
      visible={oilOpen}
      title="Dolewka oleju"
      unit="L"
      tone="neutral"
      initialText=""
      rows={[
        ...(projection.oil.afterL != null
          ? [{ label: 'Przy przejęciu · po dolewkach', value: oilLitres(projection.oil.afterL) }]
          : []),
        ...(aircraft?.oilMinL != null
          ? [{ label: 'Minimum przed lotem', value: oilLitres(aircraft.oilMinL) }]
          : []),
        ...(aircraft?.oilCapacityL != null
          ? [{ label: 'Zbiornik oleju', value: oilLitres(aircraft.oilCapacityL) }]
          : []),
      ]}
      parse={parseLitres}
      warningFor={(v) =>
        aircraft?.oilCapacityL != null && v > aircraft.oilCapacityL
          ? `Dolewka ${oilLitres(v)} nie zmieści się w zbiorniku (${oilLitres(aircraft.oilCapacityL)}) - popraw wpis.`
          : null
      }
      onConfirm={(v) => {
        setOilOpen(false);
        void run(() => addOil({ addedL: v }));
      }}
      onCancel={() => setOilOpen(false)}
    />
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TRYB LOT (mockup 05) - układ stały, przewija się tylko log sesji.
  // ─────────────────────────────────────────────────────────────────────────
  if (engineOn) {
    // Degradacja CZUJNIKA (mockup 05g) - osobna oś od sieci: SyncChip może świecić
    // zielono, a autodetekcja stoi. Baner-przyrząd + ręczny zapis jako jedyna droga.
    // `gpsLost` steruje degradacją danych (siatka, faza, etykiety ręczne) - brak
    // danych to brak danych. TON banera różnicuje dopiero `signal`: rozruch
    // odbiornika po START ENGINE to nie awaria (decyzja UX 2026-08-04).
    const gpsLost = !gpsAvailable;
    const signal = gpsSignalState(gpsAvailable, lastFixAt, permissionDenied);

    /**
     * Pasek akcji = NASTĘPNE zdarzenie sekwencji lotu (idle → Taxi → Take off →
     * Landing) plus reguły zrzutu (tylko dzień skokowy, w powietrzu, aktywny
     * w Cruise). Ekran tego nie rozstrzyga - reguła mieszka w
     * `logic/cockpitActions.ts` i ma test (decyzja 2026-08-11).
     */
    const actions = buildCockpitActions({
      inFlight,
      taxiing: projection.taxiing,
      jumpDay,
      gpsLost,
      phase: phase.phase,
    });

    return (
      <Screen padded={false}>
        <AppBar
          aircraft={projection.aircraftId}
          subtitle={[projection.departureIcao, projection.arrivalIcao].filter(Boolean).join(' → ')}
          compact
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <SyncChip />
              <StatusChip label="Running" tone="green" />
            </View>
          }
          onSettings={() => navigation.navigate('Settings')}
        />

        {/*
          Środek przewija się w całości, pasek akcji jest przypięty do dołu (poprawka
          z urządzenia, 2026-07-29). Mockup 05 zakłada układ sztywny z przewijanym
          wyłącznie logiem i przy czterech sekcjach to działa - ale baner 05g plus
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
          {/* ── `.no-gps` (05g): baner typu STATUS - przyrząd, znika sam z powrotem fixa.
               Trzy stany, JEDEN kolor (amber, decyzja 2026-08-12): rozruch odbiornika,
               utrata fixa i brak uprawnienia różnią się TREŚCIĄ, bo dla pilota znaczą
               to samo - autodetekcja nie pracuje, zapisujesz sam z paska akcji.

               BEZ PRZYCISKÓW (decyzja 2026-08-12): zapis zdarzeń mieszka w pasku akcji
               na dole i nigdzie indziej. „Zapisz zdarzenie" otwierało stąd ten sam
               arkusz 05f, co przycisk główny paska, a „Lista ręczna" dublowała kafelek
               z 04 - na przyrządzie wyglądało to jak drugi, konkurencyjny pasek akcji. ── */}
          {signal === 'acquiring' && (
            <NoGpsBanner
              title="GPS: wyszukiwanie sygnału · autodetekcja uzbraja się"
              text={gpsAcquiringText()}
            />
          )}
          {signal === 'permission' && (
            <NoGpsBanner
              title="GPS: brak uprawnienia · autodetekcja wyłączona"
              text={gpsPermissionText()}
            />
          )}
          {signal === 'lost' && <NoGpsBanner text={gpsLossText(lastFixAt, now)} />}

          <PhaseHero
            // Fazy z GPS nie znamy; „w locie" wiemy ZE ZDARZEŃ - projekcja nie potrzebuje fixa.
            phase={gpsLost && inFlight ? 'In Flight' : PHASE_LABEL[phase.phase]}
            icon={gpsLost && inFlight ? 'phase-cruise' : PHASE_ICON[phase.phase]}
            // Ton z FAZY, nie ze stanu odbiornika (decyzja 2026-08-12): brak fixa
            // przemalowywał hero na amber, a to sygnał o czujniku doklejony do napisu
            // o locie. Że fazy nie znamy, mówi linia `detail` niżej i baner wyżej.
            // Lot znany ze zdarzeń dostaje ton lotu - tę samą decyzję, co nazwa i ikona.
            tone={gpsLost && inFlight ? PHASE_TONE.cruise : PHASE_TONE[phase.phase]}
            // Linia kontekstu tylko przy utracie GPS (FAZA NIEZNANA · BEZ FIXA OD…).
            // Prędkość wznoszenia wyleciała (2026-08-04): rejestrator, nie przyrząd -
            // wariometr pilot ma na tablicy, a trend niesie sama nazwa fazy.
            detail={gpsLost ? unknownPhaseDetail(lastFixAt) : undefined}
          />

          <ParamGrid
            cells={
              gpsLost
                ? [
                    { label: 'Ground speed', value: '- -', unit: 'KT', stale: true, note: staleCellNote(lastFixAt) },
                    { label: 'Altitude', value: '- -', unit: 'FT', stale: true, note: staleCellNote(lastFixAt) },
                    {
                      label: 'Fuel on board',
                      value: `~${Math.round(projection.fuel.lastReadingL ?? 0)}`,
                      unit: 'L',
                      // Ton z szacunku, nie „zawsze amber" - patrz `fuelToneNow`.
                      tone: fuelToneNow ?? 'neutral',
                      tint: fuelToneNow != null && fuelToneNow !== 'neutral',
                      note: 'dane lokalne - bez GPS',
                    },
                    {
                      label: 'Flight time',
                      value: hhmm(liveFlightMs),
                      note: 'zegar - liczy normalnie',
                    },
                  ]
                : [
                    {
                      label: 'Ground speed',
                      // Brak prędkości od odbiornika to „-", nie „0" - zero jest odczytem,
                      // a tego odczytu nikt nie wykonał (patrz `toFix` w adapterze GPS).
                      value: fix?.groundSpeedKt != null ? `${Math.round(fix.groundSpeedKt)}` : '-',
                      unit: 'KT',
                    },
                    {
                      label: 'Altitude',
                      value: fix?.altitudeFt != null ? thousands(fix.altitudeFt) : '-',
                      unit: 'FT',
                    },
                    {
                      // Tylda jak w mockupach 05/05g: to ostatni ODCZYT, nie stan
                      // bieżący - w locie paliwa jest już mniej i „~" mówi to wprost.
                      label: 'Fuel on board',
                      value: `~${Math.round(projection.fuel.lastReadingL ?? 0)}`,
                      unit: 'L',
                      // AMBER TYLKO WTEDY, GDY JEST O CO (issue #19): kolor ostrzegawczy
                      // świecący przy pełnych zbiornikach przestaje cokolwiek znaczyć.
                      tone: fuelToneNow ?? 'neutral',
                      tint: fuelToneNow != null && fuelToneNow !== 'neutral',
                    },
                    // `hhmm` (00:47), nie `duration` (0:47) - mockup trzyma w tej komórce
                    // format karty lotów. Bez zieleni (issue #19): czas lotu jest odczytem,
                    // a nie stanem wymagającym uwagi - wyróżniał się bez powodu.
                    { label: 'Flight time', value: hhmm(liveFlightMs) },
                  ]
            }
          />

          {/* Komunikaty NAD logiem: log rośnie bez ograniczeń, więc wszystko, co ma być
              przeczytane, stoi przed nim - inaczej „Nie zapisano" lądowałoby poniżej
              krawędzi ekranu, a §6 pkt 3 nie zna cichego błędu. */}
          {(lastError != null || warnings.length > 0) && (
            <View style={{ paddingHorizontal: 14, paddingTop: theme.spacing.sm, gap: theme.spacing.sm }}>
              {messages}
            </View>
          )}

          {/* Log sesji - jedyny element bez własnej wysokości: rośnie z liczbą zdarzeń,
              a przy krótkim logu rozpycha się do paska akcji (`flexGrow`), więc
              pełnoekranowa wstęga z mockupu zostaje. `flexShrink: 0` pilnuje, żeby się
              nie ścisnął, gdy sekcje wyżej zabiorą całą wysokość.

              Karta pojawia się dopiero, gdy w sesji zaszło coś OPERACYJNEGO (issue #19,
              `axis.hasEvents`): oś złożona z przejęcia, uruchomienia i wiersza „na żywo"
              powtarzałaby to, co ekran mówi wyżej. Nagłówek bez liczb T/O i LDG
              (issue #44) - mówi je sama oś, a słowo „cykl" odeszło razem z modelem
              wielu cykli. */}
          {axis.hasEvents && (
            <Card
              title="Log sesji · UTC"
              // Helper, nie wzór w JSX - inline'owe `+ (inFlight ? 1 : 0)` dawało
              // „Lot #2" w pierwszym locie (issue #21 pkt 1, `logic/flightNumber.ts`).
              headerRight={
                <Tag label={`Lot #${currentFlightNumber(projection.flights.length, inFlight)}`} />
              }
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
              {/* Bez `onCorrect`: w kokpicie oś jest wyłącznie potwierdzeniem zapisu.
                  Poprawianie ma jedne drzwi - kafelek „Popraw dane sesji" po
                  zatrzymaniu silnika (issue #43). */}
              <SessionAxis rows={axis.rows} />
            </Card>
          )}
        </ScrollView>

        <CockpitActions
          // Etykieta, ikona, obecność i przygaszenie zrzutu - wszystko z
          // `logic/cockpitActions.ts`: sekwencja idle → Taxi → Take off → Landing,
          // zrzut tylko w powietrzu dnia skokowego i aktywny w Cruise, pełne nazwy
          // zamiast skrótów (issue #19). Stanu GPS-a pasek nie sygnalizuje niczym
          // (decyzja 2026-08-12) - od tego jest baner i siatka parametrów.
          primaryLabel={actions.primaryLabel}
          primaryIcon={actions.primaryIcon}
          onPrimary={() => {
            // Kołowanie zapisuje się OD RAZU - bez arkusza 05f i bez okna COFNIJ:
            // taxi nie wyznacza żadnego czasu, pomyłka kosztuje jeden wiersz w logu
            // (ta sama zasada co przy autodetekcji). Start i lądowanie idą przez
            // arkusz, bo ich czas trafia do dokumentów i bywa cofany.
            if (actions.primary === 'taxi') {
              if (!busy) void run(() => taxi('manual', null));
            } else {
              setManualOpen(true);
            }
          }}
          onDrop={actions.showDrop ? () => setDropOpen(true) : undefined}
          dropDisabledReason={actions.dropDisabledReason}
          onBoarding={actions.showBoarding ? openBoarding : undefined}
          onStop={handleStop}
          // `engine_stop` w powietrzu byłby fałszywym wpisem - blokujemy z powodem (§3.2).
          stopDisabledReason={inFlight ? 'Silnik zatrzymasz po wylądowaniu i dobiegu' : null}
        />

        {/* ── zrzut (mockup 05e) - arkusz nad kokpitem, nie osobny ekran ── */}
        <DropSheet
          visible={dropOpen}
          // Numer LOTU, nie zrzutu - w jednym locie bywa kilka wyniesień.
          flightNumber={currentFlightNumber(projection.flights.length, inFlight)}
          time={timeUtc(now)}
          // Wysokość z GPS, ale ŚREDNIA z okna, nie ostatni fix (issue #21 pkt 2) -
          // pilot ustawia wyłącznie liczby skoczków, i to tylko gdy prefill z załadunku
          // nie zrobił tego za niego.
          altitudeFt={dropAltitudeFt}
          client={projection.client}
          initialJumpers={pendingBoarding.jumpers}
          boardingTime={pendingBoarding.at != null ? timeUtc(pendingBoarding.at) : null}
          busy={busy}
          onConfirm={(jumpers) => {
            setDropOpen(false);
            void run(() => drop({ jumpers, altitudeFt: dropAltitudeFt }));
          }}
          onCancel={() => setDropOpen(false)}
        />

        {/* ── wpis ręczny (mockup 05f) - ratunek na fałszywą detekcję GPS ── */}
        <ManualEventSheet
          visible={manualOpen}
          initialType={inFlight ? 'landing' : 'takeoff'}
          now={now}
          formatTime={timeUtc}
          busy={busy}
          onConfirm={(type, at) => {
            setManualOpen(false);
            // Czas wybrany przez pilota JEST czasem zdarzenia - zapis dostaje go jawnie,
            // a chwila zapisu zostaje w `deviceTime` (§5.1, dwa zegary).
            void run(() =>
              type === 'takeoff' ? takeoff('manual', null, at) : landing('manual', null, at),
            );
          }}
          onCancel={() => setManualOpen(false)}
        />

        {boardingSheet}
        {leaveSheet}
        {toast}
      </Screen>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRYB GROUND - DWA STANY (model 2026-08-10, mockupy 04a i 04):
  //   • PRZED uruchomieniem: hero START ENGINE, tankowanie, zmiana załogi,
  //     zdanie bez lotu;
  //   • PO zatrzymaniu: hero ZDAJ SAMOLOT - drugiego startu NIE MA
  //     (SESSION_ALREADY_RAN), tankowanie nadal, lista ręczna do naprawy
  //     przegapionych zdarzeń przed zatwierdzeniem logu.
  // ─────────────────────────────────────────────────────────────────────────
  const sessionEnded = projection.legs.some((l) => l.stoppedAt != null);

  /**
   * Akcje naziemne (`.action-grid`) - skład zależy od STANU sesji, nie od jednej listy:
   *  • zmiana załogi tylko PRZED startem (po biegu nowa załoga = nowe przejęcie),
   *  • lista ręczna tylko PO biegu (pusta sesja nie ma czego naprawiać),
   *  • kafelek zdania tylko PRZED startem (po biegu zdanie awansowało na hero);
   *    prowadzi wtedy do wariantu 09C - rezygnacji bez lotu.
   */
  const refuelAction: ActionCardSpec = {
    id: 'refuel',
    icon: 'refuel',
    label: 'Tankowanie',
    tone: 'amber',
    // Podpis zależy od tego, czy pasek paliwa jest na ekranie: gdy jest, kafelek nie
    // powtarza litrów; gdy go nie ma, to ON niesie stan zbiorników (`cockpitFuel.ts`).
    sub: fuel.refuelSub,
    onPress: () => navigation.navigate('Refuel'),
  };

  /**
   * Dolewka oleju (issue #60, decyzja 2026-08-27) - jak tankowanie: PRZED uruchomieniem
   * i PO zatrzymaniu, przy zatrzymanym śmigle. Podpis niesie minimum z konfiguracji
   * (odniesienie decyzji „czy dolewać"), nie pomiar z przejęcia - ten stoi w logu
   * sesji niżej, a kokpit nie powtarza tego, co mówi log (reguła stanu modalnego).
   */
  const oilAction: ActionCardSpec = {
    id: 'oil',
    icon: 'oil',
    label: 'Dolej olej',
    sub: aircraft?.oilMinL != null ? `Minimum ${oilLitres(aircraft.oilMinL)}` : 'Olej silnikowy',
    onPress: () => setOilOpen(true),
  };

  const groundActions: ActionCardSpec[] = sessionEnded
    ? [
        refuelAction,
        oilAction,
        {
          // POPRAW DANE SESJI (issue #43) - następca „Listy ręcznej" (ekran 08 usunięty).
          // Prowadzi do TRYBU EDYCJI ekranu sesji i wraca TU, do kokpitu: bez tego
          // wejścia pilot po STOP ENGINE nie miałby jak naprawić brakującego lądowania
          // PRZED zdaniem samolotu, a zdanie zatwierdza log. Modalności kokpitu to nie
          // łamie - maszyna zostaje w jego rękach, zmienia się tylko ekran.
          id: 'edit-session',
          icon: 'edit',
          label: 'Popraw dane sesji',
          // Odmiana z `flightsBadge` - „1 lotów" na żywym kokpicie wyglądało jak
          // literówka w przyrządzie. Ta sama funkcja liczy badge na 10.
          sub: `Czasy i odczyty · ${flightsBadge(projection.flights.length)}`,
          onPress: () => navigation.navigate('Stats', { edit: true, from: 'Cockpit' }),
        },
      ]
    : [
        refuelAction,
        oilAction,
        // Załadunek TYLKO w dniu skokowym i TYLKO przed startem (issue #21 pkt 7):
        // pierwszy skład wsiada zwykle przy wyłączonym silniku, a jego deklaracja tu
        // otwiera arkusz zrzutu już wypełniony. Po biegu kafelka nie ma - kolejny lot
        // to nowe przejęcie. Podpis jest STAŁY: zapisany załadunek widać w logu sesji
        // niżej, a kokpit nie powtarza tego, co mówi log (reguła stanu modalnego).
        ...(jumpDay
          ? [
              {
                id: 'boarding',
                icon: 'boarding',
                label: 'Załadunek',
                tone: 'blue',
                sub: 'Skoczkowie na pokład',
                onPress: openBoarding,
              } satisfies ActionCardSpec,
            ]
          : []),
        {
          id: 'crew',
          icon: 'crew',
          label: 'Zmiana załogi',
          sub: `PIC: ${projection.picId ?? '-'}${projection.dualId != null ? ` · DUAL: ${projection.dualId}` : ''}`,
          onPress: () => navigation.navigate('CrewChange'),
        },
        {
          id: 'release',
          icon: 'end-day',
          label: 'Zdaj samolot',
          tone: 'red',
          // Przed startem zdanie = rezygnacja z lotu (pogoda, usterka) - wariant 09C
          // włączy się na ekranie zdania sam, brakiem lotów.
          sub: 'Nie lecisz? Zdanie bez lotu',
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
        right={<SyncChip />}
        // `.settings-btn` z mockupu 04 → ekran 13 (ustawienia: motyw, PIN, konto,
        // diagnostyka GPS).
        onSettings={() => navigation.navigate('Settings')}
      />

      <View style={{ padding: theme.spacing.lg, gap: 14 }}>
        {/* Hero mówi jedyną rzecz, która została do zrobienia. Po zatrzymaniu silnika
            drugiego STARTU nie ma (sesja = jeden bieg, SESSION_ALREADY_RAN) - zostaje
            oddanie maszyny z odczytami. Bez przytrzymania: to nawigacja do formularza
            z własnym potwierdzeniem, nie akcja nieodwracalna. */}
        {sessionEnded ? (
          <ActionButton
            label="ZDAJ SAMOLOT"
            tone="red"
            size="hero"
            icon="end-day"
            hint="Odczyt paliwa i motogodzin · zatwierdzenie logu sesji"
            onPress={() => navigation.navigate('ReleaseAircraft')}
          />
        ) : (
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
        )}

        {/* KOKPIT JEST STANEM MODALNYM (decyzja 2026-08-10) - stąd nie ma paska sesji
            ani żadnego innego wyjścia na 01. Kto trzyma samolot, oddaje go przez „Zdaj
            samolot" (09B); dopóki go trzyma, ekranem pilota jest kokpit.

            Pasek stał tu wcześniej i niósł dwie rzeczy, obie zbędne: link „Mój dzień →"
            (czyli właśnie tę drogę powrotną) oraz „SP-AXA · Twój od 09:11 · N wzlotów"
            - a maszynę i trasę mówi już pasek górny, a liczbę cykli nagłówek logu dnia.
            Przed pierwszym uruchomieniem silnika wychodziło z tego pół ekranu na napis
            „jeszcze żadnego wzlotu". */}

        {/* Pasek paliwa stoi tu WYŁĄCZNIE jako przyrząd - czyli gdy ma czym być: odczyt
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
          // Log SESJI, nie dnia (mockup 04): jedna płaska oś od przejęcia do teraz -
          // historia dnia mieszka na 01 i w rozliczeniu. Liczby lotów w tytule NIE MA
          // (issue #44): mówi ją stopka osi, a jedna liczba dwa razy na tej samej
          // karcie uczy oko pomijać nagłówek.
          title="Log sesji · UTC"
          flush
        >
          {/* Ta sama oś, co na ekranie sesji (10) - bez ołówków, bo w kokpicie log jest
              WYŁĄCZNIE potwierdzeniem zapisu; poprawianie ma jedne drzwi, kafelek
              „Popraw dane sesji" niżej (issue #43).

              Stopka sum pojawia się dopiero po zatrzymaniu silnika (`axis.foot` jest
              wtedy niepusta) - dopóki silnik pracuje, nie ma czego sumować. */}
          <SessionAxis
            rows={axis.rows}
            foot={axis.foot}
            emptyText="Brak wpisów - uruchom silnik, aby rozpocząć pierwszy lot."
          />
        </Card>

        <ActionGrid actions={groundActions} />
      </View>

      {boardingSheet}
      {oilSheet}
      {leaveSheet}
      {toast}
    </Screen>
  );
}

/**
 * Brak sesji - dzień jeszcze się nie zaczął.
 *
 * Jedyne wejście prowadzi przez preflight (02 → 02a → 03): to tam pilot wybiera
 * samolot i odczytuje liczniki, a odczyt startowy jest początkiem łańcucha MH (§4.5).
 * Skrótu „otwórz dzień na sztywno" celowo nie ma - omijałby odczyty.
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
          Dzień lotny zaczyna się od preflightu - wyboru samolotu i odczytu liczników.
        </AppText>
        <ActionButton label="ROZPOCZNIJ PREFLIGHT" tone="green" variant="solid" onPress={onStart} />
        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}
      </View>
    </Screen>
  );
}
