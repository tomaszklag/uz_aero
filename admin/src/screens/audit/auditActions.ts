/**
 * UZ Aero — panel: KATALOG AKCJI DZIENNIKA tak, jak opisuje je `A09` (moduł CZYSTY).
 *
 * Serwer wystawia SUROWE kody (`zasób.czynność`) i nie zna języka interfejsu —
 * `server/src/domain/adminActions.ts` mówi to wprost. Plakietki, nazwy po polsku,
 * grupy chipów i zdanie „co dokładnie zapisujemy" są więc sprawą panelu i mieszkają
 * tutaj, w jednym pliku z testem obok.
 *
 * ══ DLACZEGO `Record<AdminAction, …>`, A NIE TABLICA ══
 * Ten sam mechanizm, co przy typach flag: mapa indeksowana unią wymusza KOMPLET
 * kluczy, więc dopisanie akcji w katalogu serwera wywala kompilację tego pliku,
 * zamiast po cichu zostawić wpis bez nazwy. Sam katalog jest lustrem
 * (`api/dto.ts` → `AdminAction`), a jego zgodność z serwerem przybija
 * `admin/test/adminActions.mirror.test.ts` — bo lustro bez testu to kopia, która
 * rozjeżdża się przy pierwszej nowej komendzie.
 *
 * ══ KOD SPOZA KATALOGU ══
 * `admin_audit.action` celowo nie ma `CHECK`-a: wiersz jest zapisem
 * historycznym, więc wycofanie akcji z katalogu nie może unieważnić tego, co zdarzyło
 * się rok temu. Dlatego `actionView` przyjmuje `string`, a nie `AdminAction`, i dla
 * nieznanego kodu oddaje go DOSŁOWNIE zamiast rzucać albo pokazywać „—". Dziennik
 * nadzoru, który nie otwiera się przez własną historię, przestaje być dziennikiem.
 */

import type { AdminAction } from '../../api/dto';
import type { PillTone } from '../../ui/components/Pill';

/** Grupa chipów w pasku filtrów — jedno kliknięcie, kilka kodów katalogu. */
export type AuditGroupId =
  | 'flagi'
  | 'korekty'
  | 'eksport'
  | 'konta'
  | 'flota'
  | 'progi'
  | 'konserwacja';

export interface AuditActionMeta {
  /**
   * Ton plakietki mówi, JAK GŁĘBOKO akcja sięga — a nie do jakiego ekranu należy:
   *  • `red`   — odbiera dostęp albo wyłącza byt (deaktywacja, reset hasła, postój);
   *  • `amber` — zmienia LICZBY dokumentu klubu albo reguły ich liczenia;
   *  • `green` — powołuje byt do życia albo zamyka sprawę decyzją człowieka;
   *  • `blue`  — edycja opisowa i powtórzenie operacji bez zmiany treści;
   *  • `dim`   — konserwacja niedotykająca rejestru lotów.
   */
  tone: PillTone;
  group: AuditGroupId;
  /** Nazwa po polsku — podpis pod surowym kodem w kolumnie „Akcja". */
  label: string;
  /** Kolumna „Co dokładnie zapisujemy" ze słownika akcji na `A09`. */
  records: string;
}

