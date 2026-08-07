/**
 * UZ Aero — panel: OŚ ZDARZEŃ DNIA, DTO → wiersze (moduł CZYSTY).
 *
 * ══ TRZY REGUŁY, KTÓRE TEN PLIK MUSI UTRZYMAĆ ══
 *
 *  1. **Panel NIE PRZESORTOWUJE osi.** Porządek chronologiczny nadaje serwer
 *     (`application/admin/mappers/eventTimeline.ts`: sort po czasie zdarzenia, GPS
 *     przed zegarem telefonu, sort stabilny). Wcześniej kolejność brała się z bazy,
 *     czyli z `received_at`, który dla CAŁEJ paczki jest identyczny — dzień wysłany
 *     jednym rzutem po locie bez zasięgu wracał w kolejności losowej. To zostało
 *     naprawione PO STRONIE SERWERA i drugie sortowanie tutaj tylko ukryłoby regres,
 *     gdyby tamto się zepsuło.
 *  2. **Zdarzenie unieważnione jest PRZEKREŚLONE, nie ukryte.** Rejestr jest
 *     append-only i to właśnie te wiersze tłumaczą, dlaczego liczby dnia różnią się od
 *     tego, co zapisał telefon. Same korekty zostają na osi jako zwykłe wpisy — poprawia
 *     się fakt, nie poprawkę.
 *  3. **`voided` i `correctedTime` przychodzą Z SERWERA.** Reguła „gdy jedno zdarzenie
 *     ma kilka korekt, wygrywa ostatnia" (razem z przypadkiem `void` → `retime`, który
 *     przywraca zdarzenie do życia) mieszka w domenie i ma tam mieć JEDNĄ implementację.
 *     Panel czyta adnotacje, nie odtwarza ich z payloadów.
 *
 * Czas w kolumnie to czas ZAPISANY w rejestrze, także przy zdarzeniu poprawionym —
 * bo to po nim serwer ułożył oś, a kolumna niezgodna z porządkiem wiersza byłaby
 * mylniejsza niż brak informacji. Czas po korekcie stoi w opisie, obok powodu.
 */

import type { Event } from '@uzaero/domain';
import { formatLatLon, litres, motoHours, plural, timeUtcSeconds } from '@uzaero/format';

import type { TimelineEntryDto } from '../../api/dto';
import type { PillTone } from '../../ui/components/Pill';
import type { TimelineTone } from '../../ui/components/TimelineRow';
import { EVENT_META } from './eventTypes';

export interface TimelineRowView {
  uuid: string;
  /** „08:14:09" UTC — sekundy mają znaczenie w rejestrze (patrz `timeUtcSeconds`). */
  time: string;
  dot: TimelineTone;
  /** Nazwa zdarzenia = jego TYP z rejestru, ten sam napis co w SQL-u i w mockupie. */
  name: string;
  badge: string;
  badgeTone: PillTone;
  /** Opis w liniach — każda renderowana jako TEKST, nigdy jako HTML. */
  meta: string[];
  voided: boolean;
  /**
   * Czy z tego wiersza wolno wejść w korektę (`A02b`). Zależy WYŁĄCZNIE od typu
   * zdarzenia (`EVENT_META.correctable`), nie od jego stanu: ponowna korekta zdarzenia
   * już unieważnionego jest legalna — „ostatnia wygrywa", a `retime` po `void` wraca
   * zdarzenie do życia. Ukrycie przejścia przy przekreślonym wierszu odebrałoby
   * administratorowi jedyną drogę wycofania cudzej pomyłki.
   */
  correctable: boolean;
  /**
   * Czy przy TYM zdarzeniu jest co pokazać w dzienniku audytu.
   *
   * **To NIE jest to samo, co „zdarzenie zostało ruszone korektą"** — i ta różnica jest
   * całym powodem, dla którego pole istnieje. `event_correction` emitują dwie
   * powierzchnie: administrator z panelu (przez `AuditedWrite`, czyli z wierszem
   * w `admin_audit`) i pilot w oknie 24 h (przez `POST /events`, z pominięciem tej
   * bramy — bez żadnego śladu w dzienniku). Zdarzenie unieważnione przez pilota jest
   * przypadkiem NORMALNYM; administracyjna korekta jest z definicji wyjątkiem. Link
   * oparty na samym `voided` prowadziłby więc do pustej listy właśnie w typowej
   * sytuacji, a link do pustki jest gorszy od jego braku.
   *
   * Rozróżnia je serwer (`TimelineEntryDto.adminCorrected`, z `events.source_device`) —
   * z osi zdarzeń nie da się tego wyliczyć.
   */
  audited: boolean;
}

