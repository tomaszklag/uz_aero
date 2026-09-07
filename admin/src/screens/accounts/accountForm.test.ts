import { describe, expect, it } from 'vitest';

import type { PilotListItemDto } from '../../api/dto';
import {
  createBodyOf,
  deleteBlocker,
  draftKey,
  draftOf,
  EMPTY_ACCOUNT,
  hasChanges,
  normalizeCode,
  updateBodyOf,
  verdictOf,
} from './accountForm';

const pilot: PilotListItemDto = {
  id: 'p-1',
  code: 'TMK',
  name: 'Tomasz Małkiewicz',
  email: 't.malkiewicz@uzaero.pl',
  active: true,
  role: 'pilot',
};

const filled = { ...EMPTY_ACCOUNT, code: 'TMK', name: 'Tomasz Małkiewicz' };

describe('kod pilota', () => {
  it('normalizuje do wersalików, jak serwer', () => {
    expect(normalizeCode(' kza ')).toBe('KZA');
  });

  it('przyjmuje litery i cyfry', () => {
    expect(verdictOf({ ...filled, code: 'AN2' }).blocker).toBeNull();
  });

  it('odrzuca znaki spoza liter i cyfr - z myślnikiem włącznie', () => {
    // Rejestracja samolotu myślnik ma, kod pilota nie - i to jest różnica serwera,
    // nie przeoczenie panelu.
    const verdict = verdictOf({ ...filled, code: 'TM-K' });
    expect(verdict.invalid).toContain('code');
    expect(verdict.blocker).toBe('Kod pilota: tylko litery i cyfry.');
  });

  it('odrzuca kod za krótki i za długi', () => {
    expect(verdictOf({ ...filled, code: 'T' }).invalid).toContain('code');
    expect(verdictOf({ ...filled, code: 'ABCDEFGHIJK' }).invalid).toContain('code');
  });
});

describe('e-mail', () => {
  it('pusty jest POPRAWNY - pilot loguje się kodem', () => {
    expect(verdictOf({ ...filled, email: '' }).blocker).toBeNull();
  });

  it('wpisany musi wyglądać jak adres', () => {
    expect(verdictOf({ ...filled, email: 'tomek' }).invalid).toContain('email');
    expect(verdictOf({ ...filled, email: 'tomek@klub.pl' }).blocker).toBeNull();
  });
});

describe('werdykt', () => {
  it('PUSTY formularz nie dostaje ani zdania, ani czerwonych ramek', () => {
    // Reguła z aplikacji pilota (issue #55): „wiadomo, że jak pole jest wymagane, to
    // dlatego przycisk jest nieczynny". Zdanie „wpisz kod pilota" nad pustym polem
    // opisywało stan widoczny gołym okiem, a czerwona ramka karciła kogoś, kto
    // jeszcze nic nie zdążył zrobić.
    const verdict = verdictOf(EMPTY_ACCOUNT);
    expect(verdict.complete).toBe(false);
    expect(verdict.blocker).toBeNull();
    expect(verdict.invalid).toEqual([]);
  });

  it('wpis NIECZYTELNY dostaje jedno zdanie - pierwsze w kolejności formularza', () => {
    const verdict = verdictOf({ ...EMPTY_ACCOUNT, code: 'TM-K', email: 'nie-adres' });
    // Puste nazwisko nie jest błędem, tylko brakiem - więc nie ma go w `invalid`.
    expect(verdict.invalid).toEqual(['code', 'email']);
    expect(verdict.complete).toBe(false);
    // Przycisk jest jeden, więc zdanie też - i jest tym, od którego się zaczyna.
    expect(verdict.blocker).toBe('Kod pilota: tylko litery i cyfry.');
  });

  it('komplet poprawnych pól przechodzi', () => {
    expect(verdictOf(filled)).toEqual({ invalid: [], complete: true, blocker: null });
  });
});

