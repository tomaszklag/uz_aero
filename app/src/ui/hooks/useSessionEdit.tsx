/**
 * UZ Aero — spoina TRYBU EDYCJI sesji (issue #43): oś → arkusz → komenda.
 *
 * Zastąpiła `useEventCorrection`, która umiała jedno: otworzyć arkusz korekty czasu
 * z logu (04, 08). Po issue #43 wejście jest jedno (oś sesji w trybie edycji), ale
 * arkuszy jest pięć — bo pięć jest różnych pytań: czas zdarzenia, odczyt paliwa i MH,
 * skład zrzutu, dopisanie brakującego faktu, historia zmian.
 *
 * Hook trzyma całe okablowanie w jednym miejscu: znalezienie celu, zbudowanie wierszy
 * odniesienia, zapis komendy i obsługę odrzucenia. Ekran dostaje `openRow` do podpięcia
 * pod oś, `openAdd` pod przycisk i gotowe arkusze do wyrenderowania.
 *
 * Cel znajdujemy po uuid w SUROWYM strumieniu (nie efektywnym): korygować można też
 * zdarzenie już poprawione — kolejna korekta po prostu zastępuje poprzednią.
 */

import React, { useCallback, useMemo, useState } from 'react';

import {
  applyCorrections,
  correctionHistory,
  type CorrectionField,
  type CorrectionFields,
  type CorrectionHistoryEntry,
  type CorrectionValue,
  type Event,
  type EventType,
  type JumperCounts,
  type MhFormat,
} from '../../domain';
import {
  AddEventSheet,
  CorrectionHistorySheet,
  CorrectionSheet,
  CrewCorrectionSheet,
  DropCorrectionSheet,
  ReadingCorrectionSheet,
  TextEntrySheet,
  type AddEventExtra,
  type CorrectionHistoryItem,
  type CorrectionRef,
  type SheetRow,
} from '../components';
import { useSessionStore } from '../store';
import { useAircraft } from './useAircraft';
import {
  dateTimeUtcShort,
  duration,
  hhmm,
  litres,
  motoHours,
  parseLitres,
  parseMotoHours,
  thousands,
  timeUtc,
} from '../format';
import { correctionImpact, methodBadgeFor, voidLabelFor } from '../screens/logic/correction';
import type { AxisRow } from '../screens/logic/sessionAxis';
import { claimRetimePlan } from '../screens/logic/claimRetime';
import { fieldLabel, needsFieldLabels } from '../screens/logic/correctionHistoryRows';
import {
  addableTypes,
  editTargetFor,
  preflightUuid,
  type EditTarget,
} from '../screens/logic/sessionEdit';

/** Ikony typów w arkuszu „Dodaj wpis" — słownik ekranu, nie rejestru. */
const ADD_ICON = {
  takeoff: 'takeoff',
  landing: 'landing',
  taxi: 'phase-taxi',
  drop: 'drop',
  boarding: 'boarding',
  refuel: 'refuel',
} as const;

export interface SessionEditApi {
  /** Pod `SessionAxis.onCorrect` — otwiera arkusz właściwy dla wiersza. */
  openRow: (rowId: string) => void;
  /** Pod przycisk „DODAJ WPIS". */
  openAdd: () => void;
  /**
   * Pod ołówek przy notatce (issue #43). Notatka nie stoi na osi — ma własną kartę
   * na końcu ekranu — więc ma własne wejście; arkusz jest ten sam co przy jej
   * pisaniu (02e), bo to ta sama czynność.
   *
   * `label` nazywa TEN tekst („Notatka sesji", „Uwaga wpisu ręcznego") i wchodzi
   * zarówno w nagłówek arkusza, jak i w nagłówek historii zmian.
   */
  openNote: (targetUuid: string, text: string, label?: string) => void;
  /**
   * Pod ołówek przy karcie „Załoga" (issue #43). Dual — jak notatka — nie stoi na osi,
   * bo nie jest zdarzeniem w czasie, tylko faktem o CAŁEJ sesji.
   */
  openCrew: () => void;
  /**
   * Historia zmian BEZ przechodzenia przez arkusz korekty (issue #43, uwaga
   * z urządzenia) — pod plakietkę „popr.".
   *
   * Istnieje, bo znacznik poprawki widać w OBU trybach, a arkusz korekty, który niesie
   * wejście w historię, tylko w edycji. W trybie odczytu (i w podglądzie po oknie 24 h)
   * plakietka jest jedyną drogą do pytania „to co właściwie zmieniono": zamknięte okno
   * odbiera prawo do zmiany danych, nie do ich zrozumienia.
   */
  openRowHistory: (rowId: string) => void;
  openNoteHistory: (targetUuid: string, label: string) => void;
  openCrewHistory: () => void;
  /** Arkusze do wyrenderowania na końcu ekranu (`null`, gdy wszystkie zamknięte). */
  sheets: React.ReactNode;
}

