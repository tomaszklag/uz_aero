/**
 * UZ Aero — 02A PREFLIGHT · krok 3/4: paliwo i motogodziny.
 *
 * Odwzorowanie mockupu `design/02a-preflight.html` wraz z arkuszami korekty z 02b/02c.
 * Struktura stamtąd: [box „brak danych"] → sekcja PALIWO → sekcja MOTOGODZINY →
 * poświadczenie → DALEJ.
 *
 * Najważniejszy ekran preflightu, bo tutaj powstaje **początek łańcucha MH** (§4.5) —
 * wartość, po której serwer porządkuje sesje samolotu.
 *
 * Zasada nadrzędna (`CLAUDE.md`): **liczniki fizyczne > dane z serwera**. Przekazanie
 * od poprzednika jest podpowiedzią, nie prawdą. Dlatego każda wartość niesie adnotację
 * świeżości (§4.8: `live` bez adnotacji / `cache` z datą synchronizacji / `brak`),
 * historię, która do niej doprowadziła, i korektę na wyciągnięcie kciuka.
 *
 * Świeżość i łączność to **dwie różne osie** (komentarz z mockupu): „brak" zdarza się
 * też online — nowy samolot we flocie albo przejęcie bez danych.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AppText,
  InlineNote,
  LevelBar,
  ReadingSheet,
  Readout,
  Screen,
  ScreenHeader,
  SyncChip,
  type Freshness,
  type TrailRow,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
import {
  dateUtcLong,
  duration,
  litres,
  motoHours,
  parseLitres,
  parseMotoHours,
  timeLocal,
  timeUtc,
} from '../format';
import type { HandoverTrailEntry, ReferencePilot } from '../../domain';

/** Próg, powyżej którego rozbieżność wobec przekazania wymaga świadomego potwierdzenia. */
const FUEL_WARN_L = 10;
const MH_WARN_H = 0.5;

/** „21 JUNE 09:15" — datownik osi czasu (mockup 02a). Czas nieoznaczony = UTC. */
function stamp(t: number): string {
  return `${dateUtcLong(t).replace(/ \d{4}$/, '')} ${timeUtc(t)}`;
}