/** Czas zdarzenia w tej samej konwencji, co domena: GPS przed zegarem telefonu. */
const at = (event: Event): number => event.gpsTime ?? event.deviceTime;

const yesNo = (value: string | null | undefined, fallback = '—'): string => value ?? fallback;

/** „51°23.4'N 021°12.8'E · dokł. 5 m" — pozycja w zapisie lotniczym (patrz raport). */
function position(pos: { lat: number; lon: number; accuracyM?: number; groundSpeedKt?: number; altitudeFt?: number } | null | undefined): string | null {
  if (pos == null) return null;
  const parts = [`GPS ${formatLatLon(pos.lat, pos.lon)}`];
  if (pos.groundSpeedKt != null) parts.push(`GS ${pos.groundSpeedKt} kt`);
  if (pos.altitudeFt != null) parts.push(`alt. ${pos.altitudeFt} ft`);
  if (pos.accuracyM != null) parts.push(`dokł. ${pos.accuracyM} m`);
  return parts.join(' · ');
}

/**
 * Payload zdarzenia → linie opisu.
 *
 * `switch` po `event.type` zawęża unię, więc kompilator zna dokładny kształt
 * `payload` i nie ma tu ani jednego rzutowania. Dopisanie typu zdarzenia w domenie
 * zostawi go z pustym opisem, a nie wywali — dlatego kompletności katalogu pilnuje
 * `EVENT_META` (`Record<EventType, …>`), a nie ten `switch`.
 */
