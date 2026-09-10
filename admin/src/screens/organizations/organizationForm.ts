/**
 * Ninerdeck - panel: formularz klubu - szkic, podpowiedź adresu i ocena (issue #101, E1).
 *
 * Moduł CZYSTY (bez Reacta, bez sieci), bo to są decyzje o treści, a nie o układzie -
 * i dlatego ma test obok.
 *
 * ══ CO TU WOLNO SPRAWDZAC, A CZEGO NIE ══
 * Ta sama granica, co przy koncie: sprawdzamy KSZTAŁT wpisu (to, co serwer odrzuciłby
 * jako `400 bad_request`), a REGUŁY - adres zajęty, osoba już administratorem tego klubu
 * - zostają po tamtej stronie i wracają odmową z powodem. Druga kopia reguły
 * w przeglądarce rozjeżdża się przy pierwszej zmianie serwera, a rozjazd objawia się
 * blokadą akcji, która jest dozwolona.
 *
 * ══ DWA TRYBY, BO DWA RÓŻNE FORMULARZE ══
 * `create` pyta o wszystko (klub + pierwszy administrator), `edit` wyłącznie o NAZWĘ:
 * adres jest nadawany raz (stoi w adresach kart arkusza), a administratorów zmienia się
 * w klubie, nie na platformie.
 */

import type { OrganizationDetailDto, OrganizationDraftBody } from '../../api/dto';

export type OrganizationMode = 'create' | 'edit';

/**
 * Segment adresu (`#/organizacje/nowy`), pod którym szuflada jest PUSTYM formularzem,
 * a nie kartą klubu - ten sam wzorzec, co `nowy` przy flocie.
 *
 * Stoi tutaj, a nie w pliku ekranu, bo `.tsx` w tym panelu eksportuje wyłącznie
 * komponenty (granica Fast Refresh, `test/architecture.test.ts`) - a poza tym jest to
 * ta sama decyzja, co `OrganizationMode` wyżej: który tryb formularza jest na ekranie.
 */
export const NEW_ORGANIZATION = 'nowy';

/** Stan pól formularza. Wszystko napisami - tak, jak wychodzi z `<input>`. */
export interface OrganizationDraft {
  name: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminCode: string;
}

export const EMPTY_ORGANIZATION: OrganizationDraft = {
  name: '',
  slug: '',
  adminName: '',
  adminEmail: '',
  adminCode: '',
};

/** Klub z serwera -> szkic. Pola administratora zostają puste: karta ich nie edytuje. */
export function draftOf(organization: OrganizationDetailDto): OrganizationDraft {
  return { ...EMPTY_ORGANIZATION, name: organization.name, slug: organization.slug };
}

/** Lustro `ORG_SLUG_MAX_LENGTH` z `server/src/domain/organizations.ts`. */
const ORG_SLUG_MAX_LENGTH = 60;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CODE_PATTERN = /^[A-Z0-9]+$/;

/**
 * Adres podpowiedziany z nazwy - „Aeroklub Zielonogórski" → `aeroklub-zielonogorski`.
 *
 * Polskie znaki rozkładamy przez NFD i zdejmujemy znaki łączące (`̀-ͯ`);
 * `ł` NFD NIE ROZKŁADA - to osobna litera, a nie `l` z kreską - więc ma własny wiersz.
 * Bez niego „Kółko" dawałoby `kko`, czyli adres z dziurą w środku i bez ostrzeżenia.
 *
 * To jest PODPOWIEDŹ, nie walidacja: pole zostaje edytowalne, bo adres jest publiczny
 * i klub ma prawo chcieć krótszego (`ks-gliwice` zamiast `klub-spadochronowy-gliwice`).
 */
