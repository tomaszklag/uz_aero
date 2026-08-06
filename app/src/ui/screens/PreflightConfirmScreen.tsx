/**
 * UZ Aero — 03 PREFLIGHT · krok 4/4: podsumowanie i potwierdzenie.
 *
 * Odwzorowanie mockupu `design/03-preflight-confirm.html`: karta podsumowania (samolot,
 * trasa, tag operacji) → dwukolumnowa siatka szczegółów → ostrzeżenia warunkowe →
 * „POTWIERDŹ I ZACZNIJ DZIEŃ".
 *
 * Tu kończy się szkic, a zaczyna rejestr: potwierdzenie emituje `session_claim`
 * i `preflight_confirm`. Do tej chwili **nic nie zostało zapisane** — pilot mógł wrócić
 * i zmienić każdą wartość.
 *
 * Ekran jest **wyłącznie do odczytu** (§3.1 krok 3): pokazuje to, co za chwilę zostanie
 * utrwalone. Zmiana wymaga cofnięcia się do właściwego kroku — podsumowanie nie staje się
 * przez to drugim, konkurencyjnym formularzem. Powrót prowadzi z nagłówka („‹ Wróć");
 * bliźniaczy przycisk na dole był tylko jego kopią w miejscu decyzji o zapisie.
 */

