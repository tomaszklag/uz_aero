/**
 * UZ Aero — 02 PREFLIGHT · krok 1/3.
 *
 * Odwzorowanie mockupu `design/02-preflight.html` — kolejność i treść sekcji są stamtąd,
 * nie z improwizacji: pasek tożsamości → samolot → drugi pilot → rodzaj operacji → trasa
 * → czas meldowania → oznaczenie klienta → DALEJ.
 *
 * Reguły, których ten ekran pilnuje:
 *  • wybór z **listy kart**, nigdy z natywnego selecta; operacje jako **siatka ikon**
 *    (`CLAUDE.md`);
 *  • tożsamość pilota jest znana z sesji — nie pytamy o kod, **pokazujemy** go paskiem;
 *  • samolot wyłączony ze służby jest widoczny, ale niedostępny — z podanym powodem;
 *  • samolot zajęty przez innego pilota wymaga świadomego **przejęcia** (arkusz z §4.4);
 *    claim jest optymistyczny, więc działa też bez sieci;
 *  • samolot z wymogiem załogi 2-osobowej blokuje przejście dalej bez Duala;
 *  • czas meldowania w UTC, LT tylko jako wartość drugorzędna.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  CardPicker,
  Field,
  IdentityStrip,
  OptionGrid,
  Screen,
  ScreenHeader,
  Sheet,
  Stepper,
  SyncChip,
  Tag,
  TextField,
  ValueBox,
  type GridOption,
  type PickerOption,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
import { dateUtcLong, timeLocal, timeUtc } from '../format';
import type { OperationType, ReferenceAircraft, ReferencePilot } from '../../domain';

/** Siatka operacji — etykiety i ikony jak w `.op-grid` mockupu. */
const OPERATIONS: GridOption<OperationType>[] = [
  { value: 'skoki', label: 'Skoki', icon: 'op-skoki' },
  { value: 'ferry', label: 'Ferry', icon: 'op-ferry' },
  { value: 'egzamin', label: 'Egzamin', icon: 'op-egzamin' },
  { value: 'techniczny', label: 'Lot tech.', icon: 'op-techniczny' },
  { value: 'inne', label: 'Inne', icon: 'op-inne' },
];