export interface SessionEditOptions {
  /** `picId` → kod pilota (TMK). Bez niej historia pokaże surowe identyfikatory. */
  codeOf?: (pilotId: string) => string;
  /** Kto jest zalogowany — do dopisku „(Ty)" w historii. */
  currentPilotId?: string | null;
  /** Piloci z cache'u referencyjnego — lista wyboru Duala (§4.8, działa offline). */
  pilots?: readonly { id: string; code: string; name: string }[];
}

export function useSessionEdit(
  rows: AxisRow[],
  options: SessionEditOptions = {},
): SessionEditApi {
  const events = useSessionStore((s) => s.events);
  const projection = useSessionStore((s) => s.projection);
  const correctEvent = useSessionStore((s) => s.correctEvent);
  const takeoff = useSessionStore((s) => s.takeoff);
  const landing = useSessionStore((s) => s.landing);
  const taxi = useSessionStore((s) => s.taxi);
  const drop = useSessionStore((s) => s.drop);
  const boarding = useSessionStore((s) => s.boarding);
  const refuel = useSessionStore((s) => s.refuel);
  const manualLogEntry = useSessionStore((s) => s.manualLogEntry);

  const aircraft = useAircraft(projection.aircraftId);
  const mhFormat: MhFormat = projection.mhFormat ?? 'decimal';

  const [target, setTarget] = useState<EditTarget | null>(null);
  const [adding, setAdding] = useState(false);
  /**
   * Otwarta historia zmian. Nie sam uuid, bo zdarzenie potrafi nieść KILKA korygowalnych
   * rzeczy naraz: `preflight_confirm` to paliwo, licznik, notatka i Dual w jednym.
   * Historia otwarta z arkusza notatki musi mówić o notatce — lista wszystkich poprawek
   * preflightu byłaby odpowiedzią na pytanie, którego pilot nie zadał.
   *
   * `only == null` = pełna historia zdarzenia (arkusz czasu, zrzutu — tam cel ma jeden wymiar).
   */
  const [history, setHistory] = useState<{
    uuid: string;
    title: string;
    only?: readonly CorrectionField[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const openRow = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (row == null) return;
      setTarget(editTargetFor(row, events));
    },
    [events, rows],
  );

  const openAdd = useCallback(() => setAdding(true), []);
  const close = useCallback(() => setTarget(null), []);

  /**
   * Historia wiersza osi. Zakres bierze się z ARKUSZA, którym ten wiersz się poprawia:
   * przejęcie i zdanie mają arkusz odczytu, więc pytanie brzmi o paliwo, licznik i czas —
   * notatka i Dual siedzą w tym samym zdarzeniu, ale są innym pytaniem i mają własne
   * plakietki. Reszta wierszy ma jeden wymiar, więc zakresu nie potrzebuje.
   */
  const openRowHistory = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (row == null) return;
      const found = editTargetFor(row, events);
      if (found == null) return;
      setHistory({
        uuid: found.event.uuid,
        title: found.label,
        only: found.sheet === 'reading' ? READING_FIELDS : undefined,
      });
    },
    [events, rows],
  );

  const openNoteHistory = useCallback(
    (targetUuid: string, label: string) =>
      setHistory({ uuid: targetUuid, title: label, only: NOTE_FIELDS }),
    [],
  );

  const [note, setNote] = useState<{ uuid: string; text: string; label: string } | null>(null);
  const openNote = useCallback(
    (targetUuid: string, text: string, label = 'Notatka sesji') =>
      setNote({ uuid: targetUuid, text, label }),
    [],
  );

  const [crewOpen, setCrewOpen] = useState(false);
  const openCrew = useCallback(() => setCrewOpen(true), []);

  /**
   * Adres korekty załogi: `preflight_confirm`. Dual jest tam FAKTEM o całej sesji —
   * w nagłówkach zdarzeń zostaje tożsamość z chwili zapisu i zostać musi (append-only).
   */
  const preflight = useMemo(() => preflightUuid(events), [events]);

  const openCrewHistory = useCallback(() => {
    if (preflight == null) return;
    setHistory({ uuid: preflight, title: 'Drugi pilot', only: DUAL_FIELDS });
  }, [preflight]);

  /** Lista wyboru bez PIC-a tej sesji — `DUAL_IS_PIC` i tak by go odrzucił. */
  const crewOptions = useMemo(
    () => (options.pilots ?? []).filter((p) => p.id !== projection.sessionPicId),
    [options.pilots, projection.sessionPicId],
  );

  /** Strumień EFEKTYWNY — wartości „w mocy teraz", czyli po wcześniejszych korektach. */
  const effective = useMemo(() => applyCorrections(events), [events]);
  const effectiveOf = useCallback(
    (uuid: string): Event | undefined => effective.find((e) => e.uuid === uuid),
    [effective],
  );

  /** Zapis korekty. Odrzucenie reguł ląduje w `lastError` — pokazuje je ekran. */
  const save = useCallback(
    async (payload: Parameters<typeof correctEvent>[0]) => {
      setBusy(true);
      try {
        await correctEvent(payload);
      } catch {
        // Twarde naruszenie (np. okno 24 h minęło) — komunikat jest w store.
      } finally {
        setBusy(false);
        setTarget(null);
      }
    },
    [correctEvent],
  );

  // ── arkusz czasu (10E) ──────────────────────────────────────────────────────

  const timeTarget = target?.sheet === 'time' ? target.event : null;
  const originalTime = useMemo(() => {
    if (timeTarget == null) return 0;
    const current = effectiveOf(timeTarget.uuid);
    return current?.gpsTime ?? current?.deviceTime ?? timeTarget.gpsTime ?? timeTarget.deviceTime;
  }, [effectiveOf, timeTarget]);

  const refsFor = useCallback(
    (newTime: number): CorrectionRef[] => {
      if (timeTarget == null) return [];
      const refs: CorrectionRef[] = [];

      const badge = methodBadgeFor(timeTarget);
      if (badge != null) {
        refs.push({ label: 'Metoda wykrycia', value: badge === 'ręcznie' ? 'wpis pilota' : 'GPS' });
      }

      const impact = correctionImpact(events, timeTarget, newTime);
      if (impact != null) {
        refs.push({
          label: impact.label,
          value: `${duration(impact.beforeMs)} → ${duration(impact.afterMs)}`,
        });
      }
      return refs;
    },
    [events, timeTarget],
  );

  // ── arkusz odczytu (10F) ────────────────────────────────────────────────────

  const readingTarget = target?.sheet === 'reading' ? target.event : null;
  const reading = useMemo(() => {
    if (readingTarget == null) return null;
    const current = effectiveOf(readingTarget.uuid) ?? readingTarget;
    if (current.type === 'preflight_confirm') return current.payload.reading;
    if (current.type === 'day_close') return current.payload.finalReading;
    return null;
  }, [effectiveOf, readingTarget]);

  /**
   * Pole czasu arkusza odczytu — TYLKO przy przejęciu (uwaga z urządzenia, issue #43).
   *
   * Granice: nie wcześniej niż doba wstecz od bieżącej godziny przejęcia (dalej to nie
   * korekta, tylko inna sesja) i nie później niż „teraz" — czas z przyszłości odrzuca
   * i tak reguła `CORRECTION_TIME_IN_FUTURE`.
   */
  const claimUuid =
    readingTarget?.type === 'preflight_confirm'
      ? (events.find((e) => e.type === 'session_claim')?.uuid ?? null)
      : null;

  const claimTimeField = useMemo(() => {
    if (claimUuid == null || projection.claimedAt == null) return null;
    const current = projection.claimedAt;
    return {
      value: current,
      min: current - 24 * 3_600_000,
      max: Date.now(),
      format: timeUtc,
      noteFor: (value: number) => {
        const plan = claimRetimePlan(projection, events, claimUuid, value);
        if (plan.kind === 'cascade') return { text: plan.note, blocking: false };
        if (plan.kind === 'refused') return { text: plan.note, blocking: true };
        return null;
      },
    };
  }, [claimUuid, events, projection]);

  /** Zapis godziny przejęcia — jedna korekta albo kaskada, wg planu. */
  const saveClaimTime = useCallback(
    async (newTime: number, reason: string | null) => {
      if (claimUuid == null) return;
      const plan = claimRetimePlan(projection, events, claimUuid, newTime);
      if (plan.kind === 'unchanged' || plan.kind === 'refused') return;

      setBusy(true);
      try {
        // Każdy krok to OSOBNA korekta — rejestr jest append-only, więc „przesunięcie
        // sesji" nie jest jedną operacją, tylko zbiorem faktów o poszczególnych
        // zdarzeniach. Powód wpisujemy do wszystkich: w historii każdego z nich ma
        // stać to samo zdanie, bo to była jedna decyzja pilota.
        for (const step of plan.steps) {
          await correctEvent({
            targetUuid: step.uuid,
            action: 'retime',
            newTime: step.newTime,
            reason,
          });
        }
      } catch {
        // Twarde naruszenie jest w `lastError` — pokazuje je ekran.
      } finally {
        setBusy(false);
        setTarget(null);
      }
    },
    [claimUuid, correctEvent, events, projection],
  );

  const readingRows = useMemo((): SheetRow[] => {
    const out: SheetRow[] = [];
    if (aircraft?.capacityL != null) {
      out.push({ label: 'Pojemność zbiorników', value: litres(aircraft.capacityL) });
    }
    if (projection.fuel.consumedL != null) {
      out.push({ label: 'Zużycie sesji', value: litres(projection.fuel.consumedL) });
    }
    out.push({
      label: 'Format licznika',
      value: mhFormat === 'hhmm' ? 'hh:mm' : 'godziny dziesiętne',
    });
    return out;
  }, [aircraft, mhFormat, projection.fuel.consumedL]);

  // ── arkusz zrzutu (10G) ─────────────────────────────────────────────────────

  const dropTarget = target?.sheet === 'drop' ? target.event : null;
  const dropCurrent = useMemo(() => {
    if (dropTarget == null) return null;
    const current = effectiveOf(dropTarget.uuid) ?? dropTarget;
    return current.type === 'drop' ? current : null;
  }, [effectiveOf, dropTarget]);

  // ── historia zmian (10I) ────────────────────────────────────────────────────

  /**
   * Zawężenie historii do wybranych pól. Wpisy o samym FAKCIE (`void`, `unvoid`) mają
   * `field: null` i w widoku zawężonym nie mają czego opisywać — a zawęża się wyłącznie
   * historię pól `preflight_confirm`, którego unieważnić i tak nie wolno.
   */
  const scoped = useCallback(
    (entries: CorrectionHistoryEntry[], only?: readonly CorrectionField[]) =>
      only == null ? entries : entries.filter((e) => e.field != null && only.includes(e.field)),
    [],
  );

  const historyEntries = useMemo(
    () => (history == null ? [] : scoped(correctionHistory(events, history.uuid), history.only)),
    [events, history, scoped],
  );

  const historyCountOf = useCallback(
    (uuid: string | undefined, only?: readonly CorrectionField[]): number =>
      uuid == null ? 0 : scoped(correctionHistory(events, uuid), only).length,
    [events, scoped],
  );

  const historySource = useMemo(() => {
    if (history == null) return null;
    return events.find((e) => e.uuid === history.uuid) ?? null;
  }, [events, history]);

  /** Sam kod pilota — bez „(Ty)". Wartość pola „drugi pilot" jest DANĄ, nie autorem. */
  const whoCode = useCallback(
    (pilotId: string): string => options.codeOf?.(pilotId) ?? pilotId,
    [options],
  );

  const whoOf = useCallback(
    (pilotId: string): string => {
      const code = whoCode(pilotId);
      return pilotId === options.currentPilotId ? `${code} (Ty)` : code;
    },
    [options, whoCode],
  );

  /** Podpisy pól — tylko przy liście mieszanej; uzasadnienie w `correctionHistoryRows`. */
  const labelled = useMemo(() => needsFieldLabels(historyEntries), [historyEntries]);

  const historyItems = useMemo(
    (): CorrectionHistoryItem[] =>
      // Najnowsza NA GÓRZE: domena zwraca chronologicznie (tak wychodzi ze składania
      // „było → jest"), a pilot pyta najpierw o stan aktualny.
      [...historyEntries].reverse().map((entry, index) => ({
        id: `${entry.correctionUuid}-${entry.field ?? entry.kind}-${index}`,
        when: `${dateTimeUtcShort(entry.at)} UTC`,
        who: whoOf(entry.byPilotId),
        byAdmin: entry.byAdmin,
        field: entry.field != null && labelled ? fieldLabel(entry.field) : null,
        from: formatValue(entry.field, entry.from, mhFormat, whoCode),
        to: formatValue(entry.field, entry.to, mhFormat, whoCode),
        verdict:
          entry.kind === 'void'
            ? 'unieważnione — „tego nie było"'
            : entry.kind === 'unvoid'
              ? 'przywrócone kolejną poprawką'
              : null,
        verdictTone: entry.kind === 'void' ? 'red' : 'green',
        reason: entry.reason,
      })),
    [historyEntries, labelled, mhFormat, whoCode, whoOf],
  );

  const historyOrigin = useMemo(() => {
    if (historySource == null) return null;
    const at = historySource.gpsTime ?? historySource.deviceTime;
    return {
      when: `${dateTimeUtcShort(at)} UTC`,
      value: originalValueOf(historySource, mhFormat, history?.only, whoCode),
    };
  }, [history?.only, historySource, mhFormat, whoCode]);

  // ── dopisanie wpisu (10H) ───────────────────────────────────────────────────

  const addOptions = useMemo(
    () =>
      addableTypes(projection.operation).map((t) => ({
        id: t.type,
        label: t.label,
        icon: ADD_ICON[t.type],
      })),
    [projection.operation],
  );

  /** Domyślny czas nowego wpisu: koniec biegu silnika, a przy sesji w toku — teraz. */
  const addInitialTime = useMemo(() => {
    const leg = projection.legs[projection.legs.length - 1];
    return leg?.stoppedAt ?? Date.now();
  }, [projection.legs]);

  const addRefs = useCallback(
    (typeId: string, time: number): SheetRow[] => {
      const out: SheetRow[] = [];
      const leg = projection.legs[projection.legs.length - 1];
      if (leg != null) {
        out.push({
          label: 'Zakres biegu silnika',
          value:
            leg.stoppedAt == null
              ? `od ${timeUtc(leg.startedAt)}`
              : `${timeUtc(leg.startedAt)} – ${timeUtc(leg.stoppedAt)}`,
        });
      }
      if (typeId === 'landing') {
        const open = projection.flights.find((f) => f.landingAt == null);
        if (open != null) {
          out.push({ label: 'Domyka lot', value: `lot ${open.index} · start ${timeUtc(open.takeoffAt)}` });
          out.push({
            label: 'Wpływ na czas lotu',
            value: `${hhmm(projection.flightTimeMs)} → ${hhmm(projection.flightTimeMs + Math.max(0, time - open.takeoffAt))}`,
          });
        }
      }
      return out;
    },
    [projection.flights, projection.flightTimeMs, projection.legs],
  );

  const addEvent = useCallback(
    async (typeId: string, time: number, note: string | null, extra?: AddEventExtra) => {
      setBusy(true);
      try {
        const type = typeId as EventType;
        if (type === 'takeoff') await takeoff('manual', null, time);
        else if (type === 'landing') await landing('manual', null, time);
        else if (type === 'taxi') await taxi('manual', null, time);
        else if (type === 'drop') await drop({ jumpers: EMPTY_JUMPERS, at: time });
        else if (type === 'boarding') await boarding({ jumpers: EMPTY_JUMPERS, at: time });
        else if (type === 'refuel' && extra?.refuel != null) await refuel(extra.refuel, time);
      } catch {
        // Odrzucenie reguł jest w `lastError`.
      } finally {
        setBusy(false);
        setAdding(false);
      }
      /*
       * Uwaga pilota (`note`) idzie osobnym zdarzeniem `manual_log_entry` — pojedyncze
       * fakty operacyjne nie mają w payloadzie pola na tekst i dokładanie go tam tylko
       * po to, żeby uwaga miała gdzie usiąść, rozsypałoby ją po pięciu kształtach.
       * Wpis bez czasów niesie SAM tekst i pokazuje się w karcie „Notatki" na ekranie
       * sesji (`sessionNotes.ts`), czyli dokładnie tam, gdzie pilot będzie go szukał.
       */
      if (note != null) {
        try {
          await manualLogEntry({ notes: note });
        } catch {
          // Fakt jest już zapisany; utrata samej uwagi nie może go cofnąć.
        }
      }
    },
    [boarding, drop, landing, manualLogEntry, refuel, taxi, takeoff],
  );

  // ── arkusze ─────────────────────────────────────────────────────────────────

  const sheets = (
    <>
      {timeTarget != null && (
        <CorrectionSheet
          visible
          eventLabel={target?.label ?? ''}
          eventIcon={iconFor(timeTarget.type)}
          originalTime={originalTime}
          methodBadge={methodBadgeFor(timeTarget)}
          refsFor={refsFor}
          formatTime={timeUtc}
          maxTime={Date.now()}
          voidLabel={voidLabelFor(timeTarget.type)}
          voidHint={
            'Oznacza zdarzenie jako błędne (nie usuwa go z rejestru) · użyj, gdy autodetekcja ' +
            'zaliczyła przelot nad lotniskiem jako lądowanie'
          }
          busy={busy}
          historyCount={historyCountOf(timeTarget.uuid)}
          onOpenHistory={() =>
            setHistory({ uuid: timeTarget.uuid, title: target?.label ?? '' })
          }
          onSave={(newTime, reason) =>
            void save({ targetUuid: timeTarget.uuid, action: 'retime', newTime, reason })
          }
          onVoid={(reason) => void save({ targetUuid: timeTarget.uuid, action: 'void', reason })}
          onCancel={close}
        />
      )}

      {readingTarget != null && reading != null && (
        <ReadingCorrectionSheet
          visible
          title={target?.label ?? ''}
          subtitle={`zapisano ${timeUtc(readingTarget.gpsTime ?? readingTarget.deviceTime)} UTC`}
          /* Pole czasu WYŁĄCZNIE przy przejęciu — uzasadnienie w propsach arkusza. */
          time={claimTimeField}
          fuelText={String(Math.round(reading.fuelL))}
          mhText={motoHours(reading.mh, mhFormat)}
          parseFuel={parseLitres}
          parseMh={parseMotoHours}
          rows={readingRows}
          warning={
            readingTarget.type === 'day_close'
              ? 'Ten odczyt jest przekazaniem maszyny: od niego zaczyna się następna sesja tego samolotu i to on domyka łańcuch motogodzin.'
              : 'Ten odczyt otwiera łańcuch motogodzin sesji — zmiana przeliczy zużycie i porównanie z normą.'
          }
          /* Odczyt to paliwo, licznik i — przy przejęciu — godzina. Notatka i Dual
             siedzą w tym samym zdarzeniu, ale są innym pytaniem i mają własne arkusze. */
          historyCount={historyCountOf(readingTarget.uuid, READING_FIELDS)}
          onOpenHistory={() =>
            setHistory({
              uuid: readingTarget.uuid,
              title: target?.label ?? '',
              only: READING_FIELDS,
            })
          }
          onSave={({ newTime, ...fields }, reason) => {
            const uuid = readingTarget.uuid;
            if (Object.keys(fields).length > 0) {
              void save({ targetUuid: uuid, action: 'amend', fields, reason });
            }
            if (newTime != null && claimUuid != null) {
              void saveClaimTime(newTime, reason);
            }
          }}
          onCancel={close}
        />
      )}

      {dropCurrent != null && (
        <DropCorrectionSheet
          visible
          title={target?.label ?? ''}
          originalTime={dropCurrent.gpsTime ?? dropCurrent.deviceTime}
          jumpers={dropCurrent.payload.jumpers ?? null}
          altitude={
            dropCurrent.payload.altitudeFt != null
              ? `${thousands(dropCurrent.payload.altitudeFt)} FT`
              : null
          }
          formatTime={timeUtc}
          maxTime={Date.now()}
          busy={busy}
          historyCount={historyCountOf(dropCurrent.uuid)}
          onOpenHistory={() =>
            setHistory({ uuid: dropCurrent.uuid, title: target?.label ?? '' })
          }
          onSave={(correction, reason) => {
            const uuid = dropCurrent.uuid;
            if (correction.newTime != null) {
              void save({ targetUuid: uuid, action: 'retime', newTime: correction.newTime, reason });
            }
            if (correction.jumpers !== undefined) {
              void save({
                targetUuid: uuid,
                action: 'amend',
                fields: { jumpers: correction.jumpers },
                reason,
              });
            }
          }}
          onVoid={(reason) => void save({ targetUuid: dropCurrent.uuid, action: 'void', reason })}
          onCancel={close}
        />
      )}

      <AddEventSheet
        visible={adding}
        options={addOptions}
        initialTime={addInitialTime}
        formatTime={timeUtc}
        maxTime={Date.now()}
        refsFor={addRefs}
        fuelBeforeL={projection.fuel.lastReadingL}
        busy={busy}
        onConfirm={(typeId, time, note, extra) => void addEvent(typeId, time, note, extra)}
        onCancel={() => setAdding(false)}
      />

      {/* Notatka: ten sam arkusz, co przy jej pisaniu na 02e — to ta sama czynność,
          więc nie ma powodu, żeby wyglądała inaczej. Pusty tekst KASUJE notatkę
          (`notes: null`), bo „usuń" i „wyczyść pole" to dla pilota jedno. */}
      <TextEntrySheet
        visible={note != null}
        title={(note?.label ?? 'Notatka sesji').toUpperCase()}
        initialText={note?.text ?? ''}
        placeholder="np. drugi zbiornik nie trzyma wskazania"
        multiline
        maxLength={2000}
        suggestions={null}
        /* Historia SAMEJ notatki: `preflight_confirm` niesie obok niej paliwo, licznik
           i Duala, a pilot otwierający ten arkusz pyta o tekst, nie o odczyty. */
        historyCount={historyCountOf(note?.uuid, NOTE_FIELDS)}
        onOpenHistory={note == null ? undefined : () => openNoteHistory(note.uuid, note.label)}
        onConfirm={(text) => {
          const uuid = note?.uuid;
          setNote(null);
          if (uuid == null) return;
          void save({
            targetUuid: uuid,
            action: 'amend',
            fields: { notes: text.trim() === '' ? null : text.trim() },
            reason: null,
          });
        }}
        onCancel={() => setNote(null)}
      />

      {preflight != null && (
        <CrewCorrectionSheet
          visible={crewOpen}
          dualId={projection.dualId}
          options={crewOptions}
          historyCount={historyCountOf(preflight, DUAL_FIELDS)}
          onOpenHistory={openCrewHistory}
          onSave={(dualId, reason) => {
            setCrewOpen(false);
            void save({
              targetUuid: preflight,
              action: 'amend',
              fields: { dualId },
              reason,
            });
          }}
          onCancel={() => setCrewOpen(false)}
        />
      )}

      <CorrectionHistorySheet
        visible={history != null}
        title={history?.title ?? ''}
        items={historyItems}
        origin={historyOrigin}
        onClose={() => setHistory(null)}
      />
    </>
  );

  return {
    openRow,
    openAdd,
    openNote,
    openCrew,
    openRowHistory,
    openNoteHistory,
    openCrewHistory,
    sheets,
  };
}

