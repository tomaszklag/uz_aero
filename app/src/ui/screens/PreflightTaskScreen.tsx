/**
 * UZ Aero — 02E PREFLIGHT · krok 2/4: zadanie dnia.
 *
 * Rodzaj operacji, trasa i oznaczenie klienta — czyli „co dziś robimy". Wydzielone
 * z kroku 1 (decyzja 2026-07-30), bo tamten stał się najdłuższym formularzem aplikacji
 * i rósł dalej: lista floty i lista pilotów przybierają z każdym samolotem i każdym
 * nowym kontem. Podział idzie po naturze pytań — krok 1 odpowiada „kto, czym i od kiedy"
 * (wybory z list, w tym przejęcie samolotu), ten odpowiada „co dziś robimy" (opis).
 *
 * PODPOWIEDŹ Z OSTATNIEGO DNIA jest tu warunkiem sensu, nie ozdobnikiem. Żadne z tych
 * pól nie blokuje przejścia dalej (operacja ma wartość domyślną, trasa i klient są
 * opcjonalne), więc bez pamięci ekran byłby codziennym tapnięciem w pusty formularz,
 * żeby zostawić wszystko jak było. Z pamięcią pilot POTWIERDZA to, co widzi, a wpisuje
 * tylko to, co się faktycznie zmieniło (`useTaskMemory`).
 *
 * Podpowiedź ustępuje pilotowi bez pytania: pierwsze dotknięcie któregokolwiek z tych
 * pól wyłącza ją do końca preflightu (`taskTouched` w szkicu). Wyjaśnienie, SKĄD te
 * wartości, jest osobnym bytem — banerem pouczającym (`edu`), który pilot chowa raz
 * i na stałe. Nie znika po dotknięciu pola, bo opisuje regułę, a nie zawartość pól.
 *
 * FORMULARZ CZYTA SIĘ JAK PODSUMOWANIE, NIE JAK KARTKA DO WYPEŁNIENIA (issue #14).
 * Trasa, oznaczenie klienta i notatka są POLAMI W TRYBIE ODCZYTU z ikoną akcji; wpisywanie
 * dzieje się w arkuszu, tym samym ruchem, co godzina meldunku na kroku 1. Powód nie jest
 * estetyczny: pole tekstowe z czterema kratkami wyglądało jak miejsce na przepisanie kodu
 * z pamięci i „trochę nie było widać, że tam jest przeszukiwanie" (zgłoszenie z urządzenia).
 * Arkusz otwiera się z klawiaturą i listą, więc szukanie jest pierwszą rzeczą, którą widać.
 *
 * Przy okazji zniknęły dwa napisy, które opisywały coś innego niż pytanie zadane pilotowi:
 * rząd potwierdzeń pod trasą (nazwa rozpoznanego lotniska stoi teraz W POLU) i podpowiedź
 * pod oznaczeniem klienta (mówiła, co się z wartością dzieje w statystykach i arkuszu).
 *
 * RODZAJ OPERACJI WYZNACZA TRASĘ (issue #13). Skoki wracają tam, skąd wystartowały,
 * więc pytamy o JEDNO lotnisko — do tej pory formularz kazał wpisać ten sam kod dwa razy
 * i pozwalał opisać dzień skoków trasą „EPKK → EPWA", której nie da się polecieć.
 * Pozostałe operacje (przelot, egzamin, lot techniczny, inne) mogą skończyć gdzie indziej
 * i zostają przy parze kodów. O tym, która operacja jest którym kształtem, orzeka domena
 * (`isSameFieldOperation`) — ten sam predykat uzbraja bramkę lądowania w kokpicie, więc
 * formularz i detekcja nie mogą się rozjechać.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AirfieldSheet,
  AppText,
  Banner,
  Card,
  Field,
  OptionGrid,
  Screen,
  ScreenHeader,
  SyncChip,
  TextEntrySheet,
  ValueBox,
  type GridOption,
  type TextSuggestion,
} from '../components';
import { useTheme } from '../theme';
import { useEduBanner, useSessionStore } from '../store';
import { useTaskMemory } from '../store/taskMemory';
import { usePreflightDraft } from '../store/preflightDraft';
import { useTaskSuggestions } from '../hooks/useTaskSuggestions';
import { operationLabel } from './logic/operations';
import { airfieldByIcao, isSameFieldOperation, OPERATION_TYPES } from '../../domain';
import type { OperationType } from '../../domain';

/** Nazwa lotniska do pokazania obok kodu; `undefined`, gdy katalog go nie zna. */
function airfieldName(icao: string): string | undefined {
  return airfieldByIcao(icao)?.name;
}

/** Siatka operacji — ikony jak w `.op-grid` mockupu 02e, nazwy z `operationLabel`. */
const OPERATIONS: GridOption<OperationType>[] = OPERATION_TYPES.map((value) => ({
  value,
  label: operationLabel(value),
  icon: `op-${value}` as const,
}));

