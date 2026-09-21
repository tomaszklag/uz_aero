import { describe, expect, it } from 'vitest';

import type { OrganizationDetailDto } from '../../api/dto';
import {
  createBodyOf,
  draftOf,
  EMPTY_ORGANIZATION,
  hasChanges,
  patchBodyOf,
  slugFrom,
  verdictOf,
  type OrganizationDraft,
} from './organizationForm';

const draft = (over: Partial<OrganizationDraft> = {}): OrganizationDraft => ({
  ...EMPTY_ORGANIZATION,
  name: 'Klub Spadochronowy Gliwice',
  slug: 'ks-gliwice',
  adminName: 'Piotr Wróbel',
  adminEmail: 'piotr.wrobel@gmail.com',
  adminCode: 'PWR',
  ...over,
});

const organization = (over: Partial<OrganizationDetailDto> = {}): OrganizationDetailDto => ({
  id: 'org-a',
  name: 'Aeroklub Alfa',
  slug: 'aeroklub-alfa',
  active: true,
  timezone: 'Europe/Warsaw',
  homeIcao: null,
  homeAirfieldName: null,
  createdAt: '2026-08-26T10:00:00.000Z',
  members: 14,
  aircraft: 4,
  admins: [],
  joinCode: 'AZG7K4M',
  joinCodeFormatted: 'AZG-7K4M',
  joinCodeSince: '2026-08-26T10:00:00.000Z',
  ...over,
});

describe('adres podpowiedziany z nazwy', () => {
  it('zdejmuje polskie znaki i skleja myślnikami', () => {
    expect(slugFrom('Aeroklub Zielonogórski')).toBe('aeroklub-zielonogorski');
    expect(slugFrom('Klub Spadochronowy Gliwice')).toBe('klub-spadochronowy-gliwice');
  });

  it('`ł` NIE ROZKŁADA SIĘ przez NFD, więc ma własną regułę', () => {
    // Bez osobnego wiersza „Kółko" dawałoby `kko` - adres z dziurą w środku, i to
    // bez żadnego ostrzeżenia dla zakładającego klub.
    expect(slugFrom('Kółko Lotnicze')).toBe('kolko-lotnicze');
    expect(slugFrom('Łódź')).toBe('lodz');
  });

  it('nie zostawia myślników na brzegach ani podwójnych w środku', () => {
    expect(slugFrom('  Aeroklub   „Alfa" ')).toBe('aeroklub-alfa');
    expect(slugFrom('!!!')).toBe('');
  });
});

describe('ocena formularza klubu', () => {
  it('komplet pól przechodzi', () => {
    expect(verdictOf(draft(), 'create')).toEqual({ invalid: [], complete: true, blocker: null });
  });

  it('PUSTE POLE WYMAGANE nie dostaje zdania - widać je z formularza nad przyciskiem', () => {
    const verdict = verdictOf(draft({ adminEmail: '' }), 'create');

    expect(verdict.complete).toBe(false);
    expect(verdict.blocker).toBeNull();
    expect(verdict.invalid).toEqual([]);
  });

  it('wpis NIECZYTELNY dostaje ramkę I zdanie - ramka nie mówi, co jest nie tak', () => {
    const verdict = verdictOf(draft({ slug: 'Aeroklub Alfa' }), 'create');

    expect(verdict.invalid).toContain('slug');
    expect(verdict.blocker).toBe('Adres klubu: małe litery i cyfry rozdzielone myślnikami.');
  });

  it('zdanie jest JEDNO i pierwsze w kolejności wypełniania formularza', () => {
    const verdict = verdictOf(draft({ name: 'A', adminCode: 'p w r' }), 'create');

    expect(verdict.invalid).toEqual(['name', 'adminCode']);
    expect(verdict.blocker).toBe('Nazwa klubu: co najmniej 2 znaki.');
  });

  it('TRYB EDYCJI pyta wyłącznie o nazwę - adresu i administratora karta nie zmienia', () => {
    // Adres jest do odczytu, więc czerwona ramka pokazywałaby błąd, którego nie ma jak
    // poprawić; administratorów zmienia się w klubie, nie na platformie.
    const verdict = verdictOf(
      { ...EMPTY_ORGANIZATION, name: 'Aeroklub Alfa', slug: 'nie jest slugiem' },
      'edit',
    );

    expect(verdict).toEqual({ invalid: [], complete: true, blocker: null });
  });
});

describe('szkic → żądanie', () => {
  it('przycina wpisy i wersalikuje kod pilota', () => {
    expect(createBodyOf(draft({ name: '  Klub  ', adminCode: ' pwr ' }))).toEqual({
      name: 'Klub',
      slug: 'ks-gliwice',
      admin: { name: 'Piotr Wróbel', email: 'piotr.wrobel@gmail.com', code: 'PWR' },
    });
  });

  it('przy edycji zmianą jest WYŁĄCZNIE nazwa', () => {
    const before = organization();

    expect(hasChanges(before, draftOf(before))).toBe(false);
    expect(hasChanges(before, { ...draftOf(before), name: 'Aeroklub Beta' })).toBe(true);
    // Kod klubu i liczby zmieniają się bez udziału tego formularza - i nie są zmianą,
    // którą ma czym wysłać.
    expect(hasChanges(organization({ members: 20 }), draftOf(before))).toBe(false);
  });

  it('szkic z karty nie niesie pól administratora - karta ich nie edytuje', () => {
    expect(draftOf(organization())).toEqual({
      ...EMPTY_ORGANIZATION,
      name: 'Aeroklub Alfa',
      slug: 'aeroklub-alfa',
      timezone: 'Europe/Warsaw',
    });
  });

  // ── KALENDARZ KLUBU (3.0.0) ──────────────────────────────────────────────────────

  it('łatka niesie WYŁĄCZNIE to, co się zmieniło', () => {
    const before = organization({ homeIcao: 'EPKK', timezone: 'Europe/Warsaw' });
    const draft = { ...draftOf(before), name: 'Aeroklub Alfa i Omega' };

    expect(patchBodyOf(before, draft)).toEqual({ name: 'Aeroklub Alfa i Omega' });
  });

  it('kod lotniska idzie WERSALIKAMI, jak po stronie serwera', () => {
    const before = organization({ homeIcao: null });

    expect(patchBodyOf(before, { ...draftOf(before), homeIcao: ' epgl ' })).toEqual({
      homeIcao: 'EPGL',
    });
  });

  it('puste pole lotniska to `null`, czyli „wyczyść" - nie pusty napis', () => {
    const before = organization({ homeIcao: 'EPKK' });

    expect(patchBodyOf(before, { ...draftOf(before), homeIcao: '' })).toEqual({
      homeIcao: null,
    });
  });

  it('bez zmian łatka jest pusta, a „Zapisz" nie ma co wysłać', () => {
    const before = organization({ homeIcao: 'EPKK', timezone: 'Europe/Berlin' });
    const draft = draftOf(before);

    expect(patchBodyOf(before, draft)).toEqual({});
    expect(hasChanges(before, draft)).toBe(false);
  });

  it('wpisanie tego samego kodu inną wielkością liter NIE jest zmianą', () => {
    // Inaczej „Zapisz" ożywałby po samym tapnięciu w pole, a dziennik notowałby zmianę
    // z `EPKK` na `EPKK`.
    const before = organization({ homeIcao: 'EPKK' });

    expect(hasChanges(before, { ...draftOf(before), homeIcao: 'epkk' })).toBe(false);
  });
});
