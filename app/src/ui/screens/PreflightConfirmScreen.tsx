/**
 * UZ Aero — 03 PREFLIGHT · krok 3/3: podsumowanie i potwierdzenie.
 *
 * Odwzorowanie mockupu `design/03-preflight-confirm.html`: karta podsumowania (samolot,
 * trasa, tagi) → dwukolumnowa siatka szczegółów → ostrzeżenie → para przycisków
 * „WRÓĆ I POPRAW" / „POTWIERDŹ I ZACZNIJ DZIEŃ".
 *
 * Tu kończy się szkic, a zaczyna rejestr: potwierdzenie emituje `session_claim`
 * i `preflight_confirm`. Do tej chwili **nic nie zostało zapisane** — pilot mógł wrócić
 * i zmienić każdą wartość.
 *
 * Ekran jest **wyłącznie do odczytu** (§3.1 krok 3): pokazuje to, co za chwilę zostanie
 * utrwalone. Zmiana wymaga cofnięcia się do właściwego kroku — dlatego „WRÓĆ I POPRAW"
 * jest pełnoprawnym przyciskiem obok potwierdzenia, a nie odnośnikiem na marginesie.
 * Dzięki temu podsumowanie nie staje się drugim, konkurencyjnym formularzem.
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
import { useCurrentPilot, useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
import { dateUtcLong, litres, motoHours, shortName, timeLocal, timeUtc } from '../format';
import { claimDecision } from './claimMode';

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
  const queries = useSessionStore((s) => s.queries);
  const sync = useSessionStore((s) => s.sync);

  const pilotId = useCurrentPilot((s) => s.id);
  const pilotProfile = useCurrentPilot((s) => s.profile);

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
  }, [aircraft, claim, confirmPreflight, draft, mhFormat, navigation, pilotId, sync]);

  if (aircraft == null) {
    return (
      <Screen>
        <AppText variant="body" tone="muted">
          Najpierw wybierz samolot.
        </AppText>
      </Screen>
    );
  }

  const route = [draft.departureIcao, draft.arrivalIcao].filter(Boolean).join(' → ');

  const entries: SummaryEntry[] = [
    {
      key: 'PIC · zalogowany',
      value: shortName(pilotProfile?.name ?? pilotId),
      text: true,
    },
    {
      key: 'Dual · drugi pilot',
      value: dualName != null ? shortName(dualName) : '—',
      text: true,
    },
    {
      key: 'Meldunek',
      value: timeUtc(draft.dutyStart),
      note: `UTC · ${timeLocal(draft.dutyStart)} LT`,
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
          step="3 / 3"
          onBack={navigation.goBack}
          right={<SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />}
        />
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        <SummaryHero
          code={aircraft.reg}
          codeDetail={[aircraft.type, aircraft.year].filter(Boolean).join(' · ')}
          // Bez trasy karta i tak musi coś powiedzieć — wtedy niesie rodzaj operacji.
          title={route.length > 0 ? route : draft.operation.toUpperCase()}
          tags={[draft.operation.toUpperCase(), dateUtcLong(draft.dutyStart)]}
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

        <Banner
          kind="warning"
          icon="warning"
          title="Sprawdź poprawność danych"
          text="Po potwierdzeniu dane dnia można zmienić tylko korektą w logu — nie w formularzu."
        />

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

        {/* Mockup: `.btn-group` — dwa przyciski pełnej szerokości, jeden pod drugim.
            Hierarchię niesie wypełnienie (pełna zieleń vs kontur), a nie rozmiar napisu:
            powrót do poprawek jest tu działaniem oczekiwanym, nie wycofaniem się. */}
        <View style={{ gap: theme.spacing.sm }}>
          <ActionButton
            label="WRÓĆ I POPRAW"
            tone="neutral"
            variant="secondary"
            icon="back"
            onPress={navigation.goBack}
          />
          <ActionButton
            label="POTWIERDŹ I ZACZNIJ DZIEŃ"
            tone="green"
            variant="solid"
            busy={busy}
            icon="check"
            onPress={confirm}
          />
        </View>
      </View>
    </Screen>
  );
}