export function PreflightTaskScreen({
  navigation,
}: {
  navigation: { navigate: (s: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);

  const draft = usePreflightDraft();
  const aircraft = draft.aircraft;
  const memory = useTaskMemory(aircraft?.id ?? null);

  // Podpowiedź wchodzi RAZ, po odczycie z dysku i tylko gdy pilot niczego jeszcze nie
  // dotknął. Sam magazyn decyduje, czego brakuje: bez zapisu dla tego samolotu trasa
  // zostaje pusta, choć operacja i klient mogą się już podstawić.
  useEffect(() => {
    if (!memory.ready) return;
    draft.suggestTask(
      {
        operation: memory.task?.operation ?? draft.operation,
        client: memory.task?.client ?? null,
      },
      {
        departureIcao: memory.route?.departureIcao ?? '',
        arrivalIcao: memory.route?.arrivalIcao ?? '',
      },
    );
    // `draft` celowo poza zależnościami — hak Zustanda zmienia referencję przy każdym
    // wpisie, a podpowiedź ma się wykonać po odczycie z dysku, nie po każdej literze.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory.ready, memory.task, memory.route]);

  /**
   * Czy w ogóle było co podstawić — czyli czy baner ma o czym mówić.
   *
   * Bez zapamiętanego dnia (pierwszy lot pilota, pierwszy dzień na tym samolocie)
   * formularz jest pusty i wyjaśnienie mechanizmu opisywałoby coś, czego pilot nie
   * widzi. `memory.ready` chroni przed mignięciem banera przed odczytem z dysku.
   */
  const prefilled = memory.ready && (memory.task != null || memory.route != null);
  const [sourceDismissed, setSourceDismissed] = useEduBanner('task-source');

  // Jedno lotnisko czy para — patrz nota na górze pliku.
  const shape = isSameFieldOperation(draft.operation) ? 'single' : 'pair';

  /** Który arkusz jest otwarty — `null` = żaden (dwa pola trasy, dwa pola tekstowe). */
  const [picker, setPicker] = useState<'departure' | 'arrival' | null>(null);
  const [editor, setEditor] = useState<'client' | 'notes' | null>(null);

  // Ostatnio używane oznaczenia i notatki — jedyna treść tego ekranu z serwera.
  // Trzy stany (`undefined` = jeszcze pytamy) opisuje `useTaskSuggestions`; offline
  // nie blokuje niczego, arkusz mówi tylko, że listy nie ma.
  const remote = useTaskSuggestions();
  const clientSuggestions = useMemo<TextSuggestion[] | null>(
    () =>
      remote === undefined
        ? []
        : remote === null
          ? null
          : remote.clients.map((row) => ({
              value: row.value,
              // „Co to było za zlecenie" — ten sam klient bywa i skokami, i przelotem.
              meta: row.operation == null ? null : operationLabel(row.operation),
            })),
    [remote],
  );
  const noteSuggestions = useMemo<TextSuggestion[] | null>(
    () =>
      remote === undefined
        ? []
        : remote === null
          ? null
          : remote.notes.map((row) => ({ value: row.value, meta: null })),
    [remote],
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

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="PREFLIGHT"
          subtitle={[aircraft.reg, aircraft.type].filter(Boolean).join(' · ')}
          step="2 / 4"
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
      footer={
        <ActionButton
          label="DALEJ"
          tone="green"
          variant="solid"
          trailingIcon="next"
          onPress={() => {
            // Zapamiętujemy przy przejściu dalej — czyli wtedy, gdy pilot świadomie
            // zaakceptował te wartości, a nie po każdym stuknięciu w formularz.
            memory.remember(
              { operation: draft.operation, client: draft.client },
              { departureIcao: draft.departureIcao, arrivalIcao: draft.arrivalIcao },
            );
            navigation.navigate('PreflightReadings');
          }}
        />
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        {/* ── skąd te wartości (baner POUCZAJĄCY, trwały per pilot) ────────
            Typ `edu` z taksonomii `docs/design-notes.md`: wyjaśnienie mechanizmu jest
            pomocne za pierwszym razem i szumem przy każdym kolejnym, więc pilot chowa
            je na stałe (`×` → mini-chip w tym samym miejscu).

            Baner opisuje REGUŁĘ, a nie bieżące wartości — dlatego nie znika po pierwszej
            zmianie pola, jak robiła to poprzednia adnotacja. „Uzupełnione z ostatniego
            dnia" przestawało być prawdą dla poprawionego pola i baner musiał uciekać
            z ekranu; zdanie o tym, CO uzupełniamy, jest prawdziwe cały czas. */}
        {prefilled && (
          <Banner
            kind="edu"
            tone="blue"
            icon="info"
            title="Dane z ostatniego dnia"
            text={
              'Formularz uzupełniamy z ostatniego dnia: rodzaj operacji i klienta — z Twojego, ' +
              'trasę — z tego samolotu. Zweryfikuj wartości przed przejściem dalej.'
            }
            collapsedLabel="Skąd te dane?"
            dismissed={sourceDismissed}
            onDismiss={setSourceDismissed}
          />
        )}

        {/* ── rodzaj operacji ─────────────────────────────────────────────── */}
        <Card title="Rodzaj operacji" header="inline">
          <OptionGrid
            options={OPERATIONS}
            value={draft.operation}
            onChange={(v) => draft.set('operation', v)}
          />
        </Card>

        {/* ── trasa ─────────────────────────────────────────────────────────
            Pola są PRZYCISKAMI, nie inputami (issue #14). Wpisywanie i szukanie dzieje
            się w arkuszu — tym samym ruchem, co godzina meldunku na kroku 1. Nazwa
            rozpoznanego lotniska stoi w samym polu, więc zniknął rząd potwierdzeń pod
            spodem („Start: EPZG · …"), który powtarzał kod widoczny wyżej. */}
        <Card title={shape === 'single' ? 'Miejsce skoków' : 'Trasa'} header="inline">
          <View style={{ gap: theme.spacing.sm }}>
            <Field
              label={shape === 'single' ? 'Lotnisko skoków' : 'Start'}
              hint={
                shape === 'single' ? 'Skoki startują i lądują na tym samym lotnisku' : undefined
              }
            >
              <ValueBox
                value={draft.departureIcao}
                placeholder="Wybierz lotnisko"
                meta={airfieldName(draft.departureIcao)}
                actionIcon="search"
                accessibilityLabel={`Lotnisko startu ${draft.departureIcao || 'nie wybrane'} — zmień`}
                onPress={() => setPicker('departure')}
              />
            </Field>

            {shape === 'pair' && (
              <Field label="Lądowanie">
                <ValueBox
                  value={draft.arrivalIcao}
                  placeholder="Wybierz lotnisko"
                  meta={airfieldName(draft.arrivalIcao)}
                  actionIcon="search"
                  accessibilityLabel={`Lotnisko lądowania ${draft.arrivalIcao || 'nie wybrane'} — zmień`}
                  onPress={() => setPicker('arrival')}
                />
              </Field>
            )}
          </View>
        </Card>

        {/* ── opcjonalne ──────────────────────────────────────────────────── */}
        <Card header="inline">
          {/* Bez podpowiedzi pod polem („Wiąże zrzuty dnia z klientem…", issue #14):
              zdanie o statystykach i arkuszu rozliczeniowym opisywało, co się z wartością
              dzieje PÓŹNIEJ, a pilot w tym miejscu odpowiada tylko na pytanie „dla kogo". */}
          <Field label="Oznaczenie klienta" tag={{ label: 'opcjonalne' }}>
            <ValueBox
              variant="text"
              value={draft.client ?? ''}
              placeholder="Bez oznaczenia"
              actionIcon="edit"
              accessibilityLabel={`Oznaczenie klienta ${draft.client ?? 'puste'} — zmień`}
              onPress={() => setEditor('client')}
            />
          </Field>

          <Field label="Notatka do dnia" tag={{ label: 'opcjonalne' }}>
            <ValueBox
              variant="text"
              value={draft.notes ?? ''}
              placeholder="Bez notatki"
              actionIcon="edit"
              accessibilityLabel={`Notatka ${draft.notes ?? 'pusta'} — zmień`}
              onPress={() => setEditor('notes')}
            />
          </Field>
        </Card>
      </View>

      {/* ── arkusz wyboru lotniska ──────────────────────────────────────────
          Jeden arkusz na oba pola — różni je tytuł i to, dokąd wraca wynik. */}
      <AirfieldSheet
        visible={picker != null}
        title={
          picker === 'arrival'
            ? 'Lotnisko lądowania'
            : shape === 'single'
              ? 'Lotnisko skoków'
              : 'Lotnisko startu'
        }
        initialIcao={picker === 'arrival' ? draft.arrivalIcao : draft.departureIcao}
        onConfirm={(icao) => {
          draft.set(picker === 'arrival' ? 'arrivalIcao' : 'departureIcao', icao);
          setPicker(null);
        }}
        onCancel={() => setPicker(null)}
      />

      {/* ── arkusz oznaczenia klienta i notatki ─────────────────────────── */}
      <TextEntrySheet
        visible={editor === 'client'}
        title="Oznaczenie klienta"
        initialText={draft.client ?? ''}
        placeholder="np. SKY CAMP · zlec. 2026/114"
        maxLength={200}
        suggestions={clientSuggestions}
        onConfirm={(text) => {
          draft.set('client', text.length > 0 ? text : null);
          setEditor(null);
        }}
        onCancel={() => setEditor(null)}
      />

      <TextEntrySheet
        visible={editor === 'notes'}
        title="Notatka do dnia"
        initialText={draft.notes ?? ''}
        placeholder="np. lot z uczniem, pokaz dla szkoły"
        multiline
        maxLength={2000}
        suggestions={noteSuggestions}
        onConfirm={(text) => {
          draft.set('notes', text.length > 0 ? text : null);
          setEditor(null);
        }}
        onCancel={() => setEditor(null)}
      />
    </Screen>
  );
}
