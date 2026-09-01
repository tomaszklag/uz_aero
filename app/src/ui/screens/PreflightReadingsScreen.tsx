/**
 * UZ Aero - 02A NOWY LOT · krok 3/3: paliwo i motogodziny.
 *
 * Odwzorowanie mockupu `design/02a-preflight.html` wraz z arkuszami korekty z 02b/02c.
 * Struktura stamtąd: [box „brak danych"] → sekcja PALIWO → sekcja MOTOGODZINY →
 * poświadczenie → ROZPOCZNIJ LOT.
 *
 * Najważniejszy ekran przejęcia, bo tutaj powstaje **początek łańcucha MH** (§4.5) -
 * wartość, po której serwer porządkuje sesje samolotu.
 *
 * OSTATNI KROK: to ten przycisk zapisuje `session_claim` i `preflight_confirm`, i stąd
 * prowadzi wprost do kokpitu. Osobny ekran podsumowania (dawny `03`) został usunięty
 * 2026-08-07 - powtarzał wartości wpisane sekundę wcześniej i wydłużał drogę do lotu
 * o krok bez decyzji. Do tej chwili **nic nie jest zapisane**: szkic żyje w pamięci UI.
 *
 * Zasada nadrzędna (`CLAUDE.md`): **liczniki fizyczne > dane z serwera**. Przekazanie
 * od poprzednika jest podpowiedzią, nie prawdą. Dlatego każda wartość niesie adnotację
 * świeżości (§4.8: `live` bez adnotacji / `cache` z datą synchronizacji / `brak`),
 * historię, która do niej doprowadziła, i korektę na wyciągnięcie kciuka.
 *
 * Świeżość i łączność to **dwie różne osie** (komentarz z mockupu): „brak" zdarza się
 * też online - nowy samolot we flocie albo przejęcie bez danych.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  InlineNote,
  LevelBar,
  OilSheet,
  ReadingSheet,
  Readout,
  Screen,
  ScreenHeader,
  SyncChip,
  type Freshness,
  type SheetRow,
  type TrailRow,
} from '../components';
import { useTheme } from '../theme';
import { useGps } from '../bootstrap/servicesContext';
import { useCurrentPilot, useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
// Import wprost z infrastruktury (jak composition root w `appBootstrap`) - moduł
// dotyka `react-native`, więc nie ma go w barrelu.
import { requestNotificationPermission } from '../../infrastructure/permissions/notificationPermission';
import { claimDecision } from './logic/claimMode';
import { preflightBlocker } from './logic/preflightGate';
import {
  oilAfterRow,
  oilClaimView,
  oilEntryWarning,
  oilValueText,
  type OilConfig,
} from './logic/oilPreflight';
import {
  duration,
  litres,
  motoHours,
  oilLitres,
  parseLitres,
  maskMotoHoursInput,
  parseMotoHours,
  stampUtc,
  timeLocal,
} from '../format';
import { isJumpOperation } from '../../domain';
import type { HandoverTrailEntry, ReferencePilot } from '../../domain';

/** Próg, powyżej którego rozbieżność wobec przekazania wymaga świadomego potwierdzenia. */
const FUEL_WARN_L = 10;
const MH_WARN_H = 0.5;

/** Datownik osi czasu (mockup 02a) mieszka od issue #60 w `@uzaero/format` (`stampUtc`). */
const stamp = stampUtc;

/**
 * „29 JULY 16:50 UTC · 18:50 LT" - moment przekazania z JAWNĄ strefą.
 *
 * Tu, w odróżnieniu od osi czasu, strefę wypisujemy wprost: to jedyna data na ekranie,
 * po której pilot ocenia, czy odczyty są sprzed godziny czy sprzed tygodnia, a mylnie
 * odczytana o dwie godziny zmienia tę ocenę. LT jako wartość drugorzędna (`CLAUDE.md`),
 * z prawdziwej strefy telefonu - odpowiada na „a która to była u mnie".
 */
function stampUtcLt(t: number): string {
  return `${stamp(t)} UTC · ${timeLocal(t)} LT`;
}

