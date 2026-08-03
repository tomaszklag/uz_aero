/**
 * UZ Aero — panel: FORMULARZ KONTA (`A06a`) — walidacja i szkic (moduł CZYSTY).
 *
 * Serwer sprawdza dokładnie to samo (`http/routes/admin/pilots.ts`), więc to NIE JEST
 * zabezpieczenie. To różnica między „przycisk mówi, czego brakuje" a „serwer odbija
 * 400 bez wyjaśnienia" — i dlatego reguły są tu LUSTREM reguł serwera, wypisanym obok
 * z podaniem, czego dotyczą.
 *
 * ══ CZEGO W TYM FORMULARZU NIE MA ══
 * **Pola hasła.** Panel nigdy hasła nie wysyła: generuje je serwer i oddaje jeden raz
 * w odpowiedzi (`A06a`: „Hasło startowe · pokazane raz"). Formularz opisuje wyłącznie
 * tożsamość i rolę — a to, że nie ma tu czego wpisać, jest treścią rozstrzygnięcia,
 * nie brakiem funkcji.
 */

import type { PilotListItemDto, PilotRole } from '../../api/dto';
import type { CreatePilotBody, UpdatePilotBody } from '../../api/pilots';

export interface AccountDraft {
  name: string;
  code: string;
  email: string;
  role: PilotRole;
}

/** Lustro `z.string().trim().min(2).max(100)` z trasy. */
export const NAME_MIN = 2;
export const NAME_MAX = 100;
/** Lustro `code` z trasy: 2–10 znaków, wyłącznie litery i cyfry. */
export const CODE_MIN = 2;
export const CODE_MAX = 10;
export const EMAIL_MAX = 200;

export interface FieldState {
  ok: boolean;
  /** Powód odmowy — WIDOCZNY tekst pod polem, nigdy tooltip; `null` = pole w porządku. */
  message: string | null;
}

const OK: FieldState = { ok: true, message: null };

export function nameState(value: string): FieldState {
  const text = value.trim();
  if (text.length === 0) {
    return { ok: false, message: 'Imię i nazwisko jest wymagane — bez niego wiersz w logu dnia nie ma podpisu.' };
  }
  if (text.length < NAME_MIN || text.length > NAME_MAX) {
    return { ok: false, message: `Imię i nazwisko: od ${NAME_MIN} do ${NAME_MAX} znaków.` };
  }
  return OK;
}

/**
 * Kod normalizujemy do WERSALIKÓW, a nie odrzucamy małych liter: „kza" i „KZA" to
 * w intencji administratora ten sam kod, a logowanie dopasowuje bez rozróżniania
 * wielkości. Serwer robi dokładnie to samo — panel pokazuje wynik od razu, żeby
 * wielka litera w polu nie była niespodzianką po zapisie.
 */
export function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function codeState(value: string): FieldState {
  const code = normalizeCode(value);
  if (code.length === 0) {
    return { ok: false, message: 'Kod pilota jest wymagany — widać go w logu dnia i w karcie arkusza.' };
  }
  if (code.length < CODE_MIN || code.length > CODE_MAX) {
    return { ok: false, message: `Kod pilota: od ${CODE_MIN} do ${CODE_MAX} znaków.` };
  }
  if (!/^[A-Z0-9]+$/.test(code)) {
    return { ok: false, message: 'Kod pilota: wyłącznie litery i cyfry, bez spacji i myślników.' };
  }
  return OK;
}

/**
 * E-mail jest OPCJONALNY, bo kolumna `pilots.email` jest `NULL`-owalna, a loginem bywa
 * sam kod pilota. Puste pole znaczy „bez e-maila", a nie „e-mail o zerowej długości".
 *
 * Wzorzec jest CELOWO luźny (jest małpa, jest kropka po niej, nie ma spacji). Ścisła
 * walidacja adresów to znany sposób na odrzucenie poprawnego adresu; ostateczną
 * odpowiedź i tak daje serwer.
 */