function describe(event: Event): string[] {
  switch (event.type) {
    case 'session_claim': {
      const mode = { free: 'samolot był wolny', takeover_online: 'przejęcie online', takeover_offline: 'przejęcie offline (dane z cache)' }[
        event.payload.mode
      ];
      return [
        `tryb: ${event.payload.mode} — ${mode}`,
        `poprzedni PIC: ${yesNo(event.payload.previousPicId, 'brak')}`,
      ];
    }

    case 'preflight_confirm': {
      const p = event.payload;
      const lines = [
        // Klamra służby jest opcjonalna od schemaVersion 2 (§3.6a) — zdarzenia
        // z przejęcia po 2026-08-06 jej nie niosą. Brak deklaracji to informacja,
        // nie luka: administrator ma widzieć „nie zadeklarowano", a nie pustkę.
        `operacja: ${p.operation} · ${yesNo(p.departureIcao, '?')} → ${yesNo(p.arrivalIcao, '?')} · meldunek ${p.dutyStart != null ? timeUtcSeconds(p.dutyStart) : 'nie zadeklarowano'}`,
        `odczyt: FOB ${litres(p.reading.fuelL)} · MH ${motoHours(p.reading.mh, p.mhFormat ?? null)}`,
      ];
      if (p.client != null) lines.push(`klient: ${p.client}`);
      for (const c of p.corrections ?? []) {
        // Korekta odczytu z preflightu jest LOGIEM, nie nadpisaniem — pokazujemy oba
        // końce i powód, bo to jedyny ślad po tym, że podpowiedź serwera była zła.
        lines.push(`korekta odczytu: ${c.field} ${c.from} → ${c.to} — „${c.reason}"`);
      }
      return lines;
    }

    case 'engine_start': {
      const lines = [position(event.payload.position)].filter((l) => l != null);
      if (event.payload.fieldElevationFt != null) {
        lines.push(`elewacja lotniska: ${event.payload.fieldElevationFt} ft (baza detekcji startu i lądowania)`);
      }
      return lines;
    }

    case 'engine_stop':
      return [position(event.payload.position)].filter((l) => l != null);

    case 'taxi':
      return [
        `metoda: ${event.payload.method}`,
        position(event.payload.position),
        'nie wpływa na czas blokowy ani na czas lotu — wpis opisowy',
      ].filter((l) => l != null);

    case 'takeoff':
    case 'landing':
      return [`metoda: ${event.payload.method}`, position(event.payload.position)].filter(
        (l) => l != null,
      );

    case 'drop': {
      const p = event.payload;
      const total = p.jumpers.tandem + p.jumpers.aff + p.jumpers.solo;
      const lines = [
        `wyniesienie ${p.dropNumber} · wysokość ${p.altitudeFt == null ? 'brak (bez fixa GPS)' : `${p.altitudeFt} ft`}`,
        `skoczkowie: ${p.jumpers.tandem} tandem · ${p.jumpers.aff} aff · ${p.jumpers.solo} solo = ${total}`,
      ];
      if (p.client != null) lines.push(`klient: ${p.client}`);
      const pos = position(p.position);
      if (pos != null) lines.push(pos);
      return lines;
    }

    case 'refuel': {
      const p = event.payload;
      const lines = [
        `przed ${litres(p.beforeL)} · dolano ${litres(p.addedL)} · po ${litres(p.afterL)}`,
      ];
      if (p.consumptionLPerH != null) {
        lines.push(`zużycie od poprzedniego punktu kontrolnego: ${p.consumptionLPerH} L/h`);
      }
      return lines;
    }

    case 'crew_change':
      return [
        `rola: ${event.payload.role}`,
        `schodzi ${yesNo(event.payload.pilotOutId, 'nikt')} · wchodzi ${yesNo(event.payload.pilotInId, 'nikt')}`,
        'PIC bez zmian — sesję pisze jedno urządzenie (single-writer)',
      ];

    case 'manual_log_entry': {
      const p = event.payload;
      const lines = [
        `takeoff ${timeUtcSeconds(p.takeoff ?? null)} · landing ${timeUtcSeconds(p.landing ?? null)}`,
        `off block ${timeUtcSeconds(p.offBlock ?? null)} · on block ${timeUtcSeconds(p.onBlock ?? null)}`,
      ];
      if (p.notes != null && p.notes !== '') lines.push(`uwagi: „${p.notes}"`);
      lines.push('wpis retro: niesie czasy sprzed zapisu — oś sortuje po czasie zdarzenia, nie zapisu');
      return lines;
    }

    case 'day_close': {
      const p = event.payload;
      return [
        `odczyt końcowy (przekazanie): FOB ${litres(p.finalReading.fuelL)} · MH ${p.finalReading.mh}`,
        `koniec służby: ${p.dutyEnd != null ? timeUtcSeconds(p.dutyEnd) : 'nie zadeklarowano'}`,
        // Nazwa typu jest historyczna: od 2026-08-06 to ZDANIE SAMOLOTU, nie koniec
        // dnia pilota — służba liczy się dalej, a kolejna maszyna wchodzi do tej samej
        // doby (§3.6). Okno korekty kotwiczy się dziś we wzlocie, nie tutaj (§3.6a).
        'zdanie samolotu — koniec pracy z tą maszyną, nie koniec służby pilota',
      ];
    }

    case 'leg_close': {
      const p = event.payload;
      const lines = [
        `wzlot ${p.legIndex} potwierdzony przez pilota`,
        p.reading != null
          ? `odczyt: FOB ${litres(p.reading.fuelL)} · MH ${p.reading.mh}`
          : 'bez odczytu liczników (opcjonalny — §3.6)',
      ];
      if (p.notes != null && p.notes !== '') lines.push(`uwagi: „${p.notes}"`);
      lines.push('od tego zdarzenia liczy się okno korekty TEGO wzlotu');
      return lines;
    }

    case 'event_correction': {
      const p = event.payload;
      const head = `action: ${p.action} · targetUuid: ${p.targetUuid}`;
      const detail =
        p.action === 'retime'
          ? `nowy czas zdarzenia: ${timeUtcSeconds(p.newTime)} UTC`
          : 'zdarzenia NIE BYŁO — wyłączone z projekcji, zostaje w rejestrze';
      return [
        head,
        detail,
        'korekta jest zdarzeniem jak każde inne — dopisuje się do rejestru, niczego nie nadpisuje',
      ];
    }
  }
}

