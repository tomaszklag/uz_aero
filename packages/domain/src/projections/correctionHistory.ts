/**
 * UZ Aero — HISTORIA ZMIAN jednego zdarzenia (issue #43, mockup `design/10i`).
 *
 * ══ DLACZEGO TO W OGÓLE JEST MOŻLIWE ══
 * Bo rejestr jest append-only. Korekta nie edytuje celu — dopisuje `event_correction`,
 * a oryginał zostaje w strumieniu. Historia zmian nie jest więc osobnym dziennikiem,
 * który trzeba prowadzić (i który dałoby się rozjechać z danymi), tylko ODCZYTEM tego,
 * co i tak leży w rejestrze. Ten moduł go czyta i zamienia na listę „było → jest".
 *
 * ══ DLACZEGO W DOMENIE, A NIE W EKRANIE ══
 * Bo pytają o nią DWIE powierzchnie: arkusz historii w aplikacji pilota i oś zdarzeń
 * w panelu administratora. Liczone dwa razy rozjechałyby się przy pierwszej zmianie
 * reguły składania (a ta jest nieoczywista — patrz „per wymiar" niżej).
 *
 * ══ SKŁADANIE „BYŁO → JEST" ══
 * Wartość „przed" bierze się z poprzedniego stanu, nie z oryginału: druga korekta czasu
 * odnosi się do pierwszej poprawionej godziny, a nie do odczytu GPS. Dlatego przewijamy
 * korekty chronologicznie, trzymając bieżący stan każdego wymiaru osobno — dokładnie tak,
 * jak robi to `applyCorrections`, i z tego samego powodu: czas i wartości są niezależne
 * (`retime` po `amend` nie cofa poprawionej liczby).
 *
 * Wpisy NIECZYTELNE pomijamy tak samo jak tam. Historia ma opisywać to, co faktycznie
 * policzyła projekcja — inaczej pilot czytałby o zmianie, której nigdzie nie widać.
 */

import type { EpochMillis } from '../time';
import type { CorrectionFields, Event, EventOf, JumperCounts } from '../events/events';

/** Który wymiar zdarzenia zmieniła poprawka. */
export type CorrectionField =
  | 'time'
  | 'fuelL'
  | 'mh'
  | 'oilL'
  | 'oilAddedL'
  | 'jumpers'
  | 'notes'
  | 'dualId';

/**
 * Wartość pola w historii — czas i liczby jako `number`, skład zrzutu jako trójka,
 * notatka jako napis. `null` znaczy „nie było czego zastąpić" albo „skasowano".
 */
export type CorrectionValue = number | string | JumperCounts | null;

/** Jedna zmiana JEDNEGO pola. Korekta wielopolowa (`amend`) daje kilka wpisów. */
export interface CorrectionHistoryEntry {
  /** UUID zdarzenia korygującego — kilka wpisów może dzielić jeden uuid. */
  correctionUuid: string;
  /** Kiedy zapisano poprawkę (nie: kiedy zaszło korygowane zdarzenie). */
  at: EpochMillis;
  /** Kto zapisał — `picId` z korekty. Korektę administratora stempluje PIC sesji (§4.4). */
  byPilotId: string;
  /**
   * Czy poprawkę naniósł administrator w panelu.
   *
   * Czytamy to z `payload.source`, bo z nagłówka NIE DA SIĘ: korekta administratora
   * niesie `picId` pilota sesji (single-writer). Brak pola = pilot — telefon nie
   * stempluje własnych poprawek.
   */
  byAdmin: boolean;
  /** `null` dla `void`/`unvoid`, bo tam nie zmienia się wartość, tylko sam fakt. */
  field: CorrectionField | null;
  /** Stan przed tą poprawką; `null`, gdy pola wcześniej nie było. */
  from: CorrectionValue;
  /** Stan po tej poprawce. */
  to: CorrectionValue;
  /** `void` = „tego nie było"; `unvoid` = kolejna poprawka przywróciła zdarzenie. */
  kind: 'retime' | 'amend' | 'void' | 'unvoid';
  /** Powód podany przez autora (opcjonalny, issue #43). */
  reason: string | null;
}

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): EpochMillis => e.gpsTime ?? e.deviceTime;

/** Wartość pola w zdarzeniu ŹRÓDŁOWYM — punkt startowy łańcucha „było → jest". */
function originalValue(target: Event, field: CorrectionField): CorrectionValue {
  if (field === 'time') return at(target);
  if (field === 'jumpers') return target.type === 'drop' ? (target.payload.jumpers ?? null) : null;
  if (field === 'notes') {
    if (target.type === 'preflight_confirm' || target.type === 'manual_log_entry') {
      return target.payload.notes ?? null;
    }
    return null;
  }
  if (field === 'dualId') {
    // Bez deklaracji w payloadzie obowiązywał NAGŁÓWEK — i to on jest wartością
    // „przed", bo to jego widział pilot na ekranie przed poprawką.
    if (target.type !== 'preflight_confirm') return null;
    return target.payload.dualId !== undefined ? target.payload.dualId : target.dualId;
  }
  // Olej (issue #60): brak pola w zapisie pierwotnym = „pomiaru/dolewki nie było" — null.
  if (field === 'oilL') {
    return target.type === 'preflight_confirm' ? (target.payload.oilL ?? null) : null;
  }
  if (field === 'oilAddedL') {
    return target.type === 'preflight_confirm' ? (target.payload.oilAddedL ?? null) : null;
  }

  const reading =
    target.type === 'preflight_confirm'
      ? target.payload.reading
      : target.type === 'day_close'
        ? target.payload.finalReading
        : null;
  if (reading == null) return null;
  return field === 'fuelL' ? reading.fuelL : reading.mh;
}