/**
 * „29 JULY 16:50 UTC · 18:50 LT" — moment przekazania z JAWNĄ strefą.
 *
 * Tu, w odróżnieniu od osi czasu, strefę wypisujemy wprost: to jedyna data na ekranie,
 * po której pilot ocenia, czy odczyty są sprzed godziny czy sprzed tygodnia, a mylnie
 * odczytana o dwie godziny zmienia tę ocenę. LT jako wartość drugorzędna (`CLAUDE.md`),
 * z prawdziwej strefy telefonu — odpowiada na „a która to była u mnie".
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
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);

  const draft = usePreflightDraft();
  // Do rozstrzygnięcia, czy przekazanie jest „od kogoś", czy własne sprzed dnia przerwy.
  const pilotId = useCurrentPilot((s) => s.id);
  const [pilots, setPilots] = useState<ReferencePilot[]>([]);
  const [editing, setEditing] = useState<'fuel' | 'mh' | null>(null);

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
   * Stan świeżości (§4.8). Bez przekazania jest `brak` — niezależnie od sieci.
   * Z przekazaniem: gdy jesteśmy online, wartości są tak świeże, jak ostatni kontakt
   * z serwerem (`live`); offline to z definicji dane z ostatniej synchronizacji (`cache`).
   */
  const serverFreshness: Freshness = handover == null ? 'brak' : synced ? 'live' : 'cache';
  const syncedAt = aircraft != null ? stamp(aircraft.fetchedAt) : null;

  /**
   * Po ręcznej korekcie wartość NIE pochodzi już z serwera — i adnotacja musi to mówić.
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

      if (e.kind === 'duty_start') {
        mh.push({
          id: `m-${e.at}`,
          title: `Start służby · ${stamp(e.at)}`,
          meta: `przed włączeniem ${motoHours(e.mhAfter, mhFormat)} MH`,
        });
      }

      if (e.kind === 'flight') {
        const flown = e.durationMs != null ? duration(e.durationMs) : null;
        const hours = e.durationMs != null ? e.durationMs / 3_600_000 : null;
        const title = `${pilotName(e.pilotId)} latał${flown != null ? ` · ${flown}` : ''}`;

        // Średnie liczymy z danych, nie przepisujemy — inaczej rozjechałyby się
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
      // Ręczna korekta zrywa więź z przekazaniem — od tej chwili źródłem jest licznik.
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
  const mhDiff = handover != null ? draft.mh - handover.reading.mh : 0;
  // Bez odczytów nie da się rozpocząć łańcucha MH — to jedyna twarda blokada tego kroku.
  const noReadings = draft.fuelL <= 0 && draft.mh <= 0;

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="PREFLIGHT"
          // Samolot RAZ, w nagłówku. Wcześniej rejestracja wracała w każdym podpisie
          // („z konfiguracji SP-ANK" pod paliwem, pod MH i w obu arkuszach) — a to jest
          // stała całego ekranu, nie właściwość pojedynczego odczytu. Zniknąć nie może:
          // odczyt wpisany dla złego samolotu zatruwa łańcuch MH (§4.5).
          subtitle={[aircraft.reg, aircraft.type].filter(Boolean).join(' · ')}
          step="3 / 4"
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
      // Przycisk dalej — przy dolnej krawędzi, niezależnie od tego, ile miejsca zajęła
      // oś czasu przekazania (reguła z 2026-07-30).
      footer={
        <ActionButton
          label="DALEJ"
          tone="green"
          variant="solid"
          trailingIcon="next"
          disabledReason={
            noReadings
              ? 'Wprowadź odczyty paliwa i MH z liczników — rozpoczną nowe ogniwo łańcucha'
              : mhDiff < 0
                ? 'Licznik motogodzin nie może być niższy niż przekazany — popraw odczyt'
                : null
          }
          onPress={() => navigation.navigate('PreflightConfirm')}
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
              'Wpisz odczyty z fizycznych liczników — Twój odczyt rozpocznie nowe ogniwo ' +
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
            Pilot zapytał wprost, co ten komunikat mówi i po kim przejmuje samolot —
            czyli pieczątka nie odpowiadała na jedyne pytanie, które w tym miejscu ma
            znaczenie: czyje są liczby stojące wyżej i co z nimi zrobić. Teraz mówi to
            wprost, z jawną strefą czasu.

            Świadomie NIE piszemy „poświadczył": serwer buduje przekazanie albo
            z zamkniętego dnia, albo z dnia jeszcze trwającego (`latestHandover`), a typ
            `Handover` tych dwóch przypadków nie rozróżnia. Słowo o poświadczeniu byłoby
            w drugim przypadku nieprawdą — a to ekran, na którym zaufanie do liczb jest
            całą treścią. */}
        {handover != null && (
          <InlineNote
            icon="check"
            tone="green"
            // Trzy akapity = trzy pytania w kolejności, w jakiej zadaje je pilot:
            // czyje to liczby → z kiedy → co mam z nimi zrobić. Godzina we własnej
            // linii, bo to jedyna wartość, której szuka się tu wzrokiem.
            text={[
              handover.byPilotId === pilotId
                ? `Odczyty powyżej to Twoje własne, z ostatniego dnia na ${aircraft.reg}.`
                : `Odczyty powyżej przekazał ${pilotName(handover.byPilotId)} — to po nim przejmujesz ${aircraft.reg}.`,
              `Stan z ${stampUtcLt(handover.at)}`,
              'Sprawdź go na licznikach. Twój odczyt jest ważniejszy, a ewentualne ' +
                'nieścisłości zostaną rozwiązane przez koordynatora.',
            ].join('\n')}
          />
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
            // a pilot właśnie nadpisuje odczyt — samo słowo „konfiguracja" nic nie wnosiło.
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
        keyboard={mhFormat === 'hhmm' ? 'text' : 'decimal'}
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
              `Licznik nie może się cofnąć — przekazano ${motoHours(handover.reading.mh, mhFormat)} MH. ` +
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
    </Screen>
  );
}