export function emailState(value: string): FieldState {
  const text = value.trim();
  if (text.length === 0) return OK;
  if (text.length > EMAIL_MAX) return { ok: false, message: `E-mail: najwyżej ${EMAIL_MAX} znaków.` };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return { ok: false, message: 'E-mail musi wyglądać jak adres — to on jest loginem do aplikacji.' };
  }
  return OK;
}

export interface FormState {
  name: FieldState;
  code: FieldState;
  email: FieldState;
  /** Czy wolno wysłać. */
  ok: boolean;
  /** Powód blokady przycisku — WIDOCZNY tekst, nigdy sam wyszarzony przycisk. */
  reason: string | null;
}

export function formState(draft: AccountDraft): FormState {
  const name = nameState(draft.name);
  const code = codeState(draft.code);
  const email = emailState(draft.email);
  const ok = name.ok && code.ok && email.ok;

  return {
    name,
    code,
    email,
    ok,
    reason: ok ? null : 'Popraw pola oznaczone niżej — serwer odrzuci ten zapis.',
  };
}

/** Szkic → ciało `POST /pilots`. Kod normalizowany, pusty e-mail pomijany. */
export function createBody(draft: AccountDraft): CreatePilotBody {
  return {
    code: normalizeCode(draft.code),
    name: draft.name.trim(),
    email: draft.email.trim(),
    role: draft.role,
  };
}

/** Konto z listy → szkic formularza (wejście „Szczegóły" i „Reset hasła"). */
export function draftOf(pilot: PilotListItemDto): AccountDraft {
  return {
    name: pilot.name,
    code: pilot.code,
    email: pilot.email ?? '',
    role: pilot.role,
  };
}

/**
 * Szkic → ciało `PATCH /pilots/:id`, wyłącznie POLA ZMIENIONE.
 *
 * `PATCH` opisuje różnicę, a nie stan docelowy, więc wysyłanie niezmienionych pól nie
 * jest tylko marnotrawstwem: dziennik audytu zapisuje DIFF, a serwer odmawia zapisu
 * bez zmian (`no_changes`). Formularz, który wysyła wszystko, kazałby administratorowi
 * czytać w dzienniku „kod z KZA na KZA".
 */
export function updateBody(before: PilotListItemDto, draft: AccountDraft): UpdatePilotBody {
  const body: UpdatePilotBody = {};

  const code = normalizeCode(draft.code);
  if (code !== before.code) body.code = code;

  const name = draft.name.trim();
  if (name !== before.name) body.name = name;

  const email = draft.email.trim();
  if (email !== (before.email ?? '')) body.email = email;

  if (draft.role !== before.role) body.role = draft.role;

  return body;
}

/** Czy formularz w ogóle coś zmienia — bez tego przycisk „Zapisz" prosi o 400. */
export function hasChanges(before: PilotListItemDto, draft: AccountDraft): boolean {
  return Object.keys(updateBody(before, draft)).length > 0;
}

export interface RoleOption {
  id: PilotRole;
  name: string;
  desc: string;
}

/**
 * Opisy ról 1:1 z mockupu `A06a` — to jest jedyne miejsce w produkcie, w którym
 * człowiek czyta, co rola oznacza PRZED jej nadaniem. Kolejność od najmniejszych
 * uprawnień, żeby wybór w górę był świadomy.
 */
export const ROLE_OPTIONS: readonly RoleOption[] = [
  {
    id: 'pilot',
    name: 'Pilot',
    desc: 'Tylko aplikacja na telefonie. Panel odrzuca logowanie komunikatem, że jest dla dwóch pozostałych ról.',
  },
  {
    id: 'training_lead',
    name: 'Szef wyszkolenia',
    desc: 'Panel do odczytu: pulpit, dni lotne, zdarzenia, eksporty, statystyki + rozwiązywanie flag. Bez kont, floty i progów.',
  },
  {
    id: 'admin',
    name: 'Administrator',
    desc: 'Panel w całości: konta, flota, progi detekcji, korekty po oknie 24 h. Rola nie daje niczego w aplikacji — administrator lata na tych samych zasadach.',
  },
];