const EMPTY_JUMPERS: JumperCounts = { tandem: 0, aff: 0, solo: 0 };

/**
 * Zakresy historii dla arkuszy zdarzenia WIELOWYMIAROWEGO.
 *
 * `preflight_confirm` niesie cztery korygowalne rzeczy naraz i każda ma własny arkusz,
 * więc każdy pyta o swoją. Bez tego zawężenia poprawka paliwa zapalałaby licznik historii
 * przy notatce — i odwrotnie.
 */
const READING_FIELDS: readonly CorrectionField[] = ['time', 'fuelL', 'mh'];
const NOTE_FIELDS: readonly CorrectionField[] = ['notes'];
const DUAL_FIELDS: readonly CorrectionField[] = ['dualId'];

const iconFor = (type: EventType): 'takeoff' | 'refuel' | 'drop' | 'boarding' | 'landing' =>
  type === 'takeoff'
    ? 'takeoff'
    : type === 'refuel'
      ? 'refuel'
      : type === 'drop'
        ? 'drop'
        : type === 'boarding'
          ? 'boarding'
          : 'landing';

/** Wartość historii → napis. Każde pole ma własną jednostkę, więc formatuje się osobno. */
function formatValue(
  field: CorrectionHistoryEntry['field'],
  value: CorrectionValue,
  mhFormat: MhFormat,
  codeOf: (pilotId: string) => string,
): string | null {
  if (field == null) return null;
  // `null` przy notatce i Dualu jest WARTOŚCIĄ („skasowano", „sam pilot"), a nie brakiem
  // danych — i musi się przeczytać jako zmiana, inaczej wiersz historii milczy o tym,
  // co się właśnie stało. Przy liczbach `null` znaczy „nie było czego zastąpić".
  if (value == null) {
    if (field === 'notes') return 'bez notatki';
    if (field === 'dualId') return 'bez drugiego pilota';
    return null;
  }
  if (field === 'time') return typeof value === 'number' ? timeUtc(value) : null;
  if (field === 'fuelL') return typeof value === 'number' ? litres(value) : null;
  if (field === 'mh') return typeof value === 'number' ? motoHours(value, mhFormat) : null;
  // Drugi pilot jest identyfikatorem, a pilot czyta KOD (AKO) — surowe uuid w historii
  // nie mówiłoby nic nikomu.
  if (field === 'dualId') return typeof value === 'string' ? codeOf(value) : null;
  // Notatkę pokazujemy w cudzysłowie i w całości: to zdanie, a nie odczyt, więc
  // skrócenie go do „…" odebrałoby historii jedyną treść, o którą tu chodzi.
  if (field === 'notes') return typeof value === 'string' ? `„${value}"` : null;
  if (typeof value !== 'object') return String(value);
  return `${value.tandem + value.aff + value.solo} skoczków`;
}