/** Pola `amend` w kolejności, w jakiej mają stanąć w historii (paliwo przed licznikiem, olej za nim). */
const AMEND_FIELDS: readonly Exclude<CorrectionField, 'time'>[] = [
  'fuelL',
  'mh',
  'oilL',
  'oilAddedL',
  'jumpers',
  'notes',
  'dualId',
];

/**
 * Pola, w których `null` jest WARTOŚCIĄ (skład niepodany, notatka skasowana, sesja
 * jednoosobowa, pomiar/dolewka oleju wycofane) — obecność liczy się po samym kluczu.
 */
const NULL_IS_VALUE: ReadonlySet<Exclude<CorrectionField, 'time'>> = new Set([
  'jumpers',
  'notes',
  'dualId',
  'oilL',
  'oilAddedL',
]);

/** Czy payload niesie to pole — dla pól z `NULL_IS_VALUE` rozstrzyga sam klucz. */
function hasField(fields: CorrectionFields, field: Exclude<CorrectionField, 'time'>): boolean {
  if (!(field in fields)) return false;
  if (NULL_IS_VALUE.has(field)) return true;
  return fields[field] !== undefined;
}

function fieldValue(
  fields: CorrectionFields,
  field: Exclude<CorrectionField, 'time'>,
): CorrectionValue {
  if (field === 'jumpers') return fields.jumpers ?? null;
  if (field === 'notes') return fields.notes ?? null;
  if (field === 'dualId') return fields.dualId ?? null;
  return fields[field] ?? null;
}

/**
 * Historia poprawek jednego zdarzenia — od NAJSTARSZEJ do najnowszej.
 *
 * Kolejność jest chronologiczna, bo taka wychodzi ze składania „było → jest"; ekran
 * odwraca ją u siebie (mockup `10i` pokazuje najnowszą na górze, żeby stan aktualny
 * czytało się bez przewijania). Odwracanie tutaj zmusiłoby panel do drugiego odwrócenia.
 *
 * Pusta tablica = zdarzenia nikt nie ruszał. Zapis pierwotny NIE JEST wpisem tej listy:
 * jest w samym zdarzeniu i ekran pokazuje go jako kotwicę pod listą.
 */
export function correctionHistory(
  events: readonly Event[],
  targetUuid: string,
): CorrectionHistoryEntry[] {
  const target = events.find((e) => e.uuid === targetUuid);
  if (target == null || target.type === 'event_correction') return [];

  const corrections = events
    .filter((e): e is EventOf<'event_correction'> => e.type === 'event_correction')
    .filter((e) => (e.payload as { targetUuid?: unknown })?.targetUuid === targetUuid)
    .sort((a, b) => at(a) - at(b));

  // Bieżący stan każdego wymiaru — zaczynamy od wartości ze zdarzenia źródłowego.
  const current = new Map<CorrectionField, CorrectionValue>();
  const valueOf = (field: CorrectionField): CorrectionValue =>
    current.has(field) ? (current.get(field) as CorrectionValue) : originalValue(target, field);

  let voided = false;
  const out: CorrectionHistoryEntry[] = [];

  for (const correction of corrections) {
    const payload = correction.payload as {
      action?: unknown;
      newTime?: unknown;
      fields?: unknown;
      reason?: unknown;
      source?: unknown;
    } | null;
    const reason = typeof payload?.reason === 'string' && payload.reason !== '' ? payload.reason : null;
    const base = {
      correctionUuid: correction.uuid,
      at: at(correction),
      byPilotId: correction.picId,
      byAdmin: payload?.source === 'admin',
      reason,
    };

    if (payload?.action === 'void') {
      // Powtórzone unieważnienie nie jest zmianą — nic się po nim nie dzieje inaczej.
      if (voided) continue;
      voided = true;
      out.push({ ...base, field: null, from: null, to: null, kind: 'void' });
      continue;
    }

    const entriesBefore = out.length;

    if (payload?.action === 'retime' && typeof payload.newTime === 'number') {
      const from = valueOf('time');
      current.set('time', payload.newTime);
      out.push({ ...base, field: 'time', from, to: payload.newTime, kind: 'retime' });
    }

    if (payload?.action === 'amend' && payload.fields != null && typeof payload.fields === 'object') {
      const fields = payload.fields as CorrectionFields;
      for (const field of AMEND_FIELDS) {
        if (!hasField(fields, field)) continue;
        const from = valueOf(field);
        const to = fieldValue(fields, field);
        current.set(field, to);
        out.push({ ...base, field, from, to, kind: 'amend' });
      }
    }

    // Poprawka czegokolwiek przywraca zdarzenie do życia (`applyCorrections`) — i to jest
    // osobny fakt w historii, nie skutek uboczny wiersza o zmianie wartości.
    if (voided && out.length > entriesBefore) {
      voided = false;
      out.splice(entriesBefore, 0, {
        ...base,
        field: null,
        from: null,
        to: null,
        kind: 'unvoid',
      });
    }
  }

  return out;
}
