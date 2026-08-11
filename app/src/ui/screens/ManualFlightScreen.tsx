/**
 * UZ Aero — 15 LOT RĘCZNY (mockup `design/15-reczny-lot.html`, story pkt 7).
 *
 * Wpis CAŁEGO lotu z listy dziennej PO FAKCIE — telefon został w kurtce, bateria
 * padła, lot spisany na papierze. Zapis tworzy KOMPLETNĄ sesję (model 2026-08-10:
 * przejęcie → jeden bieg silnika z jednym lotem → zdanie), więc odczyty po locie są
 * WYMAGANE jak na 09b: stają się przekazaniem i ogniwem łańcucha MH.
 *
 * Różnica wobec 08 (lista ręczna w kokpicie): 08 naprawia sesję TRWAJĄCĄ (fallback
 * GPS), ten ekran tworzy sesję ZAKOŃCZONĄ od zera. Jeden lot na wpis — kolejne
 * starty/lądowania tego samego biegu dopisuje się korektą po zapisaniu; formularz
 * na N lotów byłby dłuższy od papieru, który zastępuje.
 *
 * Ekran NICZEGO NIE LICZY: kompletność i kolejność rozstrzyga `logic/manualFlight.ts`
 * (blokada z powodem przy przycisku), a resztę reguł domena w komendzie
 * `manualFlight` — z próbą generalną przed pierwszym zapisem, bo strumień
 * append-only nie ma transakcji.
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
  KeyValueRow,
  ManualEntrySheet,
  ReadingSheet,
  Screen,
  ScreenHeader,
  SyncChip,
  Tag,
  ValueBox,
  type PickerOption,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useEduBanner, useSessionStore } from '../store';
import { uuidv4 } from '../../infrastructure/id';
import {
  dateUtcLong,
  duration,
  litres,
  motoHours,
  parseLitres,
  parseMotoHours,
  timeUtc,
} from '../format';
import {
  initialReadingFor,
  manualFlightBlocker,
  timesFromEntry,
  type ManualFlightTimes,
} from './logic/manualFlight';
import type { ReferenceAircraft } from '../../domain';

export function ManualFlightScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const queries = useSessionStore((s) => s.queries);
  const manualFlight = useSessionStore((s) => s.manualFlight);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const pilotId = useCurrentPilot((s) => s.id);

  const [eduDismissed, setEduDismissed] = useEduBanner('manual-flight');

  const [fleet, setFleet] = useState<ReferenceAircraft[]>([]);
  useEffect(() => {
    if (!queries) return;
    let alive = true;
    void queries.aircraft().then((list) => {
      if (alive) setFleet(list);
    });
    return () => {
      alive = false;
    };
  }, [queries]);

  const [aircraftId, setAircraftId] = useState<string | null>(null);
  const [times, setTimes] = useState<ManualFlightTimes | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [fuelL, setFuelL] = useState<number | null>(null);
  const [mh, setMh] = useState<number | null>(null);
  const [timesOpen, setTimesOpen] = useState(false);
  const [editing, setEditing] = useState<'fuel' | 'mh' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aircraft = fleet.find((a) => a.id === aircraftId) ?? null;
  const mhFormat = aircraft?.mhFormat ?? 'decimal';
  const handover = aircraft?.handover?.reading ?? null;

  const aircraftOptions: PickerOption<string>[] = useMemo(
    () =>
      fleet.map((a) => ({
        value: a.id,
        label: a.reg,
        detail: a.type,
        // Wyłączony ze służby — jak w preflightcie. Cudzy claim NIE blokuje:
        // wpis dotyczy przeszłości, a nie prawa zapisu „tu i teraz" (§4.4 chroni
        // sesję bieżącą, nie historię).
        disabledReason: a.serviceStatus === 'disabled' ? 'Wyłączony ze służby' : undefined,
        tags: a.serviceStatus === 'disabled' ? [{ label: 'Wyłączony', tone: 'red' as const }] : undefined,
      })),
    [fleet],
  );

  const blocker = manualFlightBlocker(aircraftId, times, { fuelL, mh });

  const save = useCallback(async () => {
    if (aircraftId == null || times == null || fuelL == null || mh == null) return;
    setBusy(true);
    setError(null);
    try {
      const finalReading = { fuelL, mh };
      await manualFlight({
        sessionUuid: uuidv4(),
        aircraftId,
        picId: pilotId,
        dualId: null,
        times,
        initialReading: initialReadingFor(aircraft, finalReading),
        finalReading,
        notes,
      });
      navigation.navigate('MyDay');
    } catch (e) {
      // Powód odmowy domeny wprost przy przycisku — nigdy cichy błąd (§6 pkt 3).
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [aircraft, aircraftId, fuelL, manualFlight, mh, navigation, notes, pilotId, times]);

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="LOT RĘCZNY"
          size="md"
          subtitle={`wpis po fakcie · ${dateUtcLong(Date.now())} · UTC`}
          onBack={() => navigation.navigate('MyDay')}
          backLabel="Mój dzień"
          right={
            <SyncChip
              status={synced ? 'synced' : 'offline'}
              outboxCount={outboxCount}
              lastSyncAt={lastSyncAt}
            />
          }
        />
      }
      footer={
        <ActionButton
          label="ZAPISZ LOT"
          tone="green"
          variant="solid"
          icon="check"
          busy={busy}
          disabledReason={blocker}
          onPress={() => void save()}
        />
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        {/* Czym ten wpis JEST — baner pouczający (Typ C), stan pamiętany per pilot. */}
        <Banner
          kind="edu"
          tone="blue"
          icon="info"
          text={
            'Wpis trafi na listę dnia jak każda sesja — z pełnym oknem korekty 24 h. ' +
            'Odczyty są wymagane, bo stają się przekazaniem dla następnego pilota. ' +
            'Kolejne starty i lądowania tego samego biegu dopiszesz korektą po zapisaniu.'
          }
          collapsedLabel="Czym jest wpis ręczny?"
          dismissed={eduDismissed}
          onDismiss={setEduDismissed}
        />

        {/* ── samolot: lista kart, nie select ─────────────────────────────── */}
        <Card title="Samolot" header="inline" headerRight={<Tag label="wymagane" tone="amber" />}>
          {fleet.length === 0 ? (
            <AppText variant="body" tone="muted">
              Brak samolotów w pamięci urządzenia.
            </AppText>
          ) : (
            <CardPicker options={aircraftOptions} value={aircraftId} onChange={setAircraftId} />
          )}
        </Card>

        {/* ── czasy: jeden arkusz zbiera komplet (wzorzec 08) ─────────────── */}
        <Card title="Czasy · UTC" header="inline" headerRight={<Tag label="wymagane" tone="amber" />}>
          <View style={{ gap: 2 }}>
            <KeyValueRow label="Uruchomienie" value={times != null ? timeUtc(times.engineStart) : '—'} />
            <KeyValueRow label="Start" value={times != null ? timeUtc(times.takeoff) : '—'} />
            <KeyValueRow label="Lądowanie" value={times != null ? timeUtc(times.landing) : '—'} />
            <KeyValueRow
              label="Zatrzymanie"
              value={
                times != null
                  ? `${timeUtc(times.engineStop)} · blok ${duration(times.engineStop - times.engineStart)} · lot ${duration(times.landing - times.takeoff)}`
                  : '—'
              }
            />
          </View>
          <ActionButton
            label={times != null ? 'POPRAW CZASY' : 'WPISZ CZASY'}
            tone="neutral"
            variant="secondary"
            size="md"
            icon="edit"
            onPress={() => setTimesOpen(true)}
          />
        </Card>

        {/* ── odczyt po locie: te same wymagania co przy zdaniu (09b) ─────── */}
        <Card
          title="Odczyt po locie"
          header="inline"
          headerRight={<Tag label="wymagane" tone="red" />}
        >
          <Field
            label="Paliwo na pokładzie"
            hint={handover != null ? `ostatnie przekazanie ${litres(handover.fuelL)}` : undefined}
          >
            <ValueBox
              value={fuelL != null ? `${Math.round(fuelL)}` : ''}
              placeholder="odczytaj z paliwomierza"
              unit="L"
              tone="amber"
              actionIcon="edit"
              onPress={() => setEditing('fuel')}
              accessibilityLabel="Paliwo na pokładzie — wpisz odczyt po locie"
            />
          </Field>
          <Field
            label="Motogodziny"
            hint={
              handover != null
                ? `poprzednio ${motoHours(handover.mh, mhFormat)}`
                : 'format zgodny z licznikiem samolotu'
            }
          >
            <ValueBox
              value={mh != null ? motoHours(mh, mhFormat) : ''}
              placeholder="odczytaj z licznika"
              unit="MH"
              tone="amber"
              actionIcon="edit"
              onPress={() => setEditing('mh')}
              accessibilityLabel="Motogodziny — wpisz odczyt po locie"
            />
          </Field>
        </Card>

        {/* Uwagi przychodzą z arkusza czasów (jak na 08) — pokazujemy je, żeby pilot
            widział, co zapisze, bez otwierania arkusza jeszcze raz. */}
        {notes != null && notes.length > 0 && (
          <Card title="Uwagi" header="inline">
            <AppText variant="body" tone="secondary">
              {notes}
            </AppText>
          </Card>
        )}

        {error != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={error} />
        )}
      </View>

      <ManualEntrySheet
        visible={timesOpen}
        now={Date.now()}
        formatTime={timeUtc}
        onConfirm={(payload) => {
          setTimesOpen(false);
          setTimes(timesFromEntry(payload));
          setNotes(payload.notes ?? null);
        }}
        onCancel={() => setTimesOpen(false)}
      />

      <ReadingSheet
        visible={editing === 'fuel'}
        title="Paliwo po locie"
        unit="L"
        tone="amber"
        initialText={fuelL != null ? `${Math.round(fuelL)}` : ''}
        rows={handover != null ? [{ label: 'Ostatnie przekazanie', value: litres(handover.fuelL) }] : []}
        parse={parseLitres}
        onConfirm={(v) => {
          setFuelL(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />

      <ReadingSheet
        visible={editing === 'mh'}
        title="Motogodziny po locie"
        unit="MH"
        tone="neutral"
        keyboard={mhFormat === 'hhmm' ? 'text' : 'decimal'}
        initialText={mh != null ? motoHours(mh, mhFormat) : ''}
        rows={
          handover != null ? [{ label: 'Poprzednio', value: motoHours(handover.mh, mhFormat) }] : []
        }
        parse={parseMotoHours}
        onConfirm={(v) => {
          setMh(v);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    </Screen>
  );
}