export const AUDIT_ACTION_META: Record<AdminAction, AuditActionMeta> = {
  'flag.resolve': {
    tone: 'green',
    group: 'flagi',
    label: 'rozwiązanie flagi',
    records:
      'Numer i typ flagi, sesje, których dotyczyła, oraz PEŁNA treść komentarza. ' +
      'Rozwiązanie nakładki sesji odblokowuje kartę arkusza.',
  },
  'event.correct': {
    tone: 'amber',
    group: 'korekty',
    label: 'korekta po oknie 24 h',
    records:
      'UUID poprawianego zdarzenia, rodzaj (`retime`/`void`), nowy czas i powód. ' +
      'Oryginalny odczyt zostaje w rejestrze — korekta jest dopisana, nie nadpisana.',
  },
  'export.retry': {
    tone: 'blue',
    group: 'eksport',
    label: 'ponowienie eksportu',
    records: 'Nazwa karty, numer rewizji i próby, treść poprzedniego błędu.',
  },
  'pilot.create': {
    tone: 'green',
    group: 'konta',
    label: 'założenie konta',
    records: 'Kod pilota, imię i nazwisko, e-mail, rola startowa.',
  },
  'pilot.update': {
    tone: 'blue',
    group: 'konta',
    label: 'edycja konta',
    records:
      'Każde zmienione pole przed → po — razem ze ZMIANĄ ROLI, która nie ma osobnego ' +
      'kodu w katalogu serwera.',
  },
  'pilot.deactivate': {
    tone: 'red',
    group: 'konta',
    label: 'deaktywacja konta',
    records:
      'Zmiana `active`, liczba unieważnionych tokenów. Konto ZOSTAJE w bazie — ' +
      'zdarzenia historyczne wskazują na `pic_id`.',
  },
  'pilot.password_reset': {
    tone: 'red',
    group: 'konta',
    label: 'reset hasła',
    records:
      'Wyłącznie fakt i komu. NIGDY wartości hasła, jego hashu, tokenu ani PIN-u — ' +
      'to jest granica, której dziennik nie przekracza.',
  },
  'aircraft.create': {
    tone: 'green',
    group: 'flota',
    label: 'dodanie samolotu',
    records: 'Rejestracja, typ, pojemność, format licznika MH, wymóg dual.',
  },
  'aircraft.update': {
    tone: 'blue',
    group: 'flota',
    label: 'edycja samolotu',
    records: 'Każde pole przed → po; przy pojemności także wynikająca z niej tolerancja paliwa.',
  },
  'aircraft.disable': {
    tone: 'red',
    group: 'flota',
    label: 'wyłączenie ze służby',
    records:
      'Status przed → po i powód. Samolot znika z listy wyboru w aplikacji przy ' +
      'najbliższym `/reference`; sesje historyczne bez zmian.',
  },
  'thresholds.update': {
    tone: 'amber',
    group: 'progi',
    label: 'zmiana tolerancji flag',
    records:
      'Nazwa progu, wartość przed → po, uzasadnienie. Progi DETEKCJI (kołowanie, ' +
      'start, lądowanie) są tylko do odczytu — liczy je telefon offline.',
  },
  'maintenance.rebuild_projections': {
    tone: 'amber',
    group: 'konserwacja',
    label: 'przebudowa projekcji',
    records:
      'Liczba przeliczonych sesji. Operacja czyta rejestr i nadpisuje `sessions` — ' +
      'zmienia LICZBY widoczne w panelu, nie zmieniając ani jednego zdarzenia.',
  },
  'maintenance.retry_exports': {
    tone: 'blue',
    group: 'konserwacja',
    label: 'ponowienie zaległych eksportów',
    records: 'Liczba kart w kolejce i wynik każdej próby.',
  },
  'maintenance.prune_tokens': {
    tone: 'dim',
    group: 'konserwacja',
    label: 'czyszczenie wygasłych tokenów',
    records:
      'Liczba skasowanych wierszy i zakres dat wygaśnięcia — nigdy same tokeny. ' +
      'W bazie leżą wyłącznie skróty SHA-256; wartości nie zna nawet serwer.',
  },
};

/** Kolejność katalogu = kolejność `ADMIN_ACTIONS` na serwerze (pilnuje test lustra). */
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_META) as AdminAction[];

/** Strażnik wejścia z URL-a — adres z literówką ma dać listę pełną, nie stronę błędu. */
export function isAuditAction(value: string | null): value is AdminAction {
  return value != null && Object.prototype.hasOwnProperty.call(AUDIT_ACTION_META, value);
}

export interface AuditGroup {
  id: AuditGroupId;
  label: string;
  actions: AdminAction[];
}

/**
 * Chipy paska akcji. Kolejność jak w mockupie: najpierw to, co dotyka rejestru
 * i dokumentu klubu, potem konfiguracja, na końcu konserwacja.
 *
 * Skład grup NIE jest tu przepisany ręcznie — powstaje z `AUDIT_ACTION_META.group`,
 * więc dopisanie akcji do katalogu automatycznie wpada do właściwego chipa i nie da
 * się zapomnieć o drugiej liście.
 */
export const AUDIT_GROUPS: AuditGroup[] = (
  [
    ['flagi', 'Flagi'],
    ['korekty', 'Korekty rejestru'],
    ['eksport', 'Eksport'],
    ['konta', 'Konta'],
    ['flota', 'Flota'],
    ['progi', 'Progi'],
    ['konserwacja', 'Konserwacja'],
  ] as const
).map(([id, label]) => ({
  id,
  label,
  actions: AUDIT_ACTIONS.filter((action) => AUDIT_ACTION_META[action].group === id),
}));

export function isAuditGroup(value: string | null): value is AuditGroupId {
  return value != null && AUDIT_GROUPS.some((group) => group.id === value);
}

/** Kody wchodzące w skład grupy. */
export function actionsOfGroup(id: AuditGroupId): AdminAction[] {
  return AUDIT_GROUPS.find((group) => group.id === id)?.actions ?? [];
}

export interface ActionView {
  /** Zawsze SUROWY kod z bazy — także wtedy, gdy panel go nie zna. */
  code: string;
  tone: PillTone;
  label: string;
  /** `false` = kodu nie ma w katalogu; plakietka jest wygaszona, kod zostaje. */
  known: boolean;
}

/**
 * Kod akcji → plakietka i podpis. Dla kodu spoza katalogu oddaje go dosłownie
 * z podpisem tłumaczącym, skąd taki wpis się bierze — zamiast „—", które kazałoby
 * zgadywać, czy to awaria panelu, czy uszkodzony wiersz.
 */
export function actionView(code: string): ActionView {
  if (!isAuditAction(code)) {
    return {
      code,
      tone: 'dim',
      label: 'kod spoza katalogu — wpis historyczny',
      known: false,
    };
  }
  const meta = AUDIT_ACTION_META[code];
  return { code, tone: meta.tone, label: meta.label, known: true };
}
