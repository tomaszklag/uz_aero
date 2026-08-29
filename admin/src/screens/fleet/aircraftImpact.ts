/**
 * UZ Aero - panel: karta „SKUTKI ZMIANY" (`A07a`) - moduł CZYSTY.
 *
 * ══ PO CO TA KARTA W OGÓLE ISTNIEJE ══
 * Realny scenariusz z mockupu: administrator poprawia błędnie wpisaną pojemność SP-KLM
 * z 1257 na 1100 L. **Musi przed zapisem zobaczyć, że próg flagi przesunie się
 * z ±62.9 na ±55.0 L** - bo to jest jedyny widoczny skutek tej liczby, a bez niego
 * zmiana wygląda na kosmetykę wpisu. I musi wiedzieć, ILU spraw ta zmiana dotyczy -
 * łącznie z tymi, które dopiero wyjdą z przeszłości (patrz `openFlagsRow`).
 *
 * ══ SKĄD BIORĄ SIĘ TE LICZBY ══
 * Obie tolerancje przychodzą Z SERWERA: „przed" jedzie w wierszu listy
 * (`fuelToleranceL`), „po" - z `GET /admin/api/fleet/tolerance?capacityL=…`. Panel nie
 * mnoży tu niczego przez 0.05 i nie może: z `@uzaero/domain` wolno mu importować
 * wyłącznie typy (`docs/architektura-panelu-frontend.md` §5.1). Dopóki serwer nie
 * odpowie, wiersz progu mówi „liczy serwer…", a nie pokazuje wartości zgadniętej.
 *
 * Reszta wierszy to PORÓWNANIA, nie arytmetyka - równość napisów i wartości logicznych.
 * To jest dokładnie ta granica, którą stawia §2.2: decyzja o treści mieszka w module
 * czystym z testem, a `.tsx` wyłącznie ją renderuje.
 */

import { litres, motoHours, plural } from '@uzaero/format';

import type { AircraftListItemDto } from '../../api/dto';
import type { KeyValueTone } from '../../ui/components';
import { toleranceText } from './fleetRows';
import { MH_FORMAT_OPTIONS, parseCapacity, type AircraftDraft } from './aircraftForm';

export interface ImpactRow {
  label: string;
  value: string;
  /** Dopisek mniejszą czcionką; `null` = wartość mówi wszystko. */
  unit: string | null;
  tone: KeyValueTone | null;
}

export interface ImpactCard {
  /** Ile pól formularza faktycznie się zmienia - plakietka „1 zmiana" w nagłówku. */
  changeCount: number;
  /** Odmieniona etykieta plakietki: „1 zmiana" / „2 zmiany" / „5 zmian". */
  changeLabel: string;
  rows: ImpactRow[];
}

/**
 * Wiersze karty dla EDYCJI istniejącej jednostki.
 *
 * @param toleranceAfter próg policzony przez serwer dla pojemności ze szkicu;
 *   `null` = jeszcze nie odpowiedział albo pojemność jest niepoprawna.
 */
export function impactCard(
  before: AircraftListItemDto,
  draft: AircraftDraft,
  toleranceAfter: number | null,
): ImpactCard {
  const rows: ImpactRow[] = [
    capacityRow(before, draft),
    toleranceRow(before, draft, toleranceAfter),
    mhFormatRow(before, draft),
    dualRow(before, draft),
    serviceRow(before, draft),
    openFlagsRow(before),
  ];

  // Wiersz progu i wiersz otwartych flag to KOMENTARZ do zmian, nie zmiany - liczymy
  // wyłącznie pola formularza, żeby plakietka „1 zmiana" znaczyła to, co mówi.
  const changeCount = countChanges(before, draft);

  return {
    changeCount,
    changeLabel: `${changeCount} ${plural(changeCount, 'zmiana', 'zmiany', 'zmian')}`,
    rows,
  };
}

/** Ile POLA formularza różnią się od stanu zapisanego. */
export function countChanges(before: AircraftListItemDto, draft: AircraftDraft): number {
  const capacityL = parseCapacity(draft.capacity);
  const beforeYear = before.year == null ? '' : String(before.year);

  return [
    draft.reg.trim().toUpperCase() !== before.reg,
    draft.type.trim() !== before.type,
    draft.year.trim() !== beforeYear,
    capacityL != null && capacityL !== before.capacityL,
    draft.mhFormat !== before.mhFormat,
    draft.dualRequired !== before.dualRequired,
    draft.serviceStatus !== before.serviceStatus,
  ].filter(Boolean).length;
}

const UNCHANGED = (what: string): ImpactRow => ({
  label: what,
  value: 'bez zmian',
  unit: null,
  tone: null,
});

function capacityRow(before: AircraftListItemDto, draft: AircraftDraft): ImpactRow {
  const capacityL = parseCapacity(draft.capacity);
  if (capacityL == null || capacityL === before.capacityL) return UNCHANGED('Pojemność');
  return {
    label: 'Pojemność',
    value: `${litres(before.capacityL)} → ${litres(capacityL)}`,
    unit: null,
    tone: 'amber',
  };
}

