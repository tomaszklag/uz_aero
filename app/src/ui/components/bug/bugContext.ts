/**
 * UZ Aero - KONTEKST ZGŁOSZENIA BŁĘDU (issue #87): „im więcej informacji tym lepiej".
 *
 * Moduł CZYSTY - bez Reacta, bez React Native, bez store'ów. Wszystko, czego potrzebuje,
 * dostaje w argumencie, więc da się go przetestować bez telefonu; fakty o urządzeniu
 * zbiera obok `deviceRelease.ts`, a stan aplikacji podaje sam arkusz.
 *
 * ══ DWA WYJŚCIA Z JEDNEGO WEJŚCIA ══
 * `context` jedzie na serwer, `rows` widzi pilot w arkuszu. Muszą powstawać RAZEM,
 * bo obietnica „dołączamy automatycznie" jest wiążąca: lista pokazana przed tapnięciem
 * ma opisywać to, co naprawdę pojedzie. Dwie funkcje obok siebie rozjechałyby się przy
 * pierwszym nowym polu i nikt by tego nie zauważył.
 *
 * ══ CZEGO NIE DOŁĄCZAMY ══
 * Zrzutu ekranu - wymaga modułu natywnego, a projekt ich unika (ta sama reguła, przez
 * którą mapa śladu ma własny renderer). Zamiast obrazka jedzie STAN: z niego da się
 * odtworzyć ekran, z obrazka nie da się odtworzyć danych.
 */

import { dateTimeUtc, timeUtc } from '@uzaero/format';

import type { EpochMillis } from '../../../domain';

/**
 * Gdzie stał pilot: trasa nawigacji + tytuł arkusza, jeśli któryś był otwarty.
 *
 * Trasa, a nie tytuł ekranu: tytuł bywa zmienny (nagłówek ekranu 10 to SYGNATURA
 * operacji), a przy zgłoszeniu potrzebna jest nazwa MIEJSCA, po której da się je
 * znaleźć w kodzie. Ludzki napis dokłada `ROUTE_LABELS` niżej.
 */
export interface BugPlace {
  route: string | null;
  sheet: string | null;
}

/** Wydanie i urządzenie - zbiera `deviceRelease.ts`, bo to jedyne pytanie do RN. */
export interface BugRelease {
  appVersion: string | null;
  platform: string;
  osVersion: string | null;
  deviceModel: string | null;
  /** Wersja lokalnego schematu bazy - odróżnia telefon po aktualizacji od sprzed niej. */
  schemaVersion: number;
}

/**
 * Stan łączności - ten sam trójstan, co wskaźnik `SyncChip`. Bez niego „nie zapisało
 * się" jest nie do odróżnienia od „nie wysłało się", a to są dwa różne błędy.
 */
export interface BugSyncSnapshot {
  state: 'synced' | 'offline' | 'blocked';
  outboxCount: number;
  lastSyncAt: EpochMillis | null;
  lastAttemptAt: EpochMillis | null;
}

/** Operacja z LOKALNEGO rejestru - więc dostępna także bez zasięgu (§6 pkt 1). */
export interface BugOperation {
  sessionUuid: string | null;
  /** Sygnatura (issue #68); `null`, dopóki operacja nie ma numeru. */
  signature: string | null;
  aircraftId: string | null;
  aircraftReg: string | null;
  /** Nazwa zadania po polsku („SKOKI") - `operationLabel`, nie surowa wartość. */
  operation: string | null;
  engineRunning: boolean;
  flights: number;
  closed: boolean;
}

export interface BugPilot {
  id: string;
  code: string | null;
  name: string | null;
}

export interface BugContextInput {
  place: BugPlace;
  release: BugRelease;
  sync: BugSyncSnapshot;
  operation: BugOperation;
  pilot: BugPilot;
  /** Nazwa motywu (`night` / `solar`) - część opisu tego, co pilot widział. */
  theme: string;
  /** Chwila zgłoszenia z zegara telefonu. */
  at: EpochMillis;
}

export interface BugContextRow {
  label: string;
  value: string;
}

export interface BugContextView {
  /** Etykieta miejsca - kolumna listy w panelu i pierwszy wiersz arkusza. */
  screen: string;
  sessionUuid: string | null;
  /** To, co jedzie na serwer. Nieprzezroczyste dla wysyłki i dla bazy. */
  context: Record<string, unknown>;
  /** To, co pilot widzi PRZED tapnięciem - dokładnie te same fakty. */
  rows: BugContextRow[];
}

/**
 * Trasa nawigacji → napis, który coś znaczy dla człowieka.
 *
 * Numery ekranów są W NAWIASIE, bo tak nazywa je cała dokumentacja i mockupy - a to
 * po nich szuka się miejsca w `design/`. Trasa spoza tej mapy jedzie własną nazwą:
 * nowy ekran ma być widoczny jako `ManualFlightPart2`, a nie ukryty pod „nieznany".
 */
export const ROUTE_LABELS: Record<string, string> = {
  MyDay: 'MÓJ DZIEŃ (01)',
  History: 'POPRZEDNIE DNI (12)',
  Cockpit: 'KOKPIT (04/05)',
  CockpitReadonly: 'PODGLĄD MASZYNY (04B)',
  PreflightAircraft: 'NOWY LOT · SAMOLOT (02)',
  PreflightTask: 'NOWY LOT · ZADANIE (02E)',
  PreflightReadings: 'NOWY LOT · LICZNIKI (02A)',
  Refuel: 'TANKOWANIE (06)',
  CrewChange: 'ZMIANA ZAŁOGI (07)',
  ManualFlight: 'WPIS RĘCZNY (15)',
  ReleaseAircraft: 'ZDAJ SAMOLOT (09B)',
  Stats: 'OPERACJA (10)',
  Track: 'ŚLAD OPERACJI (14)',
  Settings: 'USTAWIENIA (13)',
};

