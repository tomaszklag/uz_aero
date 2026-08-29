/**
 * UZ Aero - nakładanie korekt na strumień zdarzeń (tryb edycji sesji, model §5.1).
 *
 * Rejestr jest append-only: korekta to osobne zdarzenie `event_correction`, oryginał
 * zostaje. Ten moduł zamienia strumień SUROWY na strumień EFEKTYWNY - taki, jakby
 * zdarzenia od początku miały poprawione czasy i wartości, a unieważnione nie zaszły.
 *
 * Wszyscy konsumenci (projekcja sesji, log dnia, statystyki) przechodzą przez tę jedną
 * funkcję - dzięki temu nie istnieje miejsce, w którym widać „stare" czasy, poza samym
 * rejestrem, który celowo pamięta wszystko.
 *
 * Gdy jedno zdarzenie ma kilka korekt, WYGRYWA OSTATNIA (po czasie zapisu korekty):
 * pilot poprawił się drugi raz - i to jest jego aktualna wersja. Działa to też dla pary
 * `void` → `retime`: ponowna zmiana czasu przywraca zdarzenie do życia, bo skoro pilot
 * podaje mu nowy czas, to uznaje, że jednak zaszło. Ta sama zasada obejmuje `amend`
 * (issue #43): kto poprawia WARTOŚĆ zdarzenia, uznaje je za zaszłe.
 *
 * ══ „OSTATNIA WYGRYWA" DZIAŁA PER WYMIAR, NIE PER ZDARZENIE ══
 * Czas i wartości to dwa **niezależne** wymiary tej samej poprawki, więc składamy je
 * osobno: `retime` nie kasuje wcześniejszego `amend`, a `amend` nie cofa poprawionego
 * czasu. Inaczej pilot, który poprawił skład zrzutu, a potem jego godzinę, po cichu
 * traciłby pierwszą poprawkę - a nie ma jak się o tym dowiedzieć, bo obie widzi na
 * jednej liście historii.
 * W obrębie samych wartości „ostatnia wygrywa" liczy się **per pole**: druga korekta
 * paliwa nie rusza poprawionych wcześniej motogodzin.
 *
 * ══ KOREKTA NIECZYTELNA JEST POMIJANA, A NIE WYWRACA STRUMIENIA ══
 * Typ `EventCorrectionPayload` jest obietnicą WEJŚCIA (`POST /events` waliduje kształt
 * zodem), a nie faktem odczytu: kolumna `events.payload` to `JSONB` bez `CHECK`-a, więc
 * do strumienia trafia też wiersz wpisany ręcznie w psql, odtworzony ze zrzutu albo
 * przysłany przez starszą wersję telefonu. Taki wiersz nie ma prawa zabrać widoku
 * WSZYSTKIM pozostałym - a zabierał: `payload` równy JSON-owemu `null` dawał
 * `TypeError` przy sięgnięciu po `targetUuid`, czyli 500 z całego rejestru zdarzeń,
 * i to bez możliwości obejścia filtrem (wiersz wchodzi na każdą stronę w swoim zakresie).
 *
 * Pomijamy więc korektę, która NIE ADRESUJE celu (`targetUuid` inne niż napis) i taką,
 * której akcji nie znamy. To drugie jest równie ważne: gałąź „wszystko, co nie jest
 * `void`" traktowała po cichu KAŻDĄ nieznaną akcję jak `retime` i brała z niej
 * `newTime` - czyli podejmowała decyzję za kształt, którego nie rozumie. Nieznana
 * akcja może w przyszłej wersji znaczyć cokolwiek; jedyna uczciwa odpowiedź brzmi
 * „nie wiem, więc nie ruszam zdarzenia".
 */

import type { EpochMillis } from '../time';
import type { CorrectionFields, Event, EventOf, JumperCounts } from '../events/events';

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): EpochMillis => e.gpsTime ?? e.deviceTime;

/** Korekta CZYTELNA - adresuje cel i niesie akcję, którą ta wersja domeny zna. */
type ReadableCorrection =
  | { targetUuid: string; action: 'void' }
  | { targetUuid: string; action: 'retime'; newTime: EpochMillis }
  | { targetUuid: string; action: 'amend'; fields: CorrectionFields };

/** Skład zrzutu z surowego JSON-a - albo `null`/`undefined`, gdy nie da się go przeczytać. */
function readJumpers(value: unknown): JumperCounts | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object') return undefined;
  const j = value as { tandem?: unknown; aff?: unknown; solo?: unknown };
  if (typeof j.tandem !== 'number' || typeof j.aff !== 'number' || typeof j.solo !== 'number') {
    return undefined;
  }
  return { tandem: j.tandem, aff: j.aff, solo: j.solo };
}

/**
 * Pola `amend` z surowego payloadu - wyłącznie te z BIAŁEJ LISTY i wyłącznie o właściwym
 * kształcie. `undefined` znaczy „nie ma czego nałożyć": pusta poprawka jest nieczytelna
 * tak samo jak nieznana akcja i z tego samego powodu (patrz `readCorrection`).
 */
