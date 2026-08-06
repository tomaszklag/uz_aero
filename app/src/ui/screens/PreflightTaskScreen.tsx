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
 * RODZAJ OPERACJI WYZNACZA TRASĘ (issue #13). Skoki wracają tam, skąd wystartowały,
 * więc pytamy o JEDNO lotnisko — do tej pory formularz kazał wpisać ten sam kod dwa razy
 * i pozwalał opisać dzień skoków trasą „EPKK → EPWA", której nie da się polecieć.
 * Pozostałe operacje (przelot, egzamin, lot techniczny, inne) mogą skończyć gdzie indziej
 * i zostają przy parze kodów. O tym, która operacja jest którym kształtem, orzeka domena
 * (`isSameFieldOperation`) — ten sam predykat uzbraja bramkę lądowania w kokpicie, więc
 * formularz i detekcja nie mogą się rozjechać.
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AirfieldSuggestions,
  AppText,
  Banner,
  Card,
  OptionGrid,
  Screen,
  ScreenHeader,
  SyncChip,
  TextField,
  type GridOption,
} from '../components';
import { useTheme } from '../theme';
import { useEduBanner, useSessionStore } from '../store';
import { useTaskMemory } from '../store/taskMemory';
import { usePreflightDraft } from '../store/preflightDraft';
import { airfieldRow, routeConfirmations, routeSuggestions } from './logic/routeSuggestions';
import { operationLabel } from './logic/operations';
import { isSameFieldOperation, OPERATION_TYPES } from '../../domain';
import type { OperationType } from '../../domain';

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

  // Katalog lotnisk jest wkompilowany w aplikację, więc podpowiedzi liczą się LOKALNIE
  // i przy każdej literze — bez sieci, bez opóźnienia, bez stanu ładowania.
  const { departureIcao, arrivalIcao } = draft;
  const suggestions = useMemo(
    () => routeSuggestions({ departureIcao, arrivalIcao }, { shape }),
    [departureIcao, arrivalIcao, shape],
  );
  const confirmations = useMemo(
    () => routeConfirmations({ departureIcao, arrivalIcao }, { shape }),
    [departureIcao, arrivalIcao, shape],
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

        {/* ── trasa ───────────────────────────────────────────────────────── */}
        <Card title={shape === 'single' ? 'Miejsce skoków' : 'Trasa'} header="inline">
          <View style={{ gap: theme.spacing.sm }}>
            {shape === 'single' ? (
              /* Jedno pole na pełną szerokość — pilot wpisuje plac, z którego dziś lata.
                 `arrivalIcao` idzie za nim w szkicu (`withRouteShape`), więc rejestr
                 i arkusz dostają dokładnie to, co dotąd. */
              <TextField
                label="Lotnisko ICAO"
                hint="Skoki startują i lądują na tym samym lotnisku"
                mono
                maxLength={4}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="EPKK"
                value={draft.departureIcao}
                onChangeText={(v) => draft.set('departureIcao', v.toUpperCase())}
              />
            ) : (
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
            )}

            {/* Potwierdzenie kodu, który katalog rozpoznaje — pilot widzi, że EPWA to
                faktycznie Warszawa, ZANIM pojedzie dalej z literówką. Kod spoza katalogu
                (przelot za granicę) po prostu milczy: to nie jest błąd. */}
            {confirmations.map((row) => (
              <AppText key={row.field} variant="mono" tone="muted" style={styles.confirm}>
                {row.text}
              </AppText>
            ))}

            {suggestions != null && (
              <AirfieldSuggestions
                label={suggestions.label}
                rows={suggestions.airfields.map(airfieldRow)}
                onPick={(icao) =>
                  draft.set(
                    suggestions.field === 'departure' ? 'departureIcao' : 'arrivalIcao',
                    icao,
                  )
                }
              />
            )}
          </View>
        </Card>

        {/* ── opcjonalne ──────────────────────────────────────────────────── */}
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  confirm: { fontSize: 9, letterSpacing: 0.5 },
});