/**
 * Wpis osi → wiersz. W TEJ SAMEJ KOLEJNOŚCI, w jakiej przyszedł (patrz nagłówek pliku).
 *
 * Adnotacje serwera dokładamy jako PIERWSZE linie opisu, bo to one tłumaczą, dlaczego
 * wiersz wygląda inaczej niż sąsiednie — a przy zdarzeniu przekreślonym są jedyną
 * odpowiedzią na pytanie „to dlaczego to tu jest".
 */
export function timelineRows(entries: readonly TimelineEntryDto[]): TimelineRowView[] {
  return entries.map((entry) => {
    const meta = EVENT_META[entry.event.type];
    const notes: string[] = [];

    if (entry.voided) {
      notes.push(
        'UNIEWAŻNIONE korektą — wiersz zostaje w rejestrze na zawsze i nie wchodzi do wyliczeń',
      );
    }
    if (entry.correctedTime != null) {
      notes.push(
        `czas po korekcie: ${timeUtcSeconds(entry.correctedTime)} UTC — projekcja liczy dzień z tą wartością, ` +
          `zapisany czas zdarzenia (${timeUtcSeconds(at(entry.event))}) zostaje nietknięty`,
      );
    }

    return {
      uuid: entry.event.uuid,
      time: timeUtcSeconds(at(entry.event)),
      dot: entry.voided ? 'dim' : meta.dot,
      name: entry.event.type,
      badge: entry.voided ? 'void' : meta.badge,
      badgeTone: entry.voided ? 'red' : meta.badgeTone,
      meta: [...notes, ...describe(entry.event)],
      voided: entry.voided,
      correctable: meta.correctable,
      // Ślad w dzienniku zostaje WYŁĄCZNIE po korekcie administratora — patrz docblock
      // pola. `voided` mówi o skutku, nie o tym, kto go wywołał.
      audited: entry.adminCorrected,
    };
  });
}

/**
 * Podpis nad osią: ile zdarzeń i ile z nich to korekty.
 *
 * Liczymy z TEGO, co przyszło na osi — a nie z `state.eventCount`, bo projekcja liczy
 * strumień EFEKTYWNY (bez unieważnionych i bez samych korekt), więc obie liczby są
 * poprawne i mówią o czym innym. Mockup `A02a` pyta o rejestr („84 zdarzenia, w tym
 * 1 korekta"), więc odpowiadamy o rejestrze.
 */
export function timelineSummary(entries: readonly TimelineEntryDto[]): string {
  const corrections = entries.filter((e) => e.event.type === 'event_correction').length;
  const voided = entries.filter((e) => e.voided).length;

  const head = `${entries.length} ${plural(entries.length, 'zdarzenie', 'zdarzenia', 'zdarzeń')}`;
  const tail: string[] = [];
  if (corrections > 0) {
    tail.push(`${corrections} ${plural(corrections, 'korekta', 'korekty', 'korekt')}`);
  }
  if (voided > 0) {
    tail.push(`${voided} ${plural(voided, 'unieważnione', 'unieważnione', 'unieważnionych')}`);
  }
  return tail.length === 0 ? head : `${head}, w tym ${tail.join(' i ')}`;
}