function readFields(value: unknown): CorrectionFields | undefined {
  if (value == null || typeof value !== 'object') return undefined;
  const raw = value as {
    fuelL?: unknown;
    mh?: unknown;
    oilL?: unknown;
    oilAddedL?: unknown;
    jumpers?: unknown;
    notes?: unknown;
    dualId?: unknown;
  };
  const fields: CorrectionFields = {};
  if (typeof raw.fuelL === 'number') fields.fuelL = raw.fuelL;
  if (typeof raw.mh === 'number') fields.mh = raw.mh;
  // `oilL: null` = „pomiaru nie było" (kasowanie omyłkowego wpisu) - wartość, nie brak.
  if (raw.oilL === null) fields.oilL = null;
  else if (typeof raw.oilL === 'number') fields.oilL = raw.oilL;
  if (raw.oilAddedL === null) fields.oilAddedL = null;
  else if (typeof raw.oilAddedL === 'number') fields.oilAddedL = raw.oilAddedL;
  // `dualId: null` to deklaracja „sesja jednoosobowa", więc jest wartością.
  if (raw.dualId === null) fields.dualId = null;
  else if (typeof raw.dualId === 'string') fields.dualId = raw.dualId;
  if ('jumpers' in raw) {
    const jumpers = readJumpers(raw.jumpers);
    if (jumpers !== undefined || raw.jumpers === null) fields.jumpers = jumpers ?? null;
  }
  // `notes: null` to KASOWANIE notatki, więc jest wartością, nie brakiem pola.
  if (raw.notes === null) fields.notes = null;
  else if (typeof raw.notes === 'string') fields.notes = raw.notes;
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/**
 * `payload` korekty → korekta czytelna albo `null`.
 *
 * Kształt wejścia opisujemy `unknown`-ami, a nie `EventCorrectionPayload`, bo to jest
 * dokładnie ta różnica, o którą chodzi: typ mówi, co OBIECAŁO wejście, a ta funkcja
 * czyta, co FAKTYCZNIE leży w bazie. `retime` bez liczbowego `newTime` też jest
 * nieczytelny - wpisałby zdarzeniu `gpsTime`, którego nikt nie podał. Tak samo `amend`
 * bez ani jednego rozpoznanego pola: nie wiadomo, co miałby zmienić.
 */
function readCorrection(correction: EventOf<'event_correction'>): ReadableCorrection | null {
  const payload = correction.payload as
    | { targetUuid?: unknown; action?: unknown; newTime?: unknown; fields?: unknown }
    | null
    | undefined;

  const targetUuid = payload?.targetUuid;
  if (typeof targetUuid !== 'string') return null;

  if (payload?.action === 'void') return { targetUuid, action: 'void' };
  if (payload?.action === 'retime' && typeof payload.newTime === 'number') {
    return { targetUuid, action: 'retime', newTime: payload.newTime };
  }
  if (payload?.action === 'amend') {
    const fields = readFields(payload.fields);
    if (fields != null) return { targetUuid, action: 'amend', fields };
  }
  return null;
}

/**
 * Nakłada pola `amend` na payload celu (issue #43).
 *
 * Mapowanie pole → miejsce w payloadzie mieszka TUTAJ, a nie w komendzie ani w UI:
 * `applyCorrections` jest jedynym przejściem dla wszystkich konsumentów strumienia,
 * więc korekta wpisana raz działa też w analityce zużycia, w arkuszu i w panelu.
 *
 * Pole nieadekwatne do typu celu jest pomijane - reguła `CORRECTION_FIELD_NOT_ALLOWED`
 * odrzuca takie korekty przy zapisie, ale odczyt bazy nie może na tym polegać (§ ta sama
 * zasada, co przy nieznanej akcji: „nie wiem, więc nie ruszam zdarzenia").
 */
function amend(event: Event, fields: CorrectionFields): Event {
  switch (event.type) {
    case 'preflight_confirm': {
      const reading = {
        fuelL: fields.fuelL ?? event.payload.reading.fuelL,
        mh: fields.mh ?? event.payload.reading.mh,
      };
      return {
        ...event,
        payload: {
          ...event.payload,
          reading,
          ...('oilL' in fields ? { oilL: fields.oilL ?? null } : {}),
          ...('oilAddedL' in fields ? { oilAddedL: fields.oilAddedL ?? null } : {}),
          ...('notes' in fields ? { notes: fields.notes ?? null } : {}),
          ...('dualId' in fields ? { dualId: fields.dualId ?? null } : {}),
        },
      };
    }

    case 'manual_log_entry': {
      if (!('notes' in fields)) return event;
      return { ...event, payload: { ...event.payload, notes: fields.notes ?? null } };
    }
    case 'day_close': {
      const finalReading = {
        fuelL: fields.fuelL ?? event.payload.finalReading.fuelL,
        mh: fields.mh ?? event.payload.finalReading.mh,
      };
      return { ...event, payload: { ...event.payload, finalReading } };
    }
    case 'drop': {
      if (!('jumpers' in fields)) return event;
      return { ...event, payload: { ...event.payload, jumpers: fields.jumpers ?? null } };
    }
    default:
      return event;
  }
}

/**
 * Wynik złożenia wszystkich korekt jednego celu - dwa niezależne wymiary plus życie.
 * `newTime`/`fields` równe `null`/pustemu obiektowi znaczą „tego wymiaru nikt nie ruszył".
 */
interface EffectiveCorrection {
  voided: boolean;
  newTime: EpochMillis | null;
  fields: CorrectionFields;
}

/**
 * Strumień efektywny: bez zdarzeń `event_correction`, bez celów unieważnionych,
 * z czasami i wartościami po korekcie.
 *
 * Zmiana czasu wchodzi w `gpsTime` - to pole „kiedy naprawdę zaszło" (§5.1); `deviceTime`
 * zostaje nietknięty jako ślad chwili pierwotnego zapisu. Zwracamy nowe obiekty, strumień
 * wejściowy jest nienaruszalny jak sam rejestr.
 */
export function applyCorrections(events: readonly Event[]): Event[] {
  // Korekty w porządku ZAPISU (nie wstawienia do bazy), żeby „ostatnia wygrywa" znaczyło
  // wszędzie to samo. Składamy je w stan per cel, bo czas i wartości są niezależne.
  const corrections = events
    .filter((e): e is EventOf<'event_correction'> => e.type === 'event_correction')
    .sort((a, b) => at(a) - at(b));

  const effective = new Map<string, EffectiveCorrection>();
  for (const correction of corrections) {
    // Nieczytelna korekta wypada TUTAJ, a nie przy nakładaniu - dzięki temu poprzednia,
    // czytelna korekta tego samego celu dalej obowiązuje. „Ostatnia wygrywa" znaczy
    // „ostatnia, którą da się przeczytać", a nie „ostatnia, która skasuje poprzednią".
    const readable = readCorrection(correction);
    if (readable == null) continue;

    const state = effective.get(readable.targetUuid) ?? {
      voided: false,
      newTime: null,
      fields: {},
    };
    if (readable.action === 'void') {
      state.voided = true;
    } else {
      // Poprawianie czegokolwiek w zdarzeniu = uznanie, że jednak zaszło.
      state.voided = false;
      if (readable.action === 'retime') state.newTime = readable.newTime;
      else state.fields = { ...state.fields, ...readable.fields };
    }
    effective.set(readable.targetUuid, state);
  }

  const out: Event[] = [];
  for (const event of events) {
    if (event.type === 'event_correction') continue;

    const correction = effective.get(event.uuid);
    if (correction == null) {
      out.push(event);
      continue;
    }
    // Unieważnione = nie zaszło. Wiersz zostaje w rejestrze, znika z wyliczeń.
    if (correction.voided) continue;

    let result: Event = event;
    if (Object.keys(correction.fields).length > 0) result = amend(result, correction.fields);
    if (correction.newTime != null) result = { ...result, gpsTime: correction.newTime };
    out.push(result);
  }
  return out;
}

/** Wpis indeksu celów korekty: co to za zdarzenie i KIEDY zaszło. */
export interface IndexedEvent {
  type: Event['type'];
  /**
   * Czas zdarzenia (GPS → fallback zegar telefonu), z SUROWEGO strumienia.
   *
   * Potrzebny regułom, żeby ustalić, DO KTÓREGO WZLOTU należy korygowane zdarzenie -
   * od tego zależy, czy okno 24 h tego wzlotu jeszcze trwa (§3.6a: każdy wzlot ma
   * własne okno). Bez czasu reguła musiałaby pytać o okno zagregowane, czyli pozwalać
   * poprawiać wzlot wygasły, dopóki jakikolwiek inny jest otwarty.
   */
  at: EpochMillis;
}

/**
 * Indeks zdarzeń KORYGOWALNYCH: uuid → typ i czas. Buduje go projekcja, a reguły
 * używają do walidacji celu korekty - `checkAppend` dostaje stan, nie surowy strumień.
 *
 * Obejmuje też zdarzenia już unieważnione: ponowna korekta unieważnionego jest legalna
 * (patrz „ostatnia wygrywa" wyżej). Nie obejmuje samych korekt - poprawia się fakt,
 * nie poprawkę; kolejna korekta celu po prostu zastępuje poprzednią.
 */
export function buildEventIndex(events: readonly Event[]): Record<string, IndexedEvent> {
  const index: Record<string, IndexedEvent> = {};
  for (const event of events) {
    if (event.type === 'event_correction') continue;
    index[event.uuid] = { type: event.type, at: event.gpsTime ?? event.deviceTime };
  }
  return index;
}