/**
 * Kotwica historii: co niosło zdarzenie, zanim ktokolwiek je poprawił.
 *
 * Zawężona historia dostaje zawężoną kotwicę — w historii notatki „150 L · 1234,5 MH"
 * byłoby odpowiedzią na inne pytanie.
 */
function originalValueOf(
  event: Event,
  mhFormat: MhFormat,
  only: readonly CorrectionField[] | undefined,
  codeOf: (pilotId: string) => string,
): string {
  if (only?.length === 1) {
    const field = only[0];
    if (field === 'notes' || field === 'dualId') {
      const value =
        field === 'notes'
          ? (event.type === 'preflight_confirm' || event.type === 'manual_log_entry'
              ? (event.payload.notes ?? null)
              : null)
          : event.type === 'preflight_confirm'
            ? (event.payload.dualId !== undefined ? event.payload.dualId : event.dualId)
            : null;
      const text = formatValue(field, value, mhFormat, codeOf);
      return text ?? '—';
    }
  }
  if (event.type === 'preflight_confirm') {
    return `${litres(event.payload.reading.fuelL)} · ${motoHours(event.payload.reading.mh, mhFormat)}`;
  }
  if (event.type === 'day_close') {
    return `${litres(event.payload.finalReading.fuelL)} · ${motoHours(event.payload.finalReading.mh, mhFormat)}`;
  }
  return timeUtc(event.gpsTime ?? event.deviceTime);
}
