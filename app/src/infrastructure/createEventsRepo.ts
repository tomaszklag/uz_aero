/**
 * UZ Aero — composition root warstwy danych.
 *
 * Tu (i tylko tu) produkcyjne implementacje portów spotykają się z aplikacją:
 * `defaultClock` jako `ClockPort`, `uuidv4` jako `IdPort`. Warstwa aplikacji tego nie robi,
 * bo import infrastruktury w aplikacji odwróciłby kierunek zależności — a zamiast reguły
 * na papierze mielibyśmy „przecież tylko jeden mały import".
 *
 * Testy wołają `new EventsRepo(adapter, { clock: new FixedClock(…), generateId: … })`
 * wprost i tej funkcji nie potrzebują.
 */

import { EventsRepo, type EventsRepoOptions, type StoragePort } from '../application';
import { defaultClock } from './clock';
import { uuidv4 } from './id';

/** Buduje repozytorium z produkcyjnym zegarem i generatorem UUID (można nadpisać). */
export function createEventsRepo(
  storage: StoragePort,
  options: Partial<EventsRepoOptions> = {},
): EventsRepo {
  return new EventsRepo(storage, {
    clock: options.clock ?? defaultClock,
    generateId: options.generateId ?? uuidv4,
  });
}