/**
 * Próg flagi - jedyny wiersz, który CZEKA na serwer.
 *
 * `toleranceAfter == null` przy zmienionej pojemności znaczy „serwer jeszcze nie
 * odpowiedział". Pokazujemy to wprost, zamiast zostawić stary próg jako wartość „po":
 * liczba, która nie nadąża za polem, jest gorsza od przyznania się do czekania.
 */
function toleranceRow(
  before: AircraftListItemDto,
  draft: AircraftDraft,
  toleranceAfter: number | null,
): ImpactRow {
  const capacityL = parseCapacity(draft.capacity);
  if (capacityL == null || capacityL === before.capacityL) {
    return {
      label: 'Próg FUEL_MISMATCH',
      value: toleranceText(before.fuelToleranceL),
      unit: 'bez zmian',
      tone: null,
    };
  }
  if (toleranceAfter == null) {
    return {
      label: 'Próg FUEL_MISMATCH',
      value: toleranceText(before.fuelToleranceL),
      unit: 'nowy próg liczy serwer…',
      tone: 'amber',
    };
  }
  return {
    label: 'Próg FUEL_MISMATCH',
    value: `${toleranceText(before.fuelToleranceL)} → ${toleranceText(toleranceAfter)}`,
    unit: null,
    tone: 'amber',
  };
}

const MH_LABEL = new Map(MH_FORMAT_OPTIONS.map((option) => [option.id, option.name]));

function mhFormatRow(before: AircraftListItemDto, draft: AircraftDraft): ImpactRow {
  if (draft.mhFormat === before.mhFormat) {
    return {
      label: 'Format MH',
      value: shortFormat(before.mhFormat),
      unit: 'bez zmian',
      tone: null,
    };
  }
  return {
    label: 'Format MH',
    value: `${shortFormat(before.mhFormat)} → ${shortFormat(draft.mhFormat)}`,
    // Przykład na wartości, którą administrator właśnie widzi w tabeli - inaczej
    // „decimal → hh:mm" nie mówi nic o tym, co zobaczy pilot na preflight.
    unit: exampleOf(before, draft),
    tone: 'amber',
  };
}

const shortFormat = (format: AircraftListItemDto['mhFormat']): string =>
  format === 'hhmm' ? 'godziny i minuty' : 'dziesiętny';

/** „1284.6 → 1284:36" na ostatnim znanym odczycie tej jednostki; `null` gdy go nie ma. */
function exampleOf(before: AircraftListItemDto, draft: AircraftDraft): string | null {
  if (before.reading == null) return MH_LABEL.get(draft.mhFormat) ?? null;
  return `${motoHours(before.reading.mh, before.mhFormat)} → ${motoHours(before.reading.mh, draft.mhFormat)}`;
}

function dualRow(before: AircraftListItemDto, draft: AircraftDraft): ImpactRow {
  if (draft.dualRequired === before.dualRequired) return UNCHANGED('Drugi pilot');
  return {
    label: 'Drugi pilot',
    value: draft.dualRequired ? 'wymagany' : 'nieobowiązkowy',
    unit: draft.dualRequired ? 'preflight bez Duala zostanie zablokowany' : 'blokada zniknie',
    tone: 'amber',
  };
}

function serviceRow(before: AircraftListItemDto, draft: AircraftDraft): ImpactRow {
  if (draft.serviceStatus === before.serviceStatus) return UNCHANGED('Stan służby');
  const disabling = draft.serviceStatus === 'disabled';
  return {
    label: 'Stan służby',
    value: disabling ? 'wyłączony ze służby' : 'w służbie',
    unit: disabling ? 'znika z listy wyboru; historia zostaje' : 'wróci na listę wyboru',
    tone: disabling ? 'red' : 'green',
  };
}

/**
 * Otwarte flagi tej jednostki - i to, co się z nimi stanie.
 *
 * To jest wiersz, dla którego serwer w ogóle wysyła `openFlags`. Do 2026-08-01 nosił
 * adnotację „bez przeliczenia" i było to zdanie NIEPRAWDZIWE o systemie: żadna z tych
 * flag rzeczywiście się nie zmieni ani nie zniknie (panel nie przepisuje rejestru,
 * a próg zapisany w `details` zostaje taki, jaki był w chwili wykrycia) - ale przy
 * NIŻSZYM progu ich może przybyć, bo `POST /events` przelicza łańcuch z całej historii
 * samolotu, biorąc pojemność bieżącą. Adnotacja mówi więc dokładnie tyle, ile jest
 * prawdą: te wpisy zostają nietknięte, a liczba jest DOLNĄ granicą, nie sufitem.
 */
function openFlagsRow(before: AircraftListItemDto): ImpactRow {
  return {
    label: 'Otwarte flagi tej jednostki',
    value: String(before.openFlags),
    unit: 'zostają bez zmian; nowy próg może dołożyć kolejne',
    tone: before.openFlags > 0 ? 'amber' : null,
  };
}
