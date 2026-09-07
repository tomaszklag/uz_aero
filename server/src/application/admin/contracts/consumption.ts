/**
 * UZ Aero (serwer) - kontrakt analityki zużycia (`A10a`, `A10b`).
 *
 * Byty policzone przez domenę (`ConsumptionModel`, `MhModel`, `ConsumptionSummary`,
 * `FuelInterval`) jadą do panelu JAKO TYPY DOMENOWE, nie jako ich kopie - to reguła
 * granicy z `docs/architektura-panelu-serwer.md`: kopia rozjechałaby się z oryginałem
 * przy pierwszej zmianie modelu, a rozjazdu nikt by nie zauważył, bo obie strony
 * kompilowałyby się dalej.
 *
 * Ten plik dokłada wyłącznie to, czego domena nie zna: tożsamość jednostki, zakres
 * czasu i liczby opisujące, ILU dni analityka dotyczyła.
 */

import type {
  ConsumptionModel,
  ConsumptionSummary,
  FuelInterval,
  MhFormat,
  MhModel,
} from '@uzaero/domain';

import type { AdminStatsRange } from './stats.ts';

/** Jednostka, której dotyczy raport. */
export interface AdminConsumptionAircraft {
  aircraftId: string;
  reg: string;
  aircraftType: string;
  capacityL: number;
  /** Format WYŚWIETLANIA licznika - nie mówi nic o tym, jak licznik zlicza (patrz `MhModel.kind`). */
  mhFormat: MhFormat;
  serviceStatus: string;
}

/** Liczby nagłówkowe - kafle na górze ekranu. `null` = nie ma z czego policzyć. */
export interface AdminConsumptionHeadline {
  /** `Σ L / Σ h lotu` - do planowania misji. */
  litersPerFlightHour: number | null;
  /** `Σ L / Σ h pracy silnika` - ta sama definicja, co „Śr. L/h" w statystykach zakresu. */
  litersPerBlockHour: number | null;
  /** `Σ L / Σ sesji`; dla dni skokowych czyta się jako „na wyniesienie". */
  litersPerFlight: number | null;
  /**
   * `Σ ΔMH / Σ h pracy silnika` - iloraz sum z kolumn projekcji, NIE z modelu.
   * Kafel odpowiada „ile licznik przyrósł na godzinę zegara", a rozbicie tej liczby
   * na fazy jest osobnym pytaniem i osobną kartą.
   */
  mhPerBlockHour: number | null;
}

/** Ile materiału stało za raportem - i czego w nim nie ma. */
export interface AdminConsumptionBasis {
  /** Dni zamknięte, które weszły do analizy. */
  sessions: number;
  /** Dni zamknięte w oknie ŁĄCZNIE; większe od `sessions` znaczy przycięcie limitem. */
  sessionsInRange: number;
  /** Dni OTWARTE w oknie - pominięte, bo bez odczytu końcowego nie znamy ich zużycia. */
  openSessions: number;
  /**
   * Dni z projekcją sprzed kolumn statystyk (`takeoff_count IS NULL`). Ich `mh_delta_h`
   * bywa pusta, więc model motogodzin ma wtedy mniej równań - ekran mówi o tym wprost
   * i odsyła do przebudowy projekcji (`A11`), zamiast pokazywać niższą liczbę jako fakt.
   */
  staleRows: number;
  /** Pierwszy i ostatni dzień, z którego pochodzą interwały. */
  firstDay: number | null;
  lastDay: number | null;
}

/** Pełna odpowiedź `GET /admin/api/fleet/:id/consumption`. */
export interface AdminConsumptionReport {
  /** Czas serwera w chwili policzenia (ISO) - panel nie rozstrzyga, co znaczy „teraz". */
  at: string;
  range: AdminStatsRange;
  aircraft: AdminConsumptionAircraft;
  headline: AdminConsumptionHeadline;
  basis: AdminConsumptionBasis;
  /** Metryki zbiorcze: ilorazy sum, pasmo rozrzutu, trend miesięczny. */
  summary: ConsumptionSummary;
  /** Model fazowy paliwa; `published: false` = poniżej progu (ekran `A10b`). */
  fuel: ConsumptionModel;
  /** Przeliczniki motogodzin razem z rozpoznanym typem licznika. */
  mh: MhModel;
  /**
   * Interwały ze źródłami - tabela „skąd biorą się liczby". Zawiera także odrzucone
   * i odstające: to one tłumaczą, dlaczego model wygląda tak, a nie inaczej.
   */
  intervals: FuelInterval[];
}
