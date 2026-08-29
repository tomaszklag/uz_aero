/**
 * UZ Aero - 02E NOWY LOT · krok 2/3: zadanie dnia.
 *
 * Rodzaj operacji, trasa i oznaczenie klienta - czyli „co dziś robimy". Wydzielone
 * z kroku 1 (decyzja 2026-07-30), bo tamten stał się najdłuższym formularzem aplikacji
 * i rósł dalej: lista floty i lista pilotów przybierają z każdym samolotem i każdym
 * nowym kontem. Podział idzie po naturze pytań - krok 1 odpowiada „kto, czym i od kiedy"
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
 * wartości, jest osobnym bytem - banerem pouczającym (`edu`), który pilot chowa raz
 * i na stałe. Nie znika po dotknięciu pola, bo opisuje regułę, a nie zawartość pól.
 *
 * FORMULARZ CZYTA SIĘ JAK PODSUMOWANIE, NIE JAK KARTKA DO WYPEŁNIENIA (issue #14).
 * Trasa, oznaczenie klienta i notatka są POLAMI W TRYBIE ODCZYTU z ikoną akcji; wpisywanie
 * dzieje się w arkuszu, tym samym ruchem, co godzina meldunku na kroku 1. Powód nie jest
 * estetyczny: pole tekstowe z czterema kratkami wyglądało jak miejsce na przepisanie kodu
 * z pamięci i „trochę nie było widać, że tam jest przeszukiwanie" (zgłoszenie z urządzenia).
 * Arkusz otwiera się z listą podpowiedzi, więc szukanie jest pierwszą rzeczą, którą widać.
 *
 * Przy okazji zniknęły dwa napisy, które opisywały coś innego niż pytanie zadane pilotowi:
 * rząd potwierdzeń pod trasą (nazwa rozpoznanego lotniska stoi teraz W POLU) i podpowiedź
 * pod oznaczeniem klienta (mówiła, co się z wartością dzieje w statystykach i arkuszu).
 *
 * RODZAJ OPERACJI WYZNACZA TRASĘ (issue #13). Skoki wracają tam, skąd wystartowały,
 * więc pytamy o JEDNO lotnisko - do tej pory formularz kazał wpisać ten sam kod dwa razy
 * i pozwalał opisać dzień skoków trasą „EPKK → EPWA", której nie da się polecieć.
 * Pozostałe operacje (przelot, egzamin, lot techniczny, inne) mogą skończyć gdzie indziej
 * i zostają przy parze kodów. O tym, która operacja jest którym kształtem, orzeka domena
 * (`isSameFieldOperation`) - ten sam predykat uzbraja bramkę lądowania w kokpicie, więc
 * formularz i detekcja nie mogą się rozjechać.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AirfieldSheet,
  AppText,
  Banner,
  Card,
  Field,
  JumperDefaultsSheet,
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
import { useNearbyPosition } from '../hooks/useNearbyPosition';
import { operationLabel } from './logic/operations';
import { jumperDefaultsLabel, normalizeJumperDefaults } from './logic/jumperDefaults';
import { isJumpOperation, isSameFieldOperation, OPERATION_TYPES } from '../../domain';
import type { OperationType } from '../../domain';
/**
 * Nazwa lotniska albo plakietka „spoza katalogu" (issue #62 pkt 1) - jedna decyzja
 * na oba ekrany z trasą, żeby EDDB nie wyglądało tu inaczej niż we wpisie ręcznym.
 */
import { airfieldValueProps } from '../components/input/airfieldMark';