export const routeLabel = (route: string | null): string =>
  route == null ? 'NIEZNANY EKRAN' : (ROUTE_LABELS[route] ?? route);

/**
 * „OPERACJA (10) · arkusz KOREKTA ODCZYTU".
 *
 * Arkusz dokleja się do ekranu, zamiast go zastępować: zgłoszenie z arkusza dotyczy
 * OBU warstw naraz, a sam tytuł arkusza („KOREKTA ODCZYTU") występuje w kilku miejscach
 * aplikacji i bez ekranu pod spodem nie mówi, w którym z nich pilot stał.
 */
export function bugPlaceLabel(place: BugPlace): string {
  const screen = routeLabel(place.route);
  return place.sheet == null || place.sheet.trim() === ''
    ? screen
    : `${screen} · arkusz ${place.sheet.trim()}`;
}

/** „kolejka 3 · ostatnia 09:38 UTC" - jedna linia o stanie wysyłki. */
function syncLine(sync: BugSyncSnapshot): string {
  const queue = `kolejka ${sync.outboxCount}`;
  const last = sync.lastSyncAt == null ? 'nigdy nie wysłano' : `ostatnia ${timeUtc(sync.lastSyncAt)} UTC`;
  // Stan chipa dopisujemy TYLKO wtedy, gdy jest odchylony: „synced" przy każdym
  // zgłoszeniu byłoby napisem, który niczego nie odróżnia (reguła SyncChipa, issue #12).
  const state = sync.state === 'synced' ? null : sync.state === 'offline' ? 'offline' : 'sync stoi';
  return [state, queue, last].filter((p) => p != null).join(' · ');
}

/** „Pixel 7a · Android 14" - z tego, co RN wie bez modułu natywnego. */
function deviceLine(release: BugRelease): string {
  const os = release.osVersion == null ? release.platform : `${release.platform} ${release.osVersion}`;
  return release.deviceModel == null ? os : `${release.deviceModel} · ${os}`;
}

export function buildBugContext(input: BugContextInput): BugContextView {
  const { place, release, sync, operation, pilot, theme, at } = input;
  const screen = bugPlaceLabel(place);

  const context: Record<string, unknown> = {
    // ── miejsce ──
    route: place.route,
    sheet: place.sheet,
    screenLabel: screen,
    // ── operacja (z lokalnego rejestru, więc także offline) ──
    sessionUuid: operation.sessionUuid,
    signature: operation.signature,
    aircraftId: operation.aircraftId,
    aircraftReg: operation.aircraftReg,
    operation: operation.operation,
    engineRunning: operation.engineRunning,
    flights: operation.flights,
    sessionClosed: operation.closed,
    // ── kto ──
    pilotId: pilot.id,
    pilotCode: pilot.code,
    pilotName: pilot.name,
    // ── wydanie i urządzenie ──
    appVersion: release.appVersion,
    platform: release.platform,
    osVersion: release.osVersion,
    deviceModel: release.deviceModel,
    schemaVersion: release.schemaVersion,
    theme,
    // ── łączność ──
    syncState: sync.state,
    outboxCount: sync.outboxCount,
    lastSyncAt: sync.lastSyncAt,
    lastAttemptAt: sync.lastAttemptAt,
    // ── czas ──
    reportedAt: new Date(at).toISOString(),
    /**
     * Przesunięcie strefy telefonu w minutach. Nie po to, żeby cokolwiek przeliczać -
     * wszystko w tej aplikacji jest UTC - tylko po to, żeby zgłoszenie „godzina jest
     * o dwie za mała" dało się od razu rozpoznać jako pomyłkę strefy.
     */
    deviceTzOffsetMin: -new Date(at).getTimezoneOffset(),
  };

  const rows: BugContextRow[] = [{ label: 'Miejsce', value: screen }];

  // Wiersze operacji istnieją TYLKO z operacją: „Operacja -" byłoby wierszem o niczym
  // (ta sama reguła, którą issue #40 wyrzuciło „Notatki -").
  if (operation.sessionUuid != null) {
    rows.push({ label: 'Operacja', value: operation.signature ?? operation.sessionUuid });
    const aircraft = operation.aircraftReg ?? operation.aircraftId;
    if (aircraft != null) {
      rows.push({
        label: 'Samolot · zadanie',
        value: operation.operation == null ? aircraft : `${aircraft} · ${operation.operation}`,
      });
    }
  }

  rows.push({
    label: 'Pilot',
    value: [pilot.code ?? pilot.id, pilot.name].filter((p) => p != null && p !== '').join(' · '),
  });
  if (release.appVersion != null) rows.push({ label: 'Aplikacja', value: release.appVersion });
  rows.push({ label: 'Telefon', value: `${deviceLine(release)} · motyw ${theme.toUpperCase()}` });
  rows.push({ label: 'Synchronizacja', value: syncLine(sync) });
  rows.push({ label: 'Czas zgłoszenia', value: `${dateTimeUtc(at)} UTC` });

  return { screen, sessionUuid: operation.sessionUuid, context, rows };
}
