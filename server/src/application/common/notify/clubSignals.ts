/**
 * Ninerdeck (serwer) - SYGNAŁY ZMIAN KLUBU: kalendarz, samolot, dziennik, „Do sprawdzenia"
 * (4.0.0, `docs/kanal-klubu.md` §4; epik Z-E #246).
 *
 * Wołane PO commicie, obok budzika, i nigdy nie rzucają: kanał nie jest źródłem prawdy
 * (K2), więc zgubiony sygnał kosztuje najwyżej odświeżenie o jedno wejście później.
 * Sygnał nie niesie treści - kształt per widz liczy REST, a ekran tylko wie, że ma
 * przeczytać jeszcze raz.
 *
 * ══ KTO DOSTAJE CO (§4) ══
 *  - `booking:<id>` i `calendar:<doba klubu>` - CAŁY KLUB: kalendarz widzi każdy członek,
 *    a nowa rezerwacja nie ma jeszcze identyfikatora, który ktokolwiek by znał - stąd doba;
 *  - `aircraft:<id>` - posiadacze `fleet.watch` (karta samolotu i lista obserwowanych);
 *  - `session:<uuid>`, `log:<doba UTC>`, `attention` - posiadacze `panel.access`
 *    (dziennik i „Do sprawdzenia" są modułami podglądu klubu).
 *
 * Producent podaje FAKT (który termin, która operacja), a tematy i odbiorców liczy ta
 * klasa - reguła „kto dostaje co" ma jedno miejsce, tak jak w `OrderSignals`.
 */

import { clubDays, safeZone } from '../../../domain/clubTime.ts';
import { topic } from '../live/topics.ts';
import type {
  ClubSettingsPort,
  Database,
  LiveAudience,
  LiveSignalsPort,
  SessionsProjectionPort,
} from '../ports.ts';

/** Termin na osi kalendarza - czas i maszyna. */
export interface TermSpan {
  aircraftId: string;
  startsAt: number;
  endsAt: number;
}

/** Rezerwacja, wyłączenie z użytku albo rezerwacja zlecenia. */
export interface BookingSpan extends TermSpan {
  id: string;
}

/** Zmiana terminu: stan PO zapisie i - przy przesunięciu albo zmianie maszyny - stan SPRZED. */
export interface BookingChange {
  now: BookingSpan;
  before?: TermSpan | null;
}

const CLUB: LiveAudience = { kind: 'club' };
const WATCHERS: LiveAudience = { kind: 'capability', capability: 'fleet.watch' };
const REVIEWERS: LiveAudience = { kind: 'capability', capability: 'panel.access' };

/**
 * Najwięcej dób kalendarza w jednym sygnale - dwa miesiące. Telefon pokazuje dwa tygodnie,
 * panel tydzień, więc dłuższe wyłączenie z użytku odświeża wszystko, co ktokolwiek ogląda;
 * dalsze doby czyta się przy wejściu, jak dziś.
 */
const CALENDAR_DAYS_MAX = 62;

export class ClubSignals {
  constructor(
    private readonly live: LiveSignalsPort,
    private readonly db: Database,
    private readonly clubs: ClubSettingsPort,
    private readonly sessions: SessionsProjectionPort,
  ) {}

  /** Termin powstał, zmienił się albo zamknął. `before` = termin i maszyna sprzed zmiany. */
  booking(orgId: string, now: BookingSpan, before?: TermSpan | null): Promise<void> {
    return this.bookings(orgId, [{ now, before }]);
  }

  /**
   * Kilka terminów jednym sygnałem (zmiana ścieżki zgód, zadanie okresowe). Przesunięcie
   * odświeża OBIE doby, a zmiana maszyny - OBIE karty samolotu: stara straciła termin,
   * nowa go zyskała.
   */
  async bookings(orgId: string, changes: readonly BookingChange[]): Promise<void> {
    if (changes.length === 0) return;
    try {
      // Doba klubu liczy się strefą klubu - tą samą, którą rysuje siatka kalendarza.
      const zone = safeZone((await this.clubs.calendar(this.db, orgId))?.timezone);
      const club = new Set<string>();
      const aircraft = new Set<string>();
      for (const { now, before } of changes) {
        club.add(topic.booking(now.id));
        for (const span of before == null ? [now] : [now, before]) {
          for (const day of clubDays(zone, span.startsAt, span.endsAt, CALENDAR_DAYS_MAX)) {
            club.add(topic.calendar(day.date));
          }
          aircraft.add(topic.aircraft(span.aircraftId));
        }
      }
      this.live.changed(orgId, [...club], [CLUB]);
      this.live.changed(orgId, [...aircraft], [WATCHERS]);
    } catch (err) {
      console.error('sygnał kanału o terminie nie wyszedł:', err);
    }
  }

  /**
   * Operacje zmienione jednym zapisem (przyjęcie lotu, korekta, dopisanie, zakończenie
   * i unieważnienie z panelu, rozstrzygnięty rozjazd). Dobę dziennika i maszynę czyta
   * z projekcji PO commicie - producent podaje same identyfikatory.
   */
  async operations(orgId: string, sessionUuids: readonly string[]): Promise<void> {
    if (sessionUuids.length === 0) return;
    try {
      const log = new Set<string>();
      const aircraft = new Set<string>();
      for (const uuid of new Set(sessionUuids)) {
        log.add(topic.session(uuid));
        const row = await this.sessions.get(this.db, orgId, uuid);
        if (row == null) continue;
        if (row.claimTime != null) log.add(topic.log(new Date(row.claimTime).toISOString().slice(0, 10)));
        aircraft.add(topic.aircraft(row.aircraftId));
      }
      this.live.changed(orgId, [...log], [REVIEWERS]);
      if (aircraft.size > 0) this.live.changed(orgId, [...aircraft], [WATCHERS]);
    } catch (err) {
      console.error('sygnał kanału o operacji nie wyszedł:', err);
    }
  }

  /** Stan maszyny poza operacjami i terminami: odczyt z panelu, konfiguracja floty. */
  aircraft(orgId: string, aircraftIds: readonly string[]): void {
    this.safely(() => this.live.changed(orgId, [...new Set(aircraftIds)].map(topic.aircraft), [WATCHERS]));
  }

  /** „Do sprawdzenia": rozjazd powstał albo zamknięty, karta dnia zmieniła stan. */
  attention(orgId: string): void {
    this.safely(() => this.live.changed(orgId, [topic.attention], [REVIEWERS]));
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error('sygnał kanału nie wyszedł:', err);
    }
  }
}