/** Siatka operacji - ikony jak w `.op-grid` mockupu 02e, nazwy z `operationLabel`. */
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
    // `draft` celowo poza zależnościami - hak Zustanda zmienia referencję przy każdym
    // wpisie, a podpowiedź ma się wykonać po odczycie z dysku, nie po każdej literze.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory.ready, memory.task, memory.route]);

  /**
   * Czy w ogóle było co podstawić - czyli czy baner ma o czym mówić.
   *
   * Bez zapamiętanego dnia (pierwszy lot pilota, pierwszy dzień na tym samolocie)
   * formularz jest pusty i wyjaśnienie mechanizmu opisywałoby coś, czego pilot nie
   * widzi. `memory.ready` chroni przed mignięciem banera przed odczytem z dysku.
   */
  const prefilled = memory.ready && (memory.task != null || memory.route != null);
  const [sourceDismissed, setSourceDismissed] = useEduBanner('task-source');

  // Jedno lotnisko czy para - patrz nota na górze pliku.
  const shape = isSameFieldOperation(draft.operation) ? 'single' : 'pair';

  /** Który arkusz jest otwarty - `null` = żaden (dwa pola trasy, dwa pola tekstowe). */
  const [picker, setPicker] = useState<'departure' | 'arrival' | null>(null);
  const [editor, setEditor] = useState<'client' | 'notes' | null>(null);
  const [jumperSheetOpen, setJumperSheetOpen] = useState(false);

  // Pozycja do listy „najbliżej Ciebie" w wyborze lotniska. Pytamy przez cały czas
  // na ekranie, nie dopiero przy otwarciu arkusza: zimny fix przychodzi wolniej, niż
  // pilot zdąży tapnąć w pole. Brak pozycji nie blokuje niczego (patrz hook).
  const position = useNearbyPosition(true);

  // Ostatnio używane oznaczenia i notatki - jedyna treść tego ekranu z serwera.
  // Żądanie leci dopiero przy OTWARCIU arkusza (patrz `openEditor` niżej i nota w hooku):
  // klient i notatka są opcjonalne, więc pobieranie „na zapas" przy wejściu na ekran
  // płaciło jednym żądaniem za każdy preflight, w którym pilot i tak ich nie dotknął.
  const { suggestions: remote, reload: reloadSuggestions } = useTaskSuggestions();
  // Trzy stany jadą do arkusza NIETKNIĘTE (`undefined` = pytamy, `null` = nie mamy,
  // tablica = mamy, choćby pustą) - zwinięcie „pytamy" do pustej listy kazałoby arkuszowi
  // ogłaszać „historia jest pusta", zanim odpowiedź w ogóle wróci.
  const clientSuggestions = useMemo<TextSuggestion[] | null | undefined>(
    () =>
      remote == null
        ? remote
        : remote.clients.map((row) => ({
            value: row.value,
            // „Co to było za zlecenie" - ten sam klient bywa i skokami, i przelotem.
            meta: row.operation == null ? null : operationLabel(row.operation),
          })),
    [remote],
  );
  const noteSuggestions = useMemo<TextSuggestion[] | null | undefined>(
    () =>
      remote == null ? remote : remote.notes.map((row) => ({ value: row.value, meta: null })),
    [remote],
  );

  /**
   * Otwarcie arkusza to JEDYNY moment, w którym pytamy serwer o podpowiedzi - wtedy
   * i tylko wtedy wynik ma się gdzie pokazać. Hook pilnuje, żeby otwarcie klienta,
   * a zaraz potem notatki, nie wysłało dwóch żądań (świeża odpowiedź żyje minutę),
   * i żeby nieudana próba nie zablokowała kolejnej - pilot, który odzyskał zasięg,
   * dostanie listę przy następnym otwarciu.
   */
  const openEditor = useCallback(
    (which: 'client' | 'notes') => {
      reloadSuggestions();
      setEditor(which);
    },
    [reloadSuggestions],
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
          title="NOWY LOT"
          subtitle={[aircraft.reg, aircraft.type].filter(Boolean).join(' · ')}
          step="2 / 3"
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
            // Zapamiętujemy przy przejściu dalej - czyli wtedy, gdy pilot świadomie
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

            Baner opisuje REGUŁĘ, a nie bieżące wartości - dlatego nie znika po pierwszej
            zmianie pola, jak robiła to poprzednia adnotacja. „Uzupełnione z ostatniego
            dnia" przestawało być prawdą dla poprawionego pola i baner musiał uciekać
            z ekranu; zdanie o tym, CO uzupełniamy, jest prawdziwe cały czas.

            ZNIKA za to po „WYCZYŚĆ FORMULARZ" (uwaga z urządzenia, 2026-08-27) - pilnuje
            tego `draft.suggested`, nie sama pamięć zadania: po wyczyszczeniu podstawione
            dane już nie stoją (i nie wrócą - `taskTouched`), więc baner o nich kłamałby,
            także po powrocie na ekran. */}
        {prefilled && draft.suggested && (
          <Banner
            kind="edu"
            tone="blue"
            title="Dane z ostatniego dnia"
            text={
              'Rodzaj operacji i oznaczenie klienta zostały uzupełnione z Twojego ostatniego dnia lotnego. Lotnisko startu pochodzi z ostatniego miejsca lądowania samolotu. ' +
              'Zweryfikuj wartości przed przejściem dalej.'
            }
            collapsedLabel="Skąd te dane?"
            dismissed={sourceDismissed}
            onDismiss={setSourceDismissed}
            // Baner tłumaczący, skąd wzięły się wartości, jest naturalnym miejscem
            // decyzji „nie chcę ich": czyści pola zadania do stanu początkowego
            // i przywraca czysty formularz (notatki nie rusza - nie była podpowiedzią).
            action={{ label: 'Wyczyść formularz', onPress: () => draft.clearTask() }}
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
            się w arkuszu - tym samym ruchem, co godzina meldunku na kroku 1. Nazwa
            rozpoznanego lotniska stoi w samym polu, więc zniknął rząd potwierdzeń pod
            spodem („Start: EPZG · …"), który powtarzał kod widoczny wyżej.

            Przy skokach karta NIE MA tytułu: jedno pole w sekcji nie potrzebuje nagłówka,
            bo nagłówek i etykieta nazywałyby tę samą rzecz dwa razy („Miejsce skoków"
            nad „Lotnisko skoków"). Tak samo zbudowany jest czas meldowania na kroku 1.
            Tytuł wraca przy parze kodów, gdzie ma co spinać: „Start" i „Lądowanie". */}
        <Card title={shape === 'pair' ? 'Trasa' : undefined} header="inline">
          <View style={{ gap: theme.spacing.sm }}>
            {/* Bez podpowiedzi „Skoki startują i lądują na tym samym lotnisku": etykieta
                „Lotnisko skoków" i JEDNO pole w sekcji mówią to samo kształtem formularza.
                Zdanie tłumaczyło pilotowi jego własną robotę. */}
            <Field label={shape === 'single' ? 'Lotnisko skoków' : 'Start'}>
              <ValueBox
                value={draft.departureIcao}
                placeholder="Wybierz lotnisko"
                {...airfieldValueProps(draft.departureIcao)}
                actionIcon="search"
                accessibilityLabel={`Lotnisko startu ${draft.departureIcao || 'nie wybrane'} - zmień`}
                onPress={() => setPicker('departure')}
              />
            </Field>

            {shape === 'pair' && (
              <Field label="Lądowanie">
                <ValueBox
                  value={draft.arrivalIcao}
                  placeholder="Wybierz lotnisko"
                  {...airfieldValueProps(draft.arrivalIcao)}
                  actionIcon="search"
                  accessibilityLabel={`Lotnisko lądowania ${draft.arrivalIcao || 'nie wybrane'} - zmień`}
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
          {/* Ma sens wyłącznie przy skokach - ten sam predykat, którym domena bramkuje
              przycisk zrzutu w kokpicie (issue #19), więc pole i akcja nie mają jak
              się rozjechać. Ustawiony tu skład staje się wartością startową KAŻDEGO
              załadunku bez własnej deklaracji, także po tym, jak zrzut skonsumował
              poprzedni (`boardingInitialJumpers`) - nie edytuje się go po fakcie:
              korekty idą przez zdarzenia załadunku i zrzutu, które już są poprawialne. */}
          {isJumpOperation(draft.operation) && (
            <Field label="Domyślny skład skoczków" tag={{ label: 'opcjonalne' }}>
              <ValueBox
                variant="text"
                value={draft.jumperDefaults != null ? jumperDefaultsLabel(draft.jumperDefaults) : ''}
                placeholder="Bez ustawionego składu"
                actionIcon="edit"
                accessibilityLabel={`Domyślny skład skoczków ${jumperDefaultsLabel(draft.jumperDefaults)} - zmień`}
                onPress={() => setJumperSheetOpen(true)}
              />
            </Field>
          )}

          <Field label="Oznaczenie klienta" tag={{ label: 'opcjonalne' }}>
            <ValueBox
              variant="text"
              value={draft.client ?? ''}
              placeholder="Bez oznaczenia"
              actionIcon="edit"
              accessibilityLabel={`Oznaczenie klienta ${draft.client ?? 'puste'} - zmień`}
              onPress={() => openEditor('client')}
            />
          </Field>

          <Field label="Notatka" tag={{ label: 'opcjonalne' }}>
            <ValueBox
              variant="text"
              value={draft.notes ?? ''}
              placeholder="Bez notatki"
              actionIcon="edit"
              accessibilityLabel={`Notatka ${draft.notes ?? 'pusta'} - zmień`}
              onPress={() => openEditor('notes')}
            />
          </Field>
        </Card>
      </View>

      {/* ── arkusz wyboru lotniska ──────────────────────────────────────────
          Jeden arkusz na oba pola - różni je tytuł i to, dokąd wraca wynik. */}
      <AirfieldSheet
        visible={picker != null}
        title={
          picker === 'arrival'
            ? 'Lotnisko lądowania'
            : shape === 'single'
              ? 'Lotnisko skoków'
              : 'Lotnisko startu'
        }
        currentIcao={picker === 'arrival' ? draft.arrivalIcao : draft.departureIcao}
        position={position}
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
        title="Notatka"
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

      {/* ── arkusz domyślnego składu skoczków ────────────────────────────── */}
      <JumperDefaultsSheet
        visible={jumperSheetOpen}
        initialJumpers={draft.jumperDefaults}
        onConfirm={(jumpers) => {
          draft.set('jumperDefaults', normalizeJumperDefaults(jumpers));
          setJumperSheetOpen(false);
        }}
        onCancel={() => setJumperSheetOpen(false)}
      />
    </Screen>
  );
}
