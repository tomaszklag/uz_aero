/**
 * UZ Aero — 03 PREFLIGHT · krok 3/3: podsumowanie i potwierdzenie.
 *
 * Tu kończy się szkic, a zaczyna rejestr: potwierdzenie emituje `session_claim`
 * i `preflight_confirm`. Do tej chwili nic nie zostało zapisane — pilot mógł wrócić
 * i zmienić każdą wartość.
 *
 * Ekran jest **wyłącznie do odczytu** (§3.1 krok 3): pokazuje to, co za chwilę
 * zostanie utrwalone. Zmiana wymaga cofnięcia się do właściwego kroku — dzięki temu
 * podsumowanie nie staje się drugim, konkurencyjnym formularzem.
 */

import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { ActionButton, AppText, Banner, Card, Screen, SyncChip } from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
import { litres, motoHours, timeUtc } from '../format';

/** Wiersz podsumowania: klucz po lewej, wartość po prawej. */
function Row({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: theme.spacing.sm,
      }}
    >
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <AppText variant="mono">{value}</AppText>
    </View>
  );
}

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

  const draft = usePreflightDraft();
  const [busy, setBusy] = useState(false);
  const aircraft = draft.aircraft;
  const mhFormat = draft.mhFormat();

  const confirm = useCallback(async () => {
    if (aircraft == null) return;
    setBusy(true);
    try {
      // 1. Claim — od tej chwili to urządzenie jest jedynym piszącym dla tego samolotu.
      //
      //    §4.4 rozróżnia przejęcie `takeover_online` (znamy aktualny stan z serwera)
      //    od `takeover_offline` (opieramy się na cache, który mógł się zdezaktualizować).
      //    Nie mamy jeszcze portu łączności, więc świadomie wybieramy wariant SŁABSZY:
      //    zadeklarowanie „zweryfikowane online", gdy nie mieliśmy jak sprawdzić, byłoby
      //    kłamstwem wobec serwera przy scalaniu. TODO: podmienić po dodaniu NetworkPort.
      await claim({
        sessionUuid: `sess-${Date.now()}`,
        aircraftId: aircraft.id,
        picId: 'TMK',
        dualId: draft.dualId,
        mode: aircraft.claimPicId != null ? 'takeover_offline' : 'free',
        previousPicId: aircraft.claimPicId ?? undefined,
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
  }, [aircraft, claim, confirmPreflight, draft, mhFormat, navigation]);

  if (aircraft == null) {
    return (
      <Screen>
        <AppText variant="body" tone="muted">
          Najpierw wybierz samolot.
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.md }}>
        <View style={styles.headerRow}>
          <AppText variant="display">POTWIERDŹ</AppText>
          <View style={styles.headerRight}>
            <AppText variant="label" tone="muted">
              KROK 3 / 3
            </AppText>
            <SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />
          </View>
        </View>

        <Card title="DZIEŃ LOTNY">
          <View style={{ gap: theme.spacing.sm }}>
            <Row label="Samolot" value={`${aircraft.reg} · ${aircraft.type}`} />
            <Row label="PIC" value="TMK" />
            <Row label="Drugi pilot" value={draft.dualId ?? '—'} />
            <Row label="Operacja" value={draft.operation.toUpperCase()} />
            <Row
              label="Trasa"
              value={[draft.departureIcao, draft.arrivalIcao].filter(Boolean).join(' → ') || '—'}
            />
            <Row label="Meldowanie" value={`${timeUtc(draft.dutyStart)} UTC`} />
          </View>
        </Card>

        <Card title="ODCZYTY POCZĄTKOWE">
          <View style={{ gap: theme.spacing.sm }}>
            <Row label="Paliwo" value={litres(draft.fuelL)} />
            <Row label="Motogodziny" value={`${motoHours(draft.mh, mhFormat)} MH`} />
            <Row
              label="Źródło"
              value={draft.readingSource === 'handover' ? 'przekazanie' : 'odczyt z licznika'}
            />
          </View>
        </Card>

        <Banner
          kind="edu"
          title="Co się teraz stanie"
          text={
            'Zapiszemy przejęcie samolotu i odczyty początkowe. Od tej chwili dane dnia wysyła ' +
            'wyłącznie ten telefon. Zapis działa bez zasięgu — wyśle się, gdy wróci sieć.'
          }
          collapsedLabel="Co się stanie?"
        />

        {aircraft.claimPicId != null && (
          <Banner
            kind="warning"
            title={`Przejmujesz samolot od ${aircraft.claimPicId}`}
            text="Jeśli poprzedni pilot nadal prowadzi ten samolot, serwer oznaczy nakładkę do wyjaśnienia."
          />
        )}

        {lastError != null && (
          <Banner kind="warning" tone="red" title="Nie zapisano" text={lastError} />
        )}

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <ActionButton
            label="WSTECZ"
            tone="neutral"
            variant="secondary"
            onPress={navigation.goBack}
            style={{ flex: 1 }}
          />
          <ActionButton
            label="ZACZNIJ DZIEŃ"
            tone="green"
            busy={busy}
            holdMs={2000}
            hint="przytrzymaj 2 s"
            onPress={confirm}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = {
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  headerRight: { alignItems: 'flex-end' as const, gap: 4 },
};
