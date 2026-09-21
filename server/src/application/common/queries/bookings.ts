/**
 * Ninerdeck (serwer) - OKNO KALENDARZA ZAJĘTOŚCI (milestone 3.0.0, issue #158 B5/B6;
 * `docs/rezerwacje.md` §5, §6).
 *
 * W `common/`, bo o to samo pyta kalendarz w aplikacji pilota i moduł kalendarza
 * w panelu. Różnią się WIDOKIEM (telefon: jeden dzień × flota, panel: maszyny × dni),
 * a nie danymi - dwa zapytania dałyby dwie prawdy o tej samej sobocie.
 *
 * ══ DLACZEGO ODPOWIEDŹ NIESIE GRANICE DÓB ══
 * Siatka ma się rysować w strefie KLUBU (§6), a telefon nie ma jak odtworzyć reguł
 * czasu letniego - nie używa `Intl` ani żadnej biblioteki stref. Dostaje więc doby
 * jako pary chwil UTC i liczy z nich wszystko odejmowaniem: położenie rezerwacji na
 * osi, podpis godziny, chwilę z godziny wpisanej w formularzu. Pełne uzasadnienie
 * i dlaczego to lepsze niż offset per doba: `domain/clubTime.ts`.
 */

import {
  airfieldByIcao,
  flightDayWindow,
  suggestSlots,
  type SlotSuggestion,
} from '@ninerdeck/domain';

import { clubDays, safeZone, type ClubDay } from '../../../domain/clubTime.ts';
import type {
  BookingRecord,
  Clock,
  BookingsPort,
  ClubSettingsPort,
  Database,
} from '../ports.ts';

export interface CalendarView {
  /** Strefa klubu - NAPIS do wyświetlenia („czas klubu"), nie materiał do rachunku. */
  timezone: string;
  /** Lotnisko macierzyste - z niego liczy się doba lotna (§7.1). `null` = brak ustawienia. */
  homeIcao: string | null;
  days: ClubDay[];
  bookings: BookingRecord[];
  /** Słaby ETag - zmienia się wtedy i tylko wtedy, gdy zmieniło się cokolwiek w oknie. */
  etag: string;
}

/**
 * Sufit okna. Kalendarz telefonu pokazuje dzień, panel tydzień albo miesiąc - dwa
 * miesiące są z zapasem, a bez sufitu adres zamawiałby sobie dekadę wierszy.
 */
export const MAX_WINDOW_DAYS = 62;

/** Jedna zajętość z dobą, w której stoi - odpowiedź `GET /bookings/:id`. */
export interface BookingDetailView {
  timezone: string;
  booking: BookingRecord;
  day: ClubDay;
}

/** Sugestie dla JEDNEJ maszyny w JEDNEJ dobie - razem z oknem, z którego wyszły. */
export interface SuggestionsView {
  /** Doba, o którą pytano, w strefie klubu. */
  day: ClubDay;
  /**
   * Okno doby lotnej i to, skąd wzięły się jego granice. Ekran ma umieć napisać
   * „doba lotna 04:02-21:31" przy oknie liczonym z efemeryd i przemilczeć to przy
   * domyślnym - inaczej sugestia w klubie bez lotniska macierzystego wyglądałaby
   * na wynik rachunku, którego nie było.
   */
  window: { from: number; to: number; basis: 'solar' | 'default' };
  suggestions: SlotSuggestion[];
}

