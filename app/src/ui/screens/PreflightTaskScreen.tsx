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
 * pól wyłącza ją do końca preflightu (`taskTouched` w szkicu).
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AirfieldSuggestions,
  AppText,
  Card,
  InlineNote,
  OptionGrid,
  Screen,
  ScreenHeader,
  SyncChip,
  TextField,
  type GridOption,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useTaskMemory } from '../store/taskMemory';
import { usePreflightDraft } from '../store/preflightDraft';
import { airfieldRow, routeConfirmations, routeSuggestions } from './logic/routeSuggestions';
import type { OperationType } from '../../domain';

/** Siatka operacji — etykiety i ikony jak w `.op-grid` mockupu 02. */
const OPERATIONS: GridOption<OperationType>[] = [
  { value: 'skoki', label: 'Skoki', icon: 'op-skoki' },
  { value: 'ferry', label: 'Ferry', icon: 'op-ferry' },
  { value: 'egzamin', label: 'Egzamin', icon: 'op-egzamin' },
  { value: 'techniczny', label: 'Lot tech.', icon: 'op-techniczny' },
  { value: 'inne', label: 'Inne', icon: 'op-inne' },
];

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

  const suggested = memory.ready && !draft.taskTouched && (memory.task != null || memory.route != null);

  // Katalog lotnisk jest wkompilowany w aplikację, więc podpowiedzi liczą się LOKALNIE
  // i przy każdej literze — bez sieci, bez opóźnienia, bez stanu ładowania.
  const { departureIcao, arrivalIcao } = draft;
  const suggestions = useMemo(
    () => routeSuggestions({ departureIcao, arrivalIcao }),
    [departureIcao, arrivalIcao],
  );
  const confirmations = useMemo(
    () => routeConfirmations({ departureIcao, arrivalIcao }),
    [departureIcao, arrivalIcao],
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
        {/* ── skąd te wartości ─────────────────────────────────────────────
            Adnotacja, nie pytanie: pilot ma wiedzieć, że patrzy na podpowiedź,
            i że wystarczy ją zmienić, żeby przestała obowiązywać. */}
        {suggested && (
          <InlineNote
            icon="info"
            tone="blue"
            text={
              'Uzupełnione z Twojego ostatniego dnia (trasa — z ostatniego dnia na tym samolocie).\n' +
              'Zmień, jeśli dziś lecisz inaczej — wpis zastępuje podpowiedź.'
            }
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
        <Card title="Trasa" header="inline">
          <View style={{ gap: theme.spacing.sm }}>
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

            {/* Potwierdzenie kodu, który katalog rozpoznaje — pilot widzi, że EPWA to
                faktycznie Warszawa, ZANIM pojedzie dalej z literówką. Kod spoza katalogu
                (ferry za granicę) po prostu milczy: to nie jest błąd. */}
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