describe('ciało żądania', () => {
  it('POST niesie kod wersalikami i przycięte pola', () => {
    expect(createBodyOf({ code: ' tmk ', name: ' Anna Wrzosek ', email: ' a@b.pl ', role: 'admin' })).toEqual({
      code: 'TMK',
      name: 'Anna Wrzosek',
      email: 'a@b.pl',
      role: 'admin',
    });
  });

  it('PATCH niesie WYŁĄCZNIE to, co się zmieniło', () => {
    const draft = { ...draftOf(pilot), role: 'admin' as const };
    expect(updateBodyOf(pilot, draft)).toEqual({ role: 'admin' });
  });

  it('otwarcie i zapisanie konta BEZ zmian nie jest zmianą', () => {
    expect(updateBodyOf(pilot, draftOf(pilot))).toEqual({});
    expect(hasChanges(pilot, draftOf(pilot))).toBe(false);
  });

  it('kod zapisany małymi literami NIE udaje zmiany', () => {
    // Konto `admin` z seeda ma kod małymi literami, bo wiersz powstał w bazie
    // z pominięciem trasy, która wersalikuje. Panel porównywał wpis PO normalizacji
    // z wartością SPRZED niej, więc samo otwarcie takiego konta zapalało „Zapisz",
    // a zapis po cichu zmieniał kod na `ADMIN` - czyli etykietę w arkuszu klubu
    // i przy wyborze drugiego pilota. Złapane dopiero w przeglądarce.
    const seeded = { ...pilot, code: 'admin' };
    expect(updateBodyOf(seeded, draftOf(seeded))).toEqual({});
    expect(hasChanges(seeded, draftOf(seeded))).toBe(false);
  });

  it('ale ZMIANA kodu na inny jedzie dalej wersalikami', () => {
    const seeded = { ...pilot, code: 'admin' };
    expect(updateBodyOf(seeded, { ...draftOf(seeded), code: 'szef' })).toEqual({ code: 'SZEF' });
  });

  it('konto bez e-maila: puste pole nie udaje zmiany', () => {
    // `null` z serwera i `''` w polu znaczą to samo. Bez normalizacji samo otwarcie
    // takiego konta wyglądałoby na zmianę i wysyłałoby PATCH przy każdym zapisie.
    const noEmail = { ...pilot, email: null };
    expect(hasChanges(noEmail, draftOf(noEmail))).toBe(false);
  });

  it('wyczyszczenie e-maila JEST zmianą i jedzie jako pusty napis', () => {
    // Serwer zamienia `''` na `null`; wysłanie `null` odbiłoby się o walidację.
    expect(updateBodyOf(pilot, { ...draftOf(pilot), email: '' })).toEqual({ email: '' });
  });
});

describe('kiedy wolno usunąć konto', () => {
  const off = { ...pilot, active: false };

  it('konto wyłączone i cudze - próba ma sens', () => {
    expect(deleteBlocker(off, 'inny-admin')).toBeNull();
  });

  it('konto Z DOSTĘPEM blokuje, bo usuwanie jest dwustopniowe', () => {
    // Telefon nie kasuje wierszy, więc konto usunięte „na gorąco" zostałoby na nim
    // jako aktywne. Wyłączenie dociera normalną drogą i dopiero po nim wolno kasować.
    expect(deleteBlocker(pilot, 'inny-admin')).toBe('Najpierw wyłącz konto.');
  });

  it('WŁASNE konto blokuje, nawet gdy jest już wyłączone', () => {
    // Kolejność sprawdzeń ma znaczenie: „to Twoje konto" jest odpowiedzią trafniejszą
    // niż „najpierw wyłącz", bo wyłączenie własnego konta i tak jest zabronione.
    expect(deleteBlocker(off, off.id)).toBe('To Twoje konto.');
    expect(deleteBlocker(pilot, pilot.id)).toBe('To Twoje konto.');
  });

  it('nie orzeka o HISTORII - tego panel nie wie', () => {
    // Lista nie niesie liczby lotów, więc „chyba da się usunąć" byłoby obietnicą bez
    // pokrycia przy akcji nieodwracalnej. Ten warunek wraca odmową serwera.
    expect(deleteBlocker(off, null)).toBeNull();
  });
});

describe('klucz synchronizacji szkicu', () => {
  it('nowe konto ma klucz od razu', () => {
    expect(draftKey(true, null)).toBe('nowy');
  });

  it('BRAK klucza, dopóki konta nie ma na liście', () => {
    // To jest cała treść tej funkcji: przy wejściu z linku szuflada montuje się PRZED
    // listą. Bez tego formularz przestawiał się raz, na pusty, i taki zostawał -
    // z blokadą „wpisz kod pilota" nad kontem, które istnieje. Złapane w przeglądarce.
    expect(draftKey(false, null)).toBeNull();
  });

  it('klucz to TOŻSAMOŚĆ konta, więc odświeżenie listy go nie rusza', () => {
    // Dzięki temu przeładowanie danych po zapisie nie kasuje wpisanych zmian.
    expect(draftKey(false, pilot)).toBe('p-1');
    expect(draftKey(false, { ...pilot, name: 'Inne nazwisko' })).toBe('p-1');
  });
});