import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Screen,
  ScreenHeader,
  SummaryGrid,
  SummaryHero,
  SyncChip,
  type SummaryEntry,
} from '../components';
import { useTheme } from '../theme';
import { useGps } from '../bootstrap/servicesContext';
import { useCurrentPilot, useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
import { litres, motoHours, shortName, timeLocal, timeUtc } from '../format';
// Import wprost z infrastruktury (jak composition root w `appBootstrap`) — moduł
// dotyka `react-native`, więc nie ma go w barrelu.
import { requestNotificationPermission } from '../../infrastructure/permissions/notificationPermission';
import { claimDecision } from './logic/claimMode';
import { operationTag, routeLabel } from './logic/operations';

export function PreflightConfirmScreen({
  navigation,
}: {
  navigation: { navigate: (s: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const claim = useSessionStore((s) => s.claim);
  const confirmPreflight = useSessionStore((s) => s.confirmPreflight);
  const lastError = useSessionStore((s) => s.lastError);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const queries = useSessionStore((s) => s.queries);
  const sync = useSessionStore((s) => s.sync);

  const pilotId = useCurrentPilot((s) => s.id);
  const pilotProfile = useCurrentPilot((s) => s.profile);
  const gps = useGps();

  const draft = usePreflightDraft();
  const [busy, setBusy] = useState(false);
  const [dualName, setDualName] = useState<string | null>(null);
  const aircraft = draft.aircraft;
  const mhFormat = draft.mhFormat();

  // Drugiego pilota pokazujemy nazwiskiem, nie kodem — podsumowanie ma być czytane,
  // a nie odszyfrowywane.
  React.useEffect(() => {
    if (!queries || draft.dualId == null) {
      setDualName(null);
      return;
    }
    void queries
      .pilots()
      .then((list) => setDualName(list.find((p) => p.id === draft.dualId)?.name ?? draft.dualId));
  }, [queries, draft.dualId]);

  const confirm = useCallback(async () => {
    if (aircraft == null) return;

    // Rozgrzewka uprawnień na dzień lotny (lokalizacja + powiadomienia) — TUTAJ,
    // na ziemi, a nie przy pierwszym START ENGINE w środku checklisty silnika.
    // Sekwencyjnie (dwa systemowe dialogi naraz się gryzą), bez `await` w torze
    // potwierdzenia i bez patrzenia na wynik: odmowa NICZEGO nie blokuje (§4.1) —
    // kokpit sam pokaże tryb ręczny, a pasek usługi najwyżej schowa system.
    void (async () => {
      try {
        await gps?.requestPermission();
        await requestNotificationPermission();
      } catch {
        // Miękka prośba — cisza jest tu decyzją, nie przeoczeniem.
      }
    })();

    setBusy(true);
    try {
      // 1. Claim — od tej chwili to urządzenie jest jedynym piszącym dla tego samolotu.
      //
      //    Przy przejęciu pytamy serwer o ŻYWY stan (§4.4): odpowiedź awansuje claim
      //    do `takeover_online` (z aktualnym poprzednikiem — cache mógł wskazywać
      //    kogoś, kto już oddał samolot), brak odpowiedzi degraduje do
      //    `takeover_offline`. Bez zasięgu `fetchAircraftState` szybko wraca `null`
      //    i pilot leci dalej — sieć jest okazją, nie warunkiem (§6).
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

      // 2. Preflight — odczyty liczników stają się początkiem łańcucha MH (§4.5).
      await confirmPreflight({
        operation: draft.operation,
        departureIcao: draft.departureIcao || null,
        arrivalIcao: draft.arrivalIcao || null,
        dutyStart: draft.dutyStart,
        reading: { fuelL: draft.fuelL, mh: draft.mh },
        client: draft.client,
        mhFormat,
      });

      draft.reset();
      navigation.navigate('Cockpit');
    } catch {
      // Twarde odrzucenie inwariantu trafia do `lastError` i jest pokazane niżej.
    } finally {
      setBusy(false);
    }
  }, [aircraft, claim, confirmPreflight, draft, gps, mhFormat, navigation, pilotId, sync]);

  if (aircraft == null) {
    return (
      <Screen>
        <AppText variant="body" tone="muted">
          Najpierw wybierz samolot.
        </AppText>
      </Screen>
    );
  }

  const route = routeLabel(draft.operation, draft.departureIcao, draft.arrivalIcao);

  const entries: SummaryEntry[] = [
    // Same role, bez dopowiedzeń: „PIC · zalogowany" i „Dual · drugi pilot" tłumaczyły
    // skróty, które pilot zna z licencji — a wartością obok jest jego własne nazwisko.
    {
      key: 'PIC',
      value: shortName(pilotProfile?.name ?? pilotId),
      text: true,
    },
    {
      key: 'Dual',
      value: dualName != null ? shortName(dualName) : '—',
      text: true,
    },
    {
      key: 'Meldunek',
      value: timeUtc(draft.dutyStart),
      note: 'UTC',
      // Czas lokalny w osobnej linii: dopisany za „UTC" łamał się w połowie i pod
      // wartością zostawało samotne „LT" (kolumna ma pół szerokości ekranu).
      sub: `${timeLocal(draft.dutyStart)} LT`,
    },
    { key: 'Paliwo start', value: litres(draft.fuelL), tone: 'amber' },
    { key: 'Motogodziny', value: motoHours(draft.mh, mhFormat), note: 'MH' },
    { key: 'Klient', value: draft.client ?? '—', text: true },
  ];

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="POTWIERDŹ DANE"
          // Dłuższy tytuł — mockup 03 zmniejsza go do 20 px, żeby nie wchodził na sloty boczne.
          size="md"
          step="4 / 4"
          onBack={navigation.goBack}
          right={
            <SyncChip
              status={synced ? 'synced' : 'offline'}
              outboxCount={outboxCount}
              lastSyncAt={lastSyncAt}
            />
          }
        />
      }
      /* Jedna akcja, nie para. Mockup ma tu `.btn-group` z „WRÓĆ I POPRAW" na koncie
         drugiego przycisku, ale powrót jest już w nagłówku („‹ Wróć") i to on prowadzi
         dokładnie tam samo — krok wstecz w stepperze. Pełnowymiarowy przycisk powtarzał
         go tuż nad potwierdzeniem, czyli w miejscu zarezerwowanym dla decyzji.
         Akcja stoi przy dolnej krawędzi, choćby siatka danych kończyła się w połowie
         ekranu (patrz `Screen.footer`). */
      footer={
        <ActionButton
          label="POTWIERDŹ I ZACZNIJ DZIEŃ"
          tone="green"
          variant="solid"
          busy={busy}
          icon="check"
          onPress={confirm}
        />
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        <SummaryHero
          code={aircraft.reg}
          codeDetail={[aircraft.type, aircraft.year].filter(Boolean).join(' · ')}
          // Bez trasy karta i tak musi coś powiedzieć — wtedy niesie rodzaj operacji.
          title={route.length > 0 ? route : operationTag(draft.operation)}
          // Tag operacji TYLKO wtedy, gdy tytułem jest trasa. Przy pustej trasie karta
          // pisała „SKOKI" dwa razy pod rząd — wielkim napisem i tagiem pod nim.
          // Daty tu nie ma z decyzji pilota: dzień lotny zaczyna się „teraz", więc badge
          // z dzisiejszą datą zajmował miejsce, nie odpowiadając na żadne pytanie.
          tags={route.length > 0 ? [operationTag(draft.operation)] : []}
        />

        <View
          style={{
            padding: theme.spacing.lg - 2,
            borderRadius: theme.radius.lg,
            borderWidth: theme.borderWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <SummaryGrid entries={entries} />
        </View>

        {/* Banera „Sprawdź poprawność danych" tu NIE MA (decyzja pilota, 2026-07-30):
            cały ekran jest sprawdzeniem, więc wezwanie do sprawdzenia powtarzało jego
            tytuł. Zostają ostrzeżenia WARUNKOWE — te mówią coś, czego z siatki nie
            widać. */}
        {aircraft.claimPicId != null && (
          <Banner
            kind="warning"
            icon="warning"
            title={`Przejmujesz samolot od ${aircraft.claimPicId}`}
            text="Jeśli poprzedni pilot nadal prowadzi ten samolot, serwer oznaczy nakładkę do wyjaśnienia."
          />
        )}

        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}

      </View>
    </Screen>
  );
}
