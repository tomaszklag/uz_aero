/**
 * UZ Aero - panel: DTO kont → wiersze tabeli `A06` (moduł CZYSTY).
 *
 * Ekran jest `.tsx` bez decyzji o treści: plakietki, napisy i to, które konto jest
 * „przygaszone", rozstrzyga się tutaj i ma test w Node.
 *
 * ══ CZEGO TEN WIERSZ NIE NIESIE I DLACZEGO ══
 *  1. **„Ostatnie logowanie"** (kolumna z mockupu A06) - `pilots` nie ma takiej
 *     kolumny i nikt jej nie zapisuje. Wyliczenie jej z `refresh_tokens` dałoby
 *     „ostatnią rotację sesji telefonu", czyli inną wielkość pod tą samą etykietą.
 *     Ekran mówi o tym braku wprost, zamiast pokazywać myślnik bez wyjaśnienia.
 *  2. **Adnotacji „w locie · SP-ABC · sync 3 min temu"** - to jest stan floty, a nie
 *     konta; niesie go inna trasa (`A01`, `A07`) i inny ekran.
 *  3. **„deaktywowany 14 MAY 2026"** - `pilots.updated_at` mówi, KIEDY zmieniono
 *     wiersz, a nie CO zmieniono. Data deaktywacji jest w dzienniku audytu i tam
 *     prowadzi link „Historia zmian".
 */

import { dateUtcShort } from '@uzaero/format';

import type { PilotListItemDto, PilotRole } from '../../api/dto';
import type { PillTone } from '../../ui/components';

export interface PilotRowBadge {
  text: string;
  tone: PillTone;
}

export interface PilotRow {
  id: string;
  code: string;
  name: string;
  /** `-`, gdy konto nie ma e-maila: loginem bywa sam kod pilota. */
  email: string;
  role: PilotRowBadge;
  status: PilotRowBadge & { dot: boolean };
  /** Liczba dni lotnych w oknie serwera; `-` przy zerze, jak w tabelach panelu. */
  flyingDays: string;
  /** Kiedy ostatnio zmieniono WIERSZ konta - nie: kiedy pilot się logował. */
  changed: string;
  /** `true` = konto nieaktywne; cały wiersz jest przygaszony (mockup A06). */
  dim: boolean;
  /** Surowe DTO - szuflada otwiera wiersz, który już jest na liście. */
  dto: PilotListItemDto;
}

/**
 * Nazwy ról po polsku i ich ton. `Record` wymusza komplet: dopisanie roli w katalogu
 * serwera wywali kompilację tutaj, zamiast pokazać administratorowi surowy kod z bazy.
 *
 * Ton `blue` dla ról panelowych, `dim` dla pilota - dokładnie jak w mockupie A06:
 * plakietka odpowiada na pytanie „czy to konto w ogóle wchodzi do panelu".
 */
const ROLE_BADGE: Record<PilotRole, PilotRowBadge> = {
  admin: { text: 'Administrator', tone: 'blue' },
  training_lead: { text: 'Szef wyszkolenia', tone: 'blue' },
  pilot: { text: 'Pilot', tone: 'dim' },
};

export function roleBadge(role: PilotRole): PilotRowBadge {
  return ROLE_BADGE[role];
}

/** Czy rola daje wejście do panelu - do opisu kafla i karty „Rola w panelu". */
export function hasPanelRole(role: PilotRole): boolean {
  return role !== 'pilot';
}

export function pilotRows(items: readonly PilotListItemDto[]): PilotRow[] {
  return items.map((dto) => ({
    id: dto.id,
    code: dto.code,
    name: dto.name,
    email: dto.email ?? '-',
    role: ROLE_BADGE[dto.role],
    status: dto.active
      ? { text: 'Aktywny', tone: 'green', dot: true }
      : { text: 'Nieaktywny', tone: 'dim', dot: false },
    // „-" zamiast zera: zero w kolumnie liczbowej czyta się jak wynik pomiaru,
    // a tu znaczy „w tym oknie ani jednego dnia". Ta sama reguła, co na liście dni.
    flyingDays: dto.flyingDays === 0 ? '-' : String(dto.flyingDays),
    changed: changedText(dto.updatedAt),
    dim: !dto.active,
    dto,
  }));
}

/**
 * `updatedAt` jest stemplem serwera w ISO 8601. Nieczytelna wartość daje `-`, a nie
 * `Invalid Date`: panel czyta dane z bazy, w której wiersz mógł powstać ręcznie.
 */
function changedText(updatedAt: string): string {
  const ms = Date.parse(updatedAt);
  return Number.isNaN(ms) ? '-' : dateUtcShort(ms);
}

export interface EmptyCopy {
  title: string;
  note: string;
}

/**
 * Pusta lista mówi CO INNEGO przy zawężeniu niż bez niego. Bez tego rozróżnienia
 * administrator patrzący na pusty ekran nie wie, czy klub nie ma kont, czy jego filtr
 * ich nie pokazuje - a to jest różnica między awarią a literówką w polu wyszukiwania.
 */
export function pilotsEmpty(narrowed: boolean): EmptyCopy {
  if (narrowed) {
    return {
      title: 'ŻADNE KONTO NIE PASUJE',
      note: 'Zdejmij zawężenie albo popraw wyszukiwanie. Konta nie znikają z bazy - deaktywacja odbiera dostęp, a wiersz zostaje.',
    };
  }
  return {
    title: 'BRAK KONT',
    note: 'W bazie nie ma ani jednego konta pilota. Aplikacja nie ma samodzielnej rejestracji, więc pierwsze konto zakłada się tutaj albo seedem.',
  };
}
