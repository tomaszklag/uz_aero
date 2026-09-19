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

import { clubDays, safeZone, type ClubDay } from '../../../domain/clubTime.ts';
import type {
  BookingRecord,
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

export class BookingQueries {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingsPort,
    private readonly clubs: ClubSettingsPort,
  ) {}

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
}
