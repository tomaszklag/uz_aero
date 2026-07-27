/**
 * UZ Aero — 02A PREFLIGHT · krok 2/3: paliwo i motogodziny.
 *
 * Najważniejszy ekran całego preflightu, bo to tutaj powstaje **początek łańcucha MH**
 * (§4.5) — wartość, po której serwer porządkuje sesje samolotu.
 *
 * Zasada nadrzędna (`CLAUDE.md`): **liczniki fizyczne > dane z serwera**. Przekazanie
 * od poprzednika jest podpowiedzią, nie prawdą — pilot patrzy na paliwomierz i licznik
 * w samolocie. Dlatego:
 *  • gdy jest przekazanie — pokazujemy je z kontekstem (kto, kiedy) i wiekiem danych;
 *  • gdy go brak — mówimy wprost „wpisz z licznika", zamiast podstawiać zero jako fakt;
 *  • każda zmiana względem przekazania jest widoczna jako różnica, nie cichy nadpis.
 *
 * Format MH (`decimal` / `hhmm`) pochodzi z konfiguracji samolotu (§5.4) — w danych
 * trzymamy zawsze godziny dziesiętne, formatowanie jest sprawą UI.
 */

import React from 'react';
import { View } from 'react-native';

import { ActionButton, AppText, Banner, Card, Screen, Stepper, SyncChip } from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
import { litres, motoHours, timeUtc } from '../format';

export function PreflightReadingsScreen({
  navigation,
}: {
  navigation: { navigate: (s: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);

  const draft = usePreflightDraft();
  const aircraft = draft.aircraft;
  const handover = aircraft?.handover ?? null;
  const mhFormat = draft.mhFormat();

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
  const fuelDiff = handover != null ? draft.fuelL - handover.reading.fuelL : 0;
  const mhDiff = handover != null ? draft.mh - handover.reading.mh : 0;

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.md }}>
        <View style={styles.headerRow}>
          <AppText variant="display">ODCZYTY</AppText>
          <View style={styles.headerRight}>
            <AppText variant="label" tone="muted">
              KROK 2 / 3
            </AppText>
            <SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />
          </View>
        </View>

        {/* Stan świeżości danych przekazania — trzy przypadki (§4.8). */}
        {handover != null ? (
          <Banner
            kind="status"
            title="Przekazanie od poprzednika"
            text={`${litres(handover.reading.fuelL)} · ${motoHours(handover.reading.mh, mhFormat)} MH · ${
              handover.byPilotId
            } · ${timeUtc(handover.at)} UTC. To podpowiedź — sprawdź liczniki w samolocie.`}
          />
        ) : (
          <Banner
            kind="warning"
            title="Brak danych przekazania"
            text={
              'Nie mamy odczytów od poprzedniego pilota. Wpisz stan z paliwomierza i licznika ' +
              'motogodzin — Twój odczyt rozpocznie nowe ogniwo łańcucha.'
            }
          />
        )}

        {/* ── paliwo ──────────────────────────────────────────────────── */}
        <Card title={`PALIWO NA POKŁADZIE · POJEMNOŚĆ ${capacity} L`}>
          <Stepper
            value={draft.fuelL}
            onChange={(v) => {
              draft.set('fuelL', v);
              draft.set('readingSource', 'manual');
            }}
            step={1}
            bigStep={10}
            min={0}
            max={capacity}
            tone="amber"
            unit="L"
            hint={
              handover != null && fuelDiff !== 0
                ? `Różnica względem przekazania: ${fuelDiff > 0 ? '+' : ''}${fuelDiff} L`
                : `Zakres 0–${capacity} L (pojemność z konfiguracji ${aircraft.reg})`
            }
          />
        </Card>

        {/* ── motogodziny ─────────────────────────────────────────────── */}
        <Card title={`MOTOGODZINY · FORMAT ${mhFormat === 'hhmm' ? 'HH:MM' : 'DZIESIĘTNY'}`}>
          <Stepper
            value={draft.mh}
            onChange={(v) => {
              draft.set('mh', v);
              draft.set('readingSource', 'manual');
            }}
            // Krok 0,1 h = 6 minut — najmniejsza działka typowego licznika.
            step={0.1}
            bigStep={1}
            min={0}
            tone="green"
            unit="MH"
            format={(v) => motoHours(v, mhFormat)}
            hint={
              handover != null && Math.abs(mhDiff) > 0.001
                ? `Różnica względem przekazania: ${mhDiff > 0 ? '+' : ''}${motoHours(Math.abs(mhDiff), mhFormat)}`
                : 'Krok 0,1 h (6 min) · duży krok 1 h'
            }
          />
        </Card>

        {/* Cofnięty licznik to twardy błąd domeny — ostrzegamy, zanim komenda odrzuci. */}
        {handover != null && mhDiff < 0 && (
          <Banner
            kind="warning"
            tone="red"
            title="Licznik nie może się cofnąć"
            text={`Wpisana wartość jest niższa niż przekazana (${motoHours(
              handover.reading.mh,
              mhFormat,
            )} MH). Sprawdź odczyt — zapis zostanie odrzucony.`}
          />
        )}

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <ActionButton label="WSTECZ" tone="neutral" variant="secondary" onPress={navigation.goBack} style={{ flex: 1 }} />
          <ActionButton
            label="DALEJ"
            tone="green"
            disabledReason={
              handover != null && mhDiff < 0 ? 'Popraw odczyt motogodzin' : null
            }
            onPress={() => navigation.navigate('PreflightConfirm')}
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