export function slugFrom(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ORG_SLUG_MAX_LENGTH);
}
/**
 * Wzorzec e-maila celowo LUZNY - ma odrzucić wpis bez małpy i bez kropki, a nie
 * rozstrzygać, co jest adresem (ta sama decyzja, co w formularzu konta).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type OrganizationField = 'name' | 'slug' | 'adminName' | 'adminEmail' | 'adminCode';

export interface OrganizationVerdict {
  /** Pola z wpisem NIE DO ODCZYTANIA - czerwona ramka. Puste pola tu NIE wchodzą. */
  invalid: OrganizationField[];
  /** `false` = brakuje czegoś wymaganego. Bez zdania - brak widać w polach. */
  complete: boolean;
  /** Zdanie dla przycisku; `null` także wtedy, gdy formularz jest po prostu pusty. */
  blocker: string | null;
}

/** Kod pilota do WERSALIKOW, dokładnie jak przy koncie i jak robi to serwer. */
export const normalizeCode = (code: string): string => code.trim().toUpperCase();

export function verdictOf(draft: OrganizationDraft, mode: OrganizationMode): OrganizationVerdict {
  const invalid: OrganizationField[] = [];
  let blocker: string | null = null;
  let complete = true;

  const fail = (field: OrganizationField, message: string): void => {
    invalid.push(field);
    blocker ??= message;
  };
  const missing = (): void => {
    complete = false;
  };

  const name = draft.name.trim();
  if (name === '') missing();
  else if (name.length < 2) fail('name', 'Nazwa klubu: co najmniej 2 znaki.');

  // Adres sprawdzamy WYŁĄCZNIE przy zakładaniu: przy edycji pole jest do odczytu, więc
  // czerwona ramka pokazywałaby błąd, którego nie ma jak poprawić.
  if (mode === 'create') {
    const slug = draft.slug.trim();
    if (slug === '') missing();
    else if (slug.length < 2 || slug.length > ORG_SLUG_MAX_LENGTH) {
      fail('slug', `Adres klubu: od 2 do ${ORG_SLUG_MAX_LENGTH} znaków.`);
    } else if (!SLUG_PATTERN.test(slug)) {
      fail('slug', 'Adres klubu: małe litery i cyfry rozdzielone myślnikami.');
    }

    const adminName = draft.adminName.trim();
    if (adminName === '') missing();
    else if (adminName.length < 2) fail('adminName', 'Imię i nazwisko: co najmniej 2 znaki.');

    // E-mail administratora jest WYMAGANY, inaczej niż przy zwykłym członku: to on
    // podpina konto Google przy pierwszym logowaniu, więc bez niego klub ma
    // administratora, który nie ma jak wejść.
    const adminEmail = draft.adminEmail.trim();
    if (adminEmail === '') missing();
    else if (!EMAIL_PATTERN.test(adminEmail)) {
      fail('adminEmail', 'To nie wygląda na adres e-mail.');
    }

    const adminCode = normalizeCode(draft.adminCode);
    if (adminCode === '') missing();
    else if (adminCode.length < 2 || adminCode.length > 10) {
      fail('adminCode', 'Kod pilota ma od 2 do 10 znaków.');
    } else if (!CODE_PATTERN.test(adminCode)) {
      fail('adminCode', 'Kod pilota: tylko litery i cyfry.');
    }
  }

  return { invalid, complete, blocker };
}

/** Szkic -> ciało `POST`. Wołane wyłącznie po `verdictOf`, więc bez ponownej oceny. */
export function createBodyOf(draft: OrganizationDraft): OrganizationDraftBody {
  return {
    name: draft.name.trim(),
    slug: draft.slug.trim(),
    admin: {
      name: draft.adminName.trim(),
      email: draft.adminEmail.trim(),
      code: normalizeCode(draft.adminCode),
    },
  };
}

/** Przy edycji zmienia się WYŁĄCZNIE nazwa - reszta pól karty jest do odczytu. */
export const hasChanges = (before: OrganizationDetailDto, draft: OrganizationDraft): boolean =>
  draft.name.trim() !== before.name;
