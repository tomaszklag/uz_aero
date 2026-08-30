/**
 * UZ Aero - panel 2.0: formularz konta - szkic, ocena i ZMIANA do wysłania.
 *
 * Moduł CZYSTY (bez Reacta, bez sieci), bo to są decyzje o treści, a nie o układzie -
 * i dlatego ma test obok.
 *
 * == CO TU WOLNO SPRAWDZAC, A CZEGO NIE ==
 * Sprawdzamy wyłącznie KSZTAŁT wpisu - to, co serwer odrzuciłby jako `400 bad_request`,
 * czyli komunikatem „popraw formularz" bez wskazania pola. Wszystko, co jest REGUŁĄ
 * (kod zajęty, ostatni administrator, wyłączone konto), zostaje po stronie serwera
 * i wraca odmową z powodem: druga kopia reguły w przeglądarce rozjeżdża się przy
 * pierwszej zmianie po tamtej stronie, a rozjazd objawia się blokadą akcji, która
 * jest dozwolona.
 */

import type { PilotListItemDto, PilotRole } from '../../api/dto';
import type { CreatePilotBody, UpdatePilotBody } from '../../api/pilots';
import { ACCOUNT_ACTIVE, SELF_ACCOUNT } from './accountRefusal';

/** Stan pól formularza. Wszystko napisami - tak, jak wychodzi z `<input>`. */
export interface AccountDraft {
  code: string;
  name: string;
  email: string;
  role: PilotRole;
}

export const EMPTY_ACCOUNT: AccountDraft = { code: '', name: '', email: '', role: 'pilot' };

/** Konto z listy -> szkic. `null` w e-mailu to puste pole, nie napis „null". */
export function draftOf(pilot: PilotListItemDto): AccountDraft {
  return { code: pilot.code, name: pilot.name, email: pilot.email ?? '', role: pilot.role };
}

/**
 * KIEDY przestawić szkic na dane z serwera - klucz synchronizacji formularza.
 *
 * `null` znaczy „jeszcze nie ma czym", i to jest cała treść tej funkcji: przy wejściu
 * z linku (albo po odświeżeniu karty) szuflada montuje się ZANIM przyjdzie lista, więc
 * konta jeszcze nie ma. Formularz przestawiony wtedy raz, przy montowaniu, zostawał
 * pusty na zawsze - z blokadą „wpisz kod pilota" nad kontem, które istnieje.
 *
 * Klucz zmienia się wyłącznie wtedy, gdy zmienia się TOŻSAMOŚĆ edytowanego konta -
 * nie przy każdym odświeżeniu listy. Dzięki temu przeładowanie danych po zapisie nie
 * kasuje tego, co człowiek właśnie wpisał.
 */
export function draftKey(creating: boolean, pilot: PilotListItemDto | null): string | null {
  if (creating) return 'nowy';
  return pilot?.id ?? null;
}

/**
 * Kod pilota normalizujemy do WERSALIKOW dokładnie tak, jak robi to serwer
 * (`routes/admin/pilots.ts`): „kza" i „KZA" to w intencji administratora ten sam kod.
 * Normalizacja tutaj nie jest cichą poprawką wpisu - pole pokazuje wersaliki od razu.
 */
export const normalizeCode = (code: string): string => code.trim().toUpperCase();

/** Pola, przy których stawiamy czerwoną ramkę. Puste = formularz gotowy do wysłania. */
export type AccountField = 'code' | 'name' | 'email';

/**
 * Ocena szkicu: co jest nie do przyjęcia, czy formularz jest kompletny i JEDNO zdanie
 * dla przycisku.
 *
 * == PUSTE POLE WYMAGANE NIE DOSTAJE ZDANIA ==
 * Reguła przeniesiona wprost z aplikacji pilota (`CLAUDE.md`, issue #55): „wiadomo,
 * że jak pole jest wymagane, to dlatego przycisk jest nieczynny". Puste pole widać
 * z formularza NAD przyciskiem, więc `blocker` przy nim milczy - `complete` mówi tylko,
 * że zapisu nie ma. Zdanie zostaje dla wpisu NIECZYTELNEGO: czerwona ramka mówi, KTORE
 * pole, ale nie mówi, co jest z nim nie tak.
 *
 * Zdanie jest jedno, bo przycisk jest jeden - a pierwsze ma być tym, które człowiek
 * musi przeczytać. Kolejność sprawdzeń jest kolejnością wypełniania formularza.
 */
export interface AccountVerdict {
  /** Pola z wpisem NIE DO ODCZYTANIA - czerwona ramka. Puste pola tu NIE wchodzą. */
  invalid: AccountField[];
  /** `false` = brakuje czegoś wymaganego. Bez zdania - brak widać w polach. */
  complete: boolean;
  /** Zdanie dla przycisku; `null` także wtedy, gdy formularz jest po prostu pusty. */
  blocker: string | null;
}

