/**
 * UZ Aero — panel: katalog typów zdarzeń MUSI być tym, co zna domena.
 *
 * `screens/day/eventTypes.ts` trzyma `Record<EventType, …>`, więc KOMPLET kodów wymusza
 * kompilator — panelowi wolno importować z `@uzaero/domain` wyłącznie typy, nie wartości
 * (`docs/architektura-panelu-frontend.md` §5.1), więc runtime'owej tablicy `EVENT_TYPES`
 * nie ma jak wziąć. Ale kompilator pilnuje wyłącznie ZBIORU kluczy: nie widzi ich
 * KOLEJNOŚCI, a `EVENT_TYPE_LIST` buduje z niej chipy filtra rejestru — i to ta lista
 * jedzie do serwera jako `?type=`.
 *
 * Ten plik czyta katalog domeny z DYSKU (tak samo jak `adminActions.mirror.test.ts`
 * czyta katalog serwera) i porównuje go z listą, którą zna panel. Bez tego dopisanie
 * czternastego typu zdarzenia objawiłoby się dopiero wtedy, gdy ktoś by go szukał
 * chipem — a chip filtruje coś, czego nie ma, po cichu.
 *
 * Kierunek jest obustronny celowo: typ dopisany w domenie zostawiłby chip bez pozycji,
 * a typ obecny tylko w panelu obiecywałby filtr, który trasa odrzuci czterysetką.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EVENT_TYPE_LIST, eventTypeView, isKnownEventType } from '../src/screens/events/eventCatalog';

const CATALOG = join(__dirname, '..', '..', 'packages', 'domain', 'src', 'events', 'events.ts');

/**
 * Wyciągamy literały z tablicy `EVENT_TYPES`, a nie wszystkie napisy w pliku: docblocki
 * i definicje payloadów wymieniają te same nazwy, więc skan całej treści dawałby
 * fałszywe trafienia.
 */
function domainEventTypes(): string[] {
  const source = readFileSync(CATALOG, 'utf8');
  const block = /export const EVENT_TYPES: readonly EventType\[\] = \[([\s\S]*?)\];/.exec(source);
  if (block == null) {
    throw new Error('Nie znaleziono tablicy EVENT_TYPES — zmienił się kształt pliku domeny');
  }
  return [...block[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

describe('katalog typów zdarzeń: panel ↔ domena', () => {
  it('kontrola testu: skaner faktycznie czyta katalog domeny', () => {
    // Bez tego porównanie niżej przechodziłoby na pustych listach, gdyby regex przestał
    // cokolwiek łapać albo plik zmienił nazwę.
    const types = domainEventTypes();
    expect(types.length).toBeGreaterThan(10);
    expect(types).toContain('session_claim');
    expect(types).toContain('event_correction');
  });

  it('lista chipów ma DOKŁADNIE te same kody, w tej samej kolejności', () => {
    // Kolejność to kolejność dnia lotnego — dokładnie tak, jak chipy stoją w mockupie
    // `A04`; alfabetyczna byłaby uprzejmością, która gubi znaczenie.
    expect(EVENT_TYPE_LIST).toEqual(domainEventTypes());
  });

  it('każdy typ katalogu ma plakietkę, a kod spoza katalogu jedzie DOSŁOWNIE', () => {
    for (const type of domainEventTypes()) {
      const view = eventTypeView(type);
      expect(view.known, type).toBe(true);
      expect(view.code, type).toBe(type);
    }

    // Rejestr POKAZUJE typy spoza katalogu (kolumna `events.type` nie ma `CHECK`-a),
    // choć FILTROWAĆ po nich nie wolno — dwa różne pytania, dwie różne odpowiedzi.
    const unknown = eventTypeView('jakis_nowy_typ');
    expect(unknown.known).toBe(false);
    expect(unknown.code).toBe('jakis_nowy_typ');
    expect(isKnownEventType('jakis_nowy_typ')).toBe(false);
  });

  it('klucz z `Object.prototype` NIE jest znanym typem', () => {
    // `EVENT_META['toString']` nie jest `undefined`, tylko funkcją z prototypu —
    // zwykły odczyt uznałby `?typ=toString` za znany kod i wysłał go do serwera.
    for (const key of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(isKnownEventType(key), key).toBe(false);
    }
  });
});