export function PreflightAircraftScreen({
  navigation,
}: {
  // Podgląd read-only (04b) potrzebuje parametru — stąd druga, opcjonalna pozycja.
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void };
}) {
  const { theme } = useTheme();
  const queries = useSessionStore((s) => s.queries);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);

  const pilotId = useCurrentPilot((s) => s.id);
  const pilotProfile = useCurrentPilot((s) => s.profile);
  const setPilotProfile = useCurrentPilot((s) => s.setProfile);

  const draft = usePreflightDraft();
  const [fleet, setFleet] = useState<ReferenceAircraft[]>([]);
  const [pilots, setPilots] = useState<ReferencePilot[]>([]);
  /** Samolot czekający na potwierdzenie przejęcia (arkusz). */
  const [takeover, setTakeover] = useState<ReferenceAircraft | null>(null);
  /** Edytor czasu meldowania — domyślnie zwinięty, jak w mockupie. */
  const [editingDuty, setEditingDuty] = useState(false);

  useEffect(() => {
    if (!queries) return;
    void queries.aircraft().then(setFleet);
    void queries.pilots().then((list) => {
      setPilots(list);
      setPilotProfile(list.find((p) => p.id === pilotId) ?? null);
    });
  }, [pilotId, queries, setPilotProfile]);

  const selected = draft.aircraft;
  const needsDual = selected?.dualRequired === true && draft.dualId == null;

  const aircraftOptions: PickerOption<string>[] = useMemo(
    () =>
      fleet.map((a) => {
        const grounded = a.serviceStatus === 'disabled';
        const claimed = a.claimPicId != null && a.claimPicId !== pilotId;

        return {
          value: a.id,
          label: a.reg,
          detail: [a.type, a.year].filter(Boolean).join(' · '),
          tags: grounded
            ? [{ label: 'Wyłączony', tone: 'red' as const }]
            : claimed
              ? [
                  {
                    // Mockup: „PIC: KRZ · od 07:10" — sama informacja „kto" bez „od kiedy"
                    // nie pozwala ocenić, czy tamten dzień jeszcze trwa.
                    label:
                      a.claimSince != null
                        ? `PIC: ${a.claimPicId} · od ${timeUtc(a.claimSince)}`
                        : `PIC: ${a.claimPicId}`,
                    tone: 'amber' as const,
                  },
                ]
              : undefined,
          // Podgląd read-only (04b) TYLKO przy samolocie prowadzonym przez kogoś innego —
          // tam, gdzie pilot chce zobaczyć stan, zanim zdecyduje się przejąć.
          hasSecondary: claimed,
          disabledReason: grounded ? 'Wyłączony ze służby' : undefined,
          // Powód niesie już czerwony tag — druga linia byłaby powtórzeniem.
          disabledTagged: grounded,
        };
      }),
    [fleet, pilotId],
  );

  // Pilot zalogowany nie może być jednocześnie Dualem — filtrujemy go z listy.
  const dualOptions: PickerOption<string>[] = useMemo(
    () =>
      pilots
        .filter((p) => p.active && p.id !== pilotId)
        .map((p) => ({ value: p.id, label: p.name, detail: p.code, avatarName: p.name })),
    [pilots, pilotId],
  );

  const handleAircraft = useCallback(
    (id: string) => {
      const found = fleet.find((a) => a.id === id);
      if (!found) return;
      // Samolot prowadzony przez kogoś innego = decyzja o odebraniu mu prawa zapisu.
      // Nie da się jej podjąć przypadkowym tapnięciem (§4.4).
      if (found.claimPicId != null && found.claimPicId !== pilotId) {
        setTakeover(found);
        return;
      }
      draft.setAircraft(found);
    },
    [draft, fleet, pilotId],
  );

  const confirmTakeover = useCallback(() => {
    if (takeover) draft.setAircraft(takeover);
    setTakeover(null);
  }, [draft, takeover]);

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="PREFLIGHT"
          subtitle="Uzupełnij dane przed rozpoczęciem dnia lotnego"
          step="1 / 3"
          right={<SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />}
        />
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        {/* ── kto zapisuje ten dzień ──────────────────────────────────── */}
        <IdentityStrip
          name={pilotProfile?.name ?? pilotId}
          subtitle={pilotProfile?.code ?? pilotId}
          badge="PIC"
        />

        {/* ── samolot ─────────────────────────────────────────────────── */}
        <Card title="Samolot" header="inline">
          {fleet.length === 0 ? (
            <AppText variant="body" tone="muted">
              Brak samolotów w pamięci urządzenia.
            </AppText>
          ) : (
            <CardPicker
              options={aircraftOptions}
              value={selected?.id ?? null}
              onChange={handleAircraft}
              // Podglądanie i przejmowanie to dwie różne czynności: przejęcie odbiera
              // poprzednikowi prawo zapisu (§4.4), więc nie może być skutkiem ubocznym
              // sprawdzenia, co się z samolotem dzieje.
              onSecondary={(id) => navigation.navigate('CockpitReadonly', { aircraftId: id })}
              secondaryLabel="Podgląd bez przejmowania"
            />
          )}
        </Card>

        {/* ── drugi pilot ─────────────────────────────────────────────── */}
        <Card
          title="Drugi pilot · Dual"
          header="inline"
          headerRight={
            <Tag
              label={selected?.dualRequired ? 'wymagany · załoga 2-os.' : 'opcjonalne'}
              tone={selected?.dualRequired ? 'amber' : 'neutral'}
            />
          }
        >
          <CardPicker
            options={dualOptions}
            value={draft.dualId}
            onChange={(id) => draft.set('dualId', draft.dualId === id ? null : id)}
          />
          {needsDual && (
            <Banner
              kind="warning"
              title="Wymagana załoga dwuosobowa"
              text={`${selected?.type ?? 'Ten samolot'} wymaga drugiego pilota — wybierz go, aby przejść dalej.`}
            />
          )}
        </Card>

        {/* ── rodzaj operacji ─────────────────────────────────────────── */}
        <Card title="Rodzaj operacji" header="inline">
          <OptionGrid
            options={OPERATIONS}
            value={draft.operation}
            onChange={(v) => draft.set('operation', v)}
          />
        </Card>

        {/* ── trasa ───────────────────────────────────────────────────── */}
        <Card title="Trasa" header="inline">
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
            <TextField
              label="Start ICAO"
              mono
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="EPKK"
              value={draft.departureIcao}
              onChangeText={(v) => draft.set('departureIcao', v.toUpperCase())}
              style={{ flex: 1 }}
            />
            <AppText variant="display" tone="muted" style={{ paddingBottom: 10 }}>
              →
            </AppText>
            <TextField
              label="Lądowanie ICAO"
              mono
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="EPWA"
              value={draft.arrivalIcao}
              onChangeText={(v) => draft.set('arrivalIcao', v.toUpperCase())}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        {/* ── czas meldowania ─────────────────────────────────────────────
            Mockup pokazuje pole ODCZYTU: „08:00 UTC" dużym mono, obok „10:00 LT"
            i ołówek, pod spodem badge z datą. Sekcja nie ma etykiety — pole samo się
            przedstawia. Stepper (wzorzec projektu dla wartości liczbowych) odsłaniamy
            dopiero po tapnięciu, żeby stan spoczynkowy zgadzał się z designem. */}
        <Card header="inline">
          <Field label="Czas meldowania (duty start)">
            <ValueBox
              value={timeUtc(draft.dutyStart)}
              unit="UTC"
              meta={`${timeLocal(draft.dutyStart)} LT`}
              actionIcon="edit"
              accessibilityLabel={`Czas meldowania ${timeUtc(draft.dutyStart)} UTC — zmień`}
              onPress={() => setEditingDuty((v) => !v)}
            />
            <View style={{ flexDirection: 'row' }}>
              <Tag label={dateUtcLong(draft.dutyStart)} size="md" />
            </View>
          </Field>

          {editingDuty && (
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
          )}
        </Card>

        {/* ── opcjonalne ──────────────────────────────────────────────── */}
        <Card header="inline">
          <TextField
            label="Oznaczenie klienta"
            tag={{ label: 'opcjonalne' }}
            hint="Wiąże zrzuty dnia z klientem — trafia do statystyk i arkusza rozliczeniowego"
            placeholder="np. SKY CAMP · zlec. 2026/114"
            value={draft.client ?? ''}
            onChangeText={(v) => draft.set('client', v.length > 0 ? v : null)}
          />
        </Card>

        <ActionButton
          label="DALEJ"
          tone="green"
          variant="solid"
          trailingIcon="next"
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

      {/* ── przejęcie samolotu (`#takeover-modal` z mockupu) ───────────── */}
      <Sheet
        visible={takeover != null}
        title={`PRZEJMIJ ${takeover?.reg ?? ''}?`}
        rows={[
          { label: 'Aktywny PIC', value: takeover?.claimPicId ?? '—' },
          {
            label: 'Blokada od',
            value: takeover?.claimSince != null ? `${timeUtc(takeover.claimSince)} UTC` : 'brak danych',
          },
          {
            // Wiek danych JEST częścią tej decyzji: „PIC: KRZ" sprzed dwóch godzin znaczy
            // coś zupełnie innego niż sprzed dwóch minut. Bez tego wiersza pilot ocenia
            // sytuację, nie wiedząc, jak stara jest informacja, na której się opiera (§4.8).
            label: 'Ostatnia synchronizacja',
            value: takeover != null ? `${timeUtc(takeover.fetchedAt)} UTC` : '—',
          },
        ]}
        warning={
          'Poprzedni PIC może mieć niewysłane dane. Po przejęciu tylko Ty będziesz wysyłać dane ' +
          'dla tego samolotu — zweryfikuj odczyty paliwa i MH z liczników w kolejnym kroku. ' +
          'Spóźnione dane poprzednika serwer scali automatycznie.'
        }
        confirmLabel="PRZEJMIJ"
        onConfirm={confirmTakeover}
        onCancel={() => setTakeover(null)}
      />
    </Screen>
  );
}