const CODE_PATTERN = /^[A-Z0-9]+$/;
/**
 * Wzorzec e-maila celowo LUZNY - ma odrzucić wpis bez małpy i bez kropki, a nie
 * rozstrzygać, co jest adresem. Rozstrzyga serwer (`z.string().email()`), a przed nim
 * dostawca poczty; formularz ma tylko nie wysyłać oczywistej pomyłki.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function verdictOf(draft: AccountDraft): AccountVerdict {
  const invalid: AccountField[] = [];
  let blocker: string | null = null;
  let complete = true;

  const code = normalizeCode(draft.code);
  const name = draft.name.trim();
  const email = draft.email.trim();

  /** Wpis nieczytelny: czerwona ramka I zdanie. */
  const fail = (field: AccountField, message: string): void => {
    invalid.push(field);
    blocker ??= message;
  };
  /** Pole wymagane, jeszcze puste: sam brak zapisu, bez ramki i bez zdania. */
  const missing = (): void => {
    complete = false;
  };

  if (code === '') missing();
  else if (code.length < 2 || code.length > 10) fail('code', 'Kod pilota ma od 2 do 10 znaków.');
  else if (!CODE_PATTERN.test(code)) fail('code', 'Kod pilota: tylko litery i cyfry.');

  if (name === '') missing();
  else if (name.length < 2) fail('name', 'Imię i nazwisko: co najmniej 2 znaki.');

  // E-mail jest OPCJONALNY (pilot loguje się kodem), więc puste pole nie jest błędem.
  if (email !== '' && !EMAIL_PATTERN.test(email)) fail('email', 'To nie wygląda na adres e-mail.');

  return { invalid, complete, blocker };
}

/** Szkic -> ciało `POST`. Pusty e-mail wysyłamy jako `''` - serwer zapisze `null`. */
export function createBodyOf(draft: AccountDraft): CreatePilotBody {
  return {
    code: normalizeCode(draft.code),
    name: draft.name.trim(),
    email: draft.email.trim(),
    role: draft.role,
  };
}

/**
 * Szkic -> ciało `PATCH`, czyli WYŁACZNIE to, co się zmieniło.
 *
 * `PATCH` opisuje ZMIANĘ, nie stan docelowy, a pusty obiekt odbije się o `400
 * no_changes` - i tak ma być: to jest pytanie o świat („czy coś się zmienia"),
 * a nie o kształt żądania. Ekran pyta o to samo wcześniej (`hasChanges`), żeby nie
 * wysyłać żądania, którego jedynym skutkiem byłby komunikat o błędzie.
 */
export function updateBodyOf(before: PilotListItemDto, draft: AccountDraft): UpdatePilotBody {
  const body: UpdatePilotBody = {};
  const code = normalizeCode(draft.code);
  const name = draft.name.trim();
  const email = draft.email.trim();

  // Porównujemy PO OBU stronach po normalizacji, nie wpis znormalizowany z surową
  // wartością z bazy. Konto `admin` z seeda ma kod małymi literami (wiersz powstał
  // z pominięciem trasy, która wersalikuje) - bez tego samo jego otwarcie wyglądało
  // na zmianę, a zapis po cichu przemianowywał kod na `ADMIN`, czyli etykietę
  // w arkuszu klubu i przy wyborze drugiego pilota.
  if (code !== normalizeCode(before.code)) body.code = code;
  if (name !== before.name) body.name = name;
  // `null` i `''` znaczą to samo („bez e-maila"), więc porównujemy po normalizacji -
  // inaczej samo otwarcie i zapisanie konta bez e-maila wyglądałoby na zmianę.
  if (email !== (before.email ?? '')) body.email = email;
  if (draft.role !== before.role) body.role = draft.role;

  return body;
}

export const hasChanges = (before: PilotListItemDto, draft: AccountDraft): boolean =>
  Object.keys(updateBodyOf(before, draft)).length > 0;

/**
 * Dlaczego NIE DA SIĘ usunąć konta - albo `null`, gdy próba ma sens.
 *
 * Sprawdzamy WYŁĄCZNIE to, co widać z listy: własne konto i konto, które wciąż ma
 * dostęp. Trzeciego warunku (brak historii) panel nie zna - lista nie niesie liczby
 * lotów - więc ten wraca odmową serwera z nazwanym powodem. Zgadywanie „chyba da się
 * usunąć" przy akcji nieodwracalnej byłoby obietnicą, której nie ma czym pokryć.
 *
 * Zdania są TE SAME, co odmowy serwera (`accountRefusal.ts`): jedna reguła, jedno
 * brzmienie - powiedziane wcześniej, nie napisane drugi raz.
 */
export function deleteBlocker(pilot: PilotListItemDto, selfId: string | null): string | null {
  if (pilot.id === selfId) return SELF_ACCOUNT;
  if (pilot.active) return ACCOUNT_ACTIVE;
  return null;
}
