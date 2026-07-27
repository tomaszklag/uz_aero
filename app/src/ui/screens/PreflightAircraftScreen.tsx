/**
 * UZ Aero — 02 PREFLIGHT · krok 1/3: samolot, operacja, trasa, czas służby.
 *
 * Reguły designu, których ten ekran pilnuje:
 *  • wybór z **listy kart**, nigdy z natywnego selecta (`CardPicker`);
 *  • samolot wyłączony ze służby jest widoczny, ale niedostępny — **z podanym powodem**;
 *  • samolot zajęty przez innego pilota da się przejąć, ale z ostrzeżeniem (claim jest
 *    optymistyczny — §4.4 — więc przejęcie działa też bez sieci);
 *  • samolot z wymogiem załogi 2-osobowej blokuje przejście dalej bez Duala;
 *  • tożsamość pilota jest znana z sesji — NIE pytamy o kod pilota (`CLAUDE.md`);
 *  • czas meldowania w UTC (LT jako wartość drugorzędna).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  CardPicker,
  Screen,
  Stepper,
  SyncChip,
  type PickerOption,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
import { timeUtc } from '../format';
import type { OperationType, ReferenceAircraft, ReferencePilot } from '../../domain';

const OPERATIONS: { value: OperationType; label: string }[] = [
  { value: 'skoki', label: 'Skoki' },
  { value: 'ferry', label: 'Ferry' },
  { value: 'egzamin', label: 'Egzamin' },
  { value: 'techniczny', label: 'Lot techniczny' },
  { value: 'inne', label: 'Inne' },
];

export function PreflightAircraftScreen({ navigation }: { navigation: { navigate: (s: string) => void } }) {
  const { theme } = useTheme();
  const queries = useSessionStore((s) => s.queries);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);

  const draft = usePreflightDraft();
  const [fleet, setFleet] = useState<ReferenceAircraft[]>([]);
  const [pilots, setPilots] = useState<ReferencePilot[]>([]);

  useEffect(() => {
    if (!queries) return;
    void queries.aircraft().then(setFleet);
    void queries.pilots().then(setPilots);
  }, [queries]);

  const aircraftOptions: PickerOption<string>[] = fleet.map((a) => ({
    value: a.id,
    label: a.reg,
    detail: [a.type, a.year].filter(Boolean).join(' · '),
    badge:
      a.serviceStatus === 'disabled'
        ? 'WYŁĄCZONY'
        : a.claimPicId != null
          ? `PIC: ${a.claimPicId}`
          : undefined,
    badgeTone: a.serviceStatus === 'disabled' ? 'red' : a.claimPicId != null ? 'amber' : 'neutral',
    disabledReason:
      a.serviceStatus === 'disabled' ? 'Wyłączony ze służby — wybierz inny samolot' : undefined,
  }));

  // Pilot zalogowany nie może być jednocześnie Dualem — filtrujemy go z listy.
  const picId = 'TMK';
  const dualOptions: PickerOption<string>[] = pilots
    .filter((p) => p.active && p.id !== picId)
    .map((p) => ({ value: p.id, label: p.name, badge: p.code }));

  const selected = draft.aircraft;
  const needsDual = selected?.dualRequired === true && draft.dualId == null;

  const handleAircraft = useCallback(
    (id: string) => {
      const found = fleet.find((a) => a.id === id);
      if (found) draft.setAircraft(found);
    },
    [draft, fleet],
  );

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.md }}>
        <View style={styles.headerRow}>
          <AppText variant="display">PREFLIGHT</AppText>
          <View style={styles.headerRight}>
            <AppText variant="label" tone="muted">
              KROK 1 / 3
            </AppText>
            <SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />
          </View>
        </View>

        {/* ── samolot ─────────────────────────────────────────────────── */}
        <Card title="SAMOLOT" flush contentStyle={{ padding: theme.spacing.md }}>
          {fleet.length === 0 ? (
            <AppText variant="body" tone="muted">
              Brak samolotów w pamięci urządzenia.
            </AppText>
          ) : (
            <CardPicker options={aircraftOptions} value={selected?.id ?? null} onChange={handleAircraft} />
          )}
        </Card>

        {/* Przejęcie zajętego samolotu — claim optymistyczny, działa też offline. */}
        {selected?.claimPicId != null && (
          <Banner
            kind="warning"
            title={`Samolot prowadzi ${selected.claimPicId}`}
            text={
              'Możesz go przejąć — od tej chwili dane wysyła Twój telefon. Sprawdź odczyty paliwa ' +
              'i motogodzin z liczników w samolocie; jeśli poprzednik nadal lata, oznaczymy to do wyjaśnienia.'
            }
          />
        )}

        {/* ── drugi pilot ─────────────────────────────────────────────── */}
        <Card
          title={selected?.dualRequired ? 'DRUGI PILOT · WYMAGANY' : 'DRUGI PILOT · OPCJONALNIE'}
          flush
          contentStyle={{ padding: theme.spacing.md }}
        >
          <CardPicker
            options={dualOptions}
            value={draft.dualId}
            onChange={(id) => draft.set('dualId', draft.dualId === id ? null : id)}
          />
        </Card>

        {needsDual && (
          <Banner
            kind="warning"
            title="Wymagana załoga dwuosobowa"
            text={`${selected?.type ?? 'Ten samolot'} wymaga drugiego pilota — wybierz go, aby przejść dalej.`}
          />
        )}

        {/* ── operacja ────────────────────────────────────────────────── */}
        <Card title="RODZAJ OPERACJI" flush contentStyle={{ padding: theme.spacing.md }}>
          <CardPicker
            options={OPERATIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.operation}
            onChange={(v) => draft.set('operation', v as OperationType)}
          />
        </Card>

        {/* ── czas meldowania ─────────────────────────────────────────── */}
        <Card title="CZAS MELDOWANIA · UTC">
          <Stepper
            value={draft.dutyStart}
            onChange={(v) => draft.set('dutyStart', v)}
            step={5 * 60_000}
            bigStep={60 * 60_000}
            tone="blue"
            format={(v) => timeUtc(v)}
            unit="UTC"
            hint="Krok 5 minut · duży krok 1 godzina"
          />
        </Card>

        <ActionButton
          label="DALEJ"
          tone="green"
          disabledReason={
            selected == null
              ? 'Wybierz samolot, aby przejść dalej'
              : needsDual
                ? 'Wybierz drugiego pilota — ten samolot wymaga załogi 2-osobowej'
                : null
          }
          onPress={() => navigation.navigate('PreflightReadings')}
        />
      </View>
    </Screen>
  );
}

const styles = {
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  headerRight: { alignItems: 'flex-end' as const, gap: 4 },
};