export class BookingQueries {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingsPort,
    private readonly clubs: ClubSettingsPort,
    /**
     * Zegar z portu, nie `Date.now()`: sugestie odcinają sloty, które już się
     * zaczęły, więc chwila bieżąca jest WEJŚCIEM tego rachunku - a wejście liczone
     * z zegara systemowego jest niesprawdzalne testem.
     */
    private readonly clock: Clock,
  ) {}

  /**
   * JEDNA zajętość razem z dobą, w której stoi.
   *
   * Doba jedzie z odpowiedzią, bo karta rezerwacji pisze godziny CZASEM KLUBU
   * (§6), a telefon liczy je odejmowaniem od granic doby - bez nich musiałby znać
   * strefę, czyli dokładnie to, czego kontrakt kalendarza mu oszczędza.
   *
   * `null` znaczy „nie ma jej w tym klubie" i trasa robi z tego 404 - cudza
   * rezerwacja jest dla tego tokenu NIEISTNIEJĄCA (epik C wielofirmowości).
   */
  async byId(orgId: string, id: string): Promise<BookingDetailView | null> {
    const settings = await this.clubs.calendar(this.db, orgId);
    if (settings == null) return null;

    const row = await this.bookings.byId(this.db, orgId, id);
    if (row == null) return null;

    const timezone = safeZone(settings.timezone);
    // Doba SAMEJ zajętości. Okno ma MILISEKUNDĘ szerokości i to nie jest sztuczka:
    // `clubDays` oddaje doby PRZECIĘTE oknem, a okno zerowej szerokości nie przecina
    // żadnej. Pytamy więc o najwęższe, które zawiera początek rezerwacji - wychodzi
    // z tego dokładnie jedna doba.
    const days = clubDays(timezone, row.startsAt, row.startsAt + 1, 1);
    const day = days[0];
    if (day == null) return null;

    return { timezone, booking: row, day };
  }

  /** `null`, gdy klubu nie ma - trasa robi z tego 404, a nie pustej siatki. */
  async window(
    orgId: string,
    from: number,
    to: number,
    aircraftId?: string,
  ): Promise<CalendarView | null> {
    const settings = await this.clubs.calendar(this.db, orgId);
    if (settings == null) return null;

    const timezone = safeZone(settings.timezone);
    const days = clubDays(timezone, from, to, MAX_WINDOW_DAYS);
    // Okno przycięte do dób, które naprawdę oddajemy - inaczej sufit obcinałby siatkę,
    // a lista rezerwacji sięgałaby dalej i telefon miałby wiersze bez dnia.
    const last = days[days.length - 1];
    const span = { from: days[0]?.startsAt ?? from, to: last?.endsAt ?? to };

    const rows = await this.bookings.list(this.db, orgId, {
      from: span.from,
      to: span.to,
      aircraftId,
    });
    const changed = await this.bookings.latestChangeAt(this.db, orgId);

    return {
      timezone,
      homeIcao: settings.homeIcao,
      days,
      bookings: rows,
      // Liczba wierszy wchodzi do znacznika, bo sam stempel ostatniej zmiany nie widzi
      // rezerwacji USUNIĘTEJ z okna przez przesunięcie na inny dzień: `updated_at`
      // rośnie wtedy w klubie, ale gdyby zmiana wyszła poza okno, znacznik zostałby ten
      // sam przy innej treści. Klub i okno też - ten sam telefon pyta o kilka dni.
      etag: `W/"${orgId}:${span.from}-${span.to}:${aircraftId ?? '*'}:${changed ?? 0}:${rows.length}"`,
    };
  }

  /**
   * Sugestie slotów dla maszyny w danej dobie (§7). `null` = klubu nie ma.
   *
   * ══ TEN SAM KOD LICZY TO NA TELEFONIE ══
   * `suggestSlots` mieszka w `@ninerdeck/domain`, więc aplikacja policzy sugestie
   * OFFLINE z cache\u2019owanych zajętości i dostanie tę samą odpowiedź. Trasa istnieje
   * dla telefonu, który akurat ma sieć, i dla panelu - a nie dlatego, że serwer ma
   * tu jakąś wiedzę, której aplikacja nie ma.
   *
   * Wyłączenia z użytku liczą się jak każda inna zajętość: maszyna w serwisie nie
   * lata i sugestii z tego dnia być nie może.
   */
  async suggestions(
    orgId: string,
    aircraftId: string,
    dayAt: number,
    durationMs: number,
    opts: { preferredAt?: number | null } = {},
  ): Promise<SuggestionsView | null> {
    const settings = await this.clubs.calendar(this.db, orgId);
    if (settings == null) return null;

    const timezone = safeZone(settings.timezone);
    const day = clubDays(timezone, dayAt, dayAt + 1)[0];
    if (day == null) return null;

    // Lotnisko macierzyste podaje się KODEM, a współrzędne przychodzą z katalogu -
    // klub nie wpisuje szerokości i długości, bo nie ma po co.
    const home = airfieldByIcao(settings.homeIcao);
    const window = flightDayWindow(day, home == null ? null : { lat: home.lat, lon: home.lon });

    // Zajętości CAŁEJ doby, nie samego okna: rezerwacja zaczęta przed świtem nadal
    // zajmuje maszynę o dziewiątej.
    const busy = await this.bookings.list(this.db, orgId, {
      from: day.startsAt,
      to: day.endsAt,
      aircraftId,
    });

    return {
      day,
      window,
      suggestions: suggestSlots({
        window,
        busy,
        duration: durationMs,
        preferredAt: opts.preferredAt ?? null,
        now: this.clock.now().getTime(),
      }),
    };
  }
}