export function PreflightReadingsScreen({
  navigation,
}: {
  navigation: { navigate: (s: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const synced = useSessionStore((s) => s.synced);
  const claim = useSessionStore((s) => s.claim);
  const confirmPreflight = useSessionStore((s) => s.confirmPreflight);
  const lastError = useSessionStore((s) => s.lastError);
  const sync = useSessionStore((s) => s.sync);
  const gps = useGps();

  const draft = usePreflightDraft();
  // Do rozstrzygnięcia, czy przekazanie jest „od kogoś", czy własne sprzed dnia przerwy.
  const pilotId = useCurrentPilot((s) => s.id);
  const [pilots, setPilots] = useState<ReferencePilot[]>([]);
  const [editing, setEditing] = useState<'fuel' | 'mh' | 'oil' | null>(null);
  const [busy, setBusy] = useState(false);

  const queries = useSessionStore((s) => s.queries);
  React.useEffect(() => {
    if (!queries) return;
    void queries.pilots().then(setPilots);
  }, [queries]);

  const aircraft = draft.aircraft;
  const handover = aircraft?.handover ?? null;
  const mhFormat = draft.mhFormat();

  const pilotName = useCallback(
    (id: string | null): string => pilots.find((p) => p.id === id)?.name ?? id ?? 'Poprzedni pilot',
    [pilots],
  );

  /**
   * ROZPOCZNIJ LOT - tu kończy się szkic, a zaczyna rejestr.
   *
   * Zapis zapadał do 2026-08-07 na osobnym ekranie podsumowania (dawny `03`). Ekran zniknął,
   * bo powtarzał to, co pilot wpisał sekundę wcześniej, i wydłużał drogę do kokpitu
   * o krok bez decyzji (`CLAUDE.md`: przejęcie ma trwać kilka sekund). Potwierdzeniem
   * jest ten przycisk: stoi pod wartościami, które właśnie utrwala.
   */
  const takeOver = useCallback(async () => {
    if (aircraft == null) return;

    // Rozgrzewka uprawnień na dzień lotny (lokalizacja + powiadomienia) - TUTAJ,
    // na ziemi, a nie przy pierwszym START ENGINE w środku checklisty silnika.
    // Sekwencyjnie (dwa systemowe dialogi naraz się gryzą), bez `await` w torze
    // przejęcia i bez patrzenia na wynik: odmowa NICZEGO nie blokuje (§4.1) -
    // kokpit sam pokaże tryb ręczny, a pasek usługi najwyżej schowa system.
    void (async () => {
      try {
        await gps?.requestPermission();
        await requestNotificationPermission();
      } catch {
        // Miękka prośba - cisza jest tu decyzją, nie przeoczeniem.
      }
    })();

    setBusy(true);
    try {
      // 1. Claim - od tej chwili to urządzenie jest jedynym piszącym dla tego samolotu.
      //
      //    Przy przejęciu pytamy serwer o ŻYWY stan (§4.4): odpowiedź awansuje claim
      //    do `takeover_online` (z aktualnym poprzednikiem - cache mógł wskazywać
      //    kogoś, kto już oddał samolot), brak odpowiedzi degraduje do
      //    `takeover_offline`. Bez zasięgu `fetchAircraftState` szybko wraca `null`
      //    i pilot leci dalej - sieć jest okazją, nie warunkiem (§6).
      const live =
        aircraft.claimPicId != null && sync != null
          ? await sync.fetchAircraftState(aircraft.id)
          : null;
      const decision = claimDecision(aircraft.claimPicId, live);
      await claim({
        sessionUuid: `sess-${Date.now()}`,
        aircraftId: aircraft.id,
        picId: pilotId,
        dualId: draft.dualId,
        mode: decision.mode,
        previousPicId: decision.previousPicId ?? undefined,
      });

      // 2. Preflight - odczyty liczników stają się początkiem łańcucha MH (§4.5).
      //
      //    `dutyStart` nie istnieje w payloadzie (§3.6a, domknięte issue #23): dzień
      //    pilota to lista sesji - klamry służby i godziny meldunku nie ma w modelu
      //    w ogóle, więc nie ma czego wysyłać.
      await confirmPreflight({
        operation: draft.operation,
        departureIcao: draft.departureIcao || null,
        arrivalIcao: draft.arrivalIcao || null,
        reading: { fuelL: draft.fuelL, mh: draft.mh },
        // Olej (issue #60): klucze tylko przy faktycznym wpisie - sesja bez pomiaru
        // nie niesie pustych pól, a brak klucza czyta się wszędzie tak samo jak null.
        ...(draft.oilL != null || draft.oilAddedL != null
          ? { oilL: draft.oilL, oilAddedL: draft.oilAddedL }
          : {}),
        client: draft.client,
        notes: draft.notes,
        mhFormat,
        // Ma sens WYŁĄCZNIE przy skokach - pole na 02e jest wtedy ukryte, ale
        // to jest bramka OSTATECZNA: wpis sprzed zmiany operacji nie wysyła
        // sierocej wartości do sesji innego rodzaju.
        jumperDefaults: isJumpOperation(draft.operation) ? draft.jumperDefaults : null,
      });

      draft.reset();
      navigation.navigate('Cockpit');
    } catch {
      // Twarde odrzucenie inwariantu trafia do `lastError` i jest pokazane niżej.
    } finally {
      setBusy(false);
    }
  }, [aircraft, claim, confirmPreflight, draft, gps, mhFormat, navigation, pilotId, sync]);

  /**
   * Stan świeżości (§4.8). Bez przekazania jest `brak` - niezależnie od sieci.
   * Z przekazaniem: gdy jesteśmy online, wartości są tak świeże, jak ostatni kontakt
   * z serwerem (`live`); offline to z definicji dane z ostatniej synchronizacji (`cache`).
   */
  const serverFreshness: Freshness = handover == null ? 'brak' : synced ? 'live' : 'cache';
  const syncedAt = aircraft != null ? stamp(aircraft.fetchedAt) : null;

  /**
   * Po ręcznej korekcie wartość NIE pochodzi już z serwera - i adnotacja musi to mówić.
   * Wcześniej ekran zostawiał tu „Ostatnie pobrane · …" obok liczby wpisanej przez
   * pilota (kłamstwo o pochodzeniu) albo oznaczał ją jako `live` (kłamstwo w drugą stronę).
   */
  const freshness: Freshness = draft.readingSource === 'manual' ? 'manual' : serverFreshness;

  // ── oś czasu: dane → napisy ──────────────────────────────────────────────────
  const trails = useMemo(() => {
    const entries = [...(handover?.trail ?? [])].sort((a, b) => a.at - b.at);
    const fuel: TrailRow[] = [];
    const mh: TrailRow[] = [];
    let lastFuel: number | null = null;

    for (const e of entries) {
      if (e.kind === 'refuel' && e.fuelDeltaL != null) {
        fuel.push({
          id: `f-${e.at}`,
          tone: 'amber',
          title: `Tankowanie · ${stamp(e.at)}`,
          meta: [
            `dolano +${Math.round(e.fuelDeltaL)} L`,
            e.fuelAfterL != null ? `w zbiorniku ${litres(e.fuelAfterL)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        });
      }

      if (e.kind === 'claim') {
        mh.push({
          id: `m-${e.at}`,
          title: `Przejęcie · ${stamp(e.at)}`,
          meta: `przed włączeniem ${motoHours(e.mhAfter, mhFormat)} MH`,
        });
      }

      if (e.kind === 'flight') {
        const flown = e.durationMs != null ? duration(e.durationMs) : null;
        const hours = e.durationMs != null ? e.durationMs / 3_600_000 : null;
        const title = `${pilotName(e.pilotId)} latał${flown != null ? ` · ${flown}` : ''}`;

        // Średnie liczymy z danych, nie przepisujemy - inaczej rozjechałyby się
        // z wartościami obok, gdy serwer przyśle inne liczby.
        const used = lastFuel != null && e.fuelAfterL != null ? lastFuel - e.fuelAfterL : null;
        fuel.push({
          id: `f-${e.at}`,
          title,
          meta: [
            used != null && hours ? `śr. ${(used / hours).toFixed(1)} L/h` : null,
            e.fuelAfterL != null ? `zostało ${litres(e.fuelAfterL)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        });

        mh.push({
          id: `m-${e.at}`,
          title,
          meta:
            e.mhAfter != null
              ? `po wyłączeniu ${motoHours(e.mhAfter, mhFormat)} MH`
              : 'brak odczytu licznika',
        });
      }

      if (e.fuelAfterL != null) lastFuel = e.fuelAfterL;
    }

    return { fuel, mh };
  }, [handover, mhFormat, pilotName]);

  const applyReading = useCallback(
    (key: 'fuelL' | 'mh', value: number) => {
      draft.set(key, value);
      // Ręczna korekta zrywa więź z przekazaniem - od tej chwili źródłem jest licznik.
      draft.set('readingSource', 'manual');
      setEditing(null);
    },
    [draft],
  );

  if (aircraft == null) {
    return (
      <Screen>
        <AppText variant="body" tone="muted">
          Najpierw wybierz samolot.
        </AppText>
      </Screen>
    );
  }

  const capacity = aircraft.capacityL;
  const missing = freshness === 'brak';
  // Powód, dla którego ROZPOCZNIJ LOT stoi - logika z testami (`preflightGate.ts`).
  // Pomiar oleju jest krokiem WYMAGANYM (decyzja 2026-08-27, issue #60).
  const blocker = preflightBlocker({
    fuelL: draft.fuelL,
    mh: draft.mh,
    oilL: draft.oilL,
    handoverMh: handover?.reading.mh ?? null,
  });

  // ── olej (issue #60): pomiar, nie potwierdzenie - logika w `logic/oilPreflight` ──
  const oilConfig: OilConfig = {
    minL: aircraft.oilMinL ?? null,
    capacityL: aircraft.oilCapacityL ?? null,
    normLPerH: aircraft.oilNormLPerH ?? null,
  };
  const oilView = oilClaimView({
    config: oilConfig,
    lastOil: handover?.oil ?? null,
    currentMh: draft.mh,
    mhFormat,
    synced,
    enteredL: draft.oilL,
    addedL: draft.oilAddedL,
    pilotName,
  });
  const oilSheetRows: SheetRow[] = [
    ...(oilView.expectedL != null
      ? [{ label: 'Oczekiwane wg normy', value: `≈ ${oilLitres(oilView.expectedL)}` }]
      : []),
    ...(oilConfig.minL != null
      ? [{ label: `Minimum przed lotem · ${aircraft.reg}`, value: oilLitres(oilConfig.minL) }]
      : []),
    ...(oilConfig.capacityL != null
      ? [{ label: `Zbiornik oleju · ${aircraft.reg}`, value: oilLitres(oilConfig.capacityL) }]
      : []),
  ];
  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="NOWY LOT"
          // Samolot RAZ, w nagłówku. Wcześniej rejestracja wracała w każdym podpisie
          // („z konfiguracji SP-ANK" pod paliwem, pod MH i w obu arkuszach) - a to jest
          // stała całego ekranu, nie właściwość pojedynczego odczytu. Zniknąć nie może:
          // odczyt wpisany dla złego samolotu zatruwa łańcuch MH (§4.5).
          subtitle={[aircraft.reg, aircraft.type].filter(Boolean).join(' · ')}
          step="3 / 3"
          onBack={navigation.goBack}
          right={<SyncChip />}
        />
      }
      // Przycisk dalej - przy dolnej krawędzi, niezależnie od tego, ile miejsca zajęła
      // oś czasu przekazania (reguła z 2026-07-30).
      footer={
        <ActionButton
          label="ROZPOCZNIJ LOT"
          tone="green"
          variant="solid"
          busy={busy}
          trailingIcon="next"
          disabledReason={blocker}
          onPress={takeOver}
        />
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        {/* ── brak przekazania: skąd wziąć wartości (`.none-box`) ────────── */}
        {missing && (
          <InlineNote
            icon="warning"
            tone="amber"
            text={
              `Brak danych przekazania dla ${aircraft.reg} (pusty cache / przejęcie offline). ` +
              'Wpisz odczyty z fizycznych liczników - Twój odczyt rozpocznie nowe ogniwo ' +
              'łańcucha; serwer scali dane po synchronizacji.'
            }
          />
        )}

        {/* ── paliwo ──────────────────────────────────────────────────────── */}
        <Readout
          label="Paliwo na pokładzie"
          value={missing && draft.fuelL <= 0 ? null : String(Math.round(draft.fuelL))}
          unit="L"
          tone="amber"
          freshness={freshness}
          syncedAt={syncedAt}
          gauge={<LevelBar ratio={draft.fuelL / capacity} tone="amber" />}
          caption={`${Math.round((draft.fuelL / capacity) * 100)}% pojemności · zbiorniki ${capacity} L`}
          trail={trails.fuel}
          onCorrect={() => setEditing('fuel')}
        />

        {/* ── motogodziny ─────────────────────────────────────────────────── */}
        <Readout
          label="Motogodziny silnika"
          value={missing && draft.mh <= 0 ? null : motoHours(draft.mh, mhFormat)}
          unit="MH"
          freshness={freshness}
          syncedAt={syncedAt}
          caption={`licznik w formacie ${mhFormat === 'hhmm' ? 'hh:mm' : 'dziesiętnym'}`}
          trail={trails.mh}
          onCorrect={() => setEditing('mh')}
        />

        {/* ── skąd te wartości (`.certified-row`) ───────────────────────────
            Mockup miał tu suchą pieczątkę „Poświadczył J. Kowalski · 21 JUNE · 17:30".
            Pilot zapytał wprost, co ten komunikat mówi i po kim przejmuje samolot -
            czyli pieczątka nie odpowiadała na jedyne pytanie, które w tym miejscu ma
            znaczenie: czyje są liczby stojące wyżej i co z nimi zrobić. Teraz mówi to
            wprost, z jawną strefą czasu.

            Świadomie NIE piszemy „poświadczył": serwer buduje przekazanie albo
            z zamkniętego dnia, albo z dnia jeszcze trwającego (`latestHandover`), a typ
            `Handover` tych dwóch przypadków nie rozróżnia. Słowo o poświadczeniu byłoby
            w drugim przypadku nieprawdą - a to ekran, na którym zaufanie do liczb jest
            całą treścią. */}
        {handover != null && (
          <InlineNote
            icon="check"
            tone="green"
            // Trzy akapity = trzy pytania w kolejności, w jakiej zadaje je pilot:
            // czyje to liczby → z kiedy → co mam z nimi zrobić. Godzina we własnej
            // linii, bo to jedyna wartość, której szuka się tu wzrokiem.
            text={[
              // `byPilotId === null` znaczy „nikt tego nie przekazał": to jest STAN
              // POCZĄTKOWY wpisany w panelu (issue #66), czyli pierwszy lot tej maszyny
              // w UZ Aero. Zdanie o poprzednim pilocie byłoby tu nieprawdą - a to ekran,
              // na którym zaufanie do liczb jest całą treścią.
              handover.byPilotId == null
                ? `Odczyty powyżej to stan początkowy ${aircraft.reg} wpisany w panelu - ` +
                  'to pierwszy lot tej maszyny w UZ Aero.'
                : handover.byPilotId === pilotId
                  ? `Odczyty powyżej to Twoje własne, z ostatniego dnia na ${aircraft.reg}.`
                  : `Odczyty powyżej przekazał ${pilotName(handover.byPilotId)} - to po nim przejmujesz ${aircraft.reg}.`,
              // Przy stanie początkowym `at` jest chwilą ZAPISU W PANELU, nie pomiaru -
              // i etykieta musi to mówić, inaczej byłaby inną wielkością pod tą samą nazwą.
              handover.byPilotId == null
                ? `Wpis z ${stampUtcLt(handover.at)}`
                : `Stan z ${stampUtcLt(handover.at)}`,
              'Sprawdź go na licznikach. Twój odczyt jest ważniejszy, a ewentualne ' +
                'nieścisłości zostaną rozwiązane przez koordynatora.',
            ].join('\n')}
          />
        )}

        {/* ── olej silnikowy (issue #60) - POMIAR, nie potwierdzenie ──────────
            Paliwo i MH wyżej pilot POTWIERDZA (przekazane wartości stoją wpisane);
            oleju nikt nie przekazuje - bagnet czyta się TERAZ. Dlatego wartość zaczyna
            PUSTA w każdym stanie świeżości (prefill oczekiwaną fabrykowałby pomiar).
            Pomiar jest krokiem WYMAGANYM (decyzja 2026-08-27) - bez niego ROZPOCZNIJ
            LOT stoi z powodem (`preflightBlocker`). Tag „opcjonalnie" tu NIE stoi,
            bo wymagalność jest stanem domyślnym formularza (oznaczamy wyłącznie to,
            co opcjonalne). Sekcja stoi ZA blokiem przekazania, bo nie jest jego częścią. */}
        <Readout
          label="Olej silnikowy"
          value={oilView.value}
          unit="L"
          freshness={oilView.freshness}
          syncedAt={syncedAt}
          caption={oilView.caption !== '' ? oilView.caption : undefined}
          missing={false}
          missingNote="Brak historii - pierwszy pomiar zacznie łańcuch"
          manualNote="Twój pomiar z bagnetu"
          correctLabel={draft.oilL != null || draft.oilAddedL != null ? 'Koryguj' : 'Wpisz pomiar'}
          trail={oilView.trail}
          onCorrect={() => setEditing('oil')}
        />

        {/* Ostrzeżenie warunkowe - znika razem z warunkiem (dolewką albo poprawką),
            nie zamyka się ręcznie. Poniżej minimum NIE blokuje: PIC decyduje (D3). */}
        {oilView.warning != null && (
          <InlineNote icon="warning" tone="amber" text={oilView.warning} />
        )}

        {/* ── ostrzeżenia warunkowe (dawny ekran 03) ──────────────────────────
            Odziedziczone po usuniętym podsumowaniu: to jedyne dwa komunikaty, których
            NIE widać z wartości stojących wyżej, więc razem z ekranem zniknąć nie mogły.
            Stoją nad przyciskiem, bo dotyczą tego, co on za chwilę zrobi. */}
        {aircraft.claimPicId != null && aircraft.claimPicId !== pilotId && (
          <Banner
            kind="warning"
            icon="warning"
            title={`Przejmujesz samolot od ${pilotName(aircraft.claimPicId)}`}
            text="Jeśli poprzedni pilot nadal prowadzi ten samolot, serwer oznaczy nakładkę do wyjaśnienia."
          />
        )}

        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie przejęto" text={lastError} />
        )}
      </View>

      {/* ── arkusze korekty (02b / 02c) ──────────────────────────────────── */}
      <ReadingSheet
        visible={editing === 'fuel'}
        title="Odczyt paliwa"
        unit="L"
        tone="amber"
        initialText={String(Math.round(draft.fuelL))}
        rows={[
          {
            label: 'Przekazane przez poprzednika',
            value: handover != null ? litres(handover.reading.fuelL) : 'brak danych',
          },
          {
            // Rejestracja zostaje tam, gdzie nagłówek ekranu jest zasłonięty arkuszem,
            // a pilot właśnie nadpisuje odczyt - samo słowo „konfiguracja" nic nie wnosiło.
            label: `Pojemność zbiorników · ${aircraft.reg}`,
            value: litres(capacity),
          },
        ]}
        parse={parseLitres}
        warningFor={(v) => {
          if (v > capacity) {
            return `Wpisane ${litres(v)} przekracza pojemność ${litres(capacity)}. Sprawdź odczyt.`;
          }
          if (handover == null) return null;
          const d = v - handover.reading.fuelL;
          return Math.abs(d) >= FUEL_WARN_L
            ? `Odczyt różni się od przekazanego o ${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))} L. ` +
                'Sprawdź stan zbiorników. Czy na pewno chcesz zapisać ten odczyt?'
            : null;
        }}
        onConfirm={(v) => applyReading('fuelL', v)}
        onCancel={() => setEditing(null)}
      />

      <ReadingSheet
        visible={editing === 'mh'}
        title="Odczyt motogodzin"
        unit="MH"
        tone="neutral"
        initialText={motoHours(draft.mh, mhFormat)}
        mask={(t) => maskMotoHoursInput(t, mhFormat)}
        rows={[
          {
            label: 'Przekazane przez poprzednika',
            value: handover != null ? `${motoHours(handover.reading.mh, mhFormat)} MH` : 'brak danych',
          },
          {
            label: `Format licznika · ${aircraft.reg}`,
            value: mhFormat === 'hhmm' ? 'hh:mm' : 'dziesiętny',
          },
        ]}
        parse={parseMotoHours}
        warningFor={(v) => {
          if (handover == null) return null;
          const d = v - handover.reading.mh;
          if (d < 0) {
            return (
              `Licznik nie może się cofnąć - ostatni znany stan to ${motoHours(handover.reading.mh, mhFormat)} MH. ` +
              'Zapis z niższą wartością zostanie odrzucony.'
            );
          }
          return d >= MH_WARN_H
            ? `Odczyt różni się od przekazanego o +${motoHours(d, mhFormat)}. Sprawdź licznik silnika.`
            : null;
        }}
        onConfirm={(v) => applyReading('mh', v)}
        onCancel={() => setEditing(null)}
      />

      {/* ── arkusz pomiaru oleju (02i) ───────────────────────────────────── */}
      <OilSheet
        visible={editing === 'oil'}
        initialLevelText={oilValueText(draft.oilL)}
        initialAddedText={oilValueText(draft.oilAddedL)}
        parse={parseLitres}
        rows={oilSheetRows}
        afterRowFor={(l, a) => oilAfterRow(l, a, oilConfig)}
        warningFor={(l, a) => oilEntryWarning(l, a, oilConfig, oilView.expectedL)}
        onConfirm={(l, a) => {
          draft.set('oilL', l);
          draft.set('oilAddedL', a);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    </Screen>
  );
}
