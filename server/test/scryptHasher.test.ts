/**
 * Ninerdeck (serwer) - SKRÓT HASŁA: scrypt w zapisie PHC (2.1.0, issue #132 B2;
 * `docs/logowanie-haslem.md` §3 D3, §8 pkt 1).
 *
 * Reszta serwera widzi hasher przez port i sprawdza go pośrednio (`passwordLogin.test.ts`:
 * skrót zastępczy przy nieznanym loginie, re-hash po udanym logowaniu). Ten plik pyta
 * o rzeczy, których stamtąd nie widać, a od których zależy, czy wyciek tabeli haseł jest
 * groźny:
 *
 *  • **parametry idą W NAPISIE, nie w kodzie** - skrót policzony słabszym kosztem musi
 *    dalej się weryfikować, inaczej podniesienie kosztu wylogowałoby wszystkich naraz;
 *  • **`needsRehash` jest jedynym sygnałem do przeliczenia** - gdyby milczał, koszt
 *    podniósłby się wyłącznie dla kont założonych po zmianie i nikt by tego nie zauważył;
 *  • **obcy zapis to `false`, nie wyjątek** - wiersz z innego systemu ma odbić logowanie,
 *    a nie wywrócić trasę na 500;
 *  • **PARAMETRY PRODUKCYJNE MUSZĄ SIĘ POLICZYĆ** - N=2¹⁷ przy r=8 potrzebuje 128 MiB,
 *    czyli czterokrotnie więcej niż domyślny `maxmem` Node'a. Bez jawnego `maxmem`
 *    scrypt rzuca i to jest błąd, który pojawia się WYŁĄCZNIE na produkcji: testy jadą
 *    na tanich parametrach, a `ln=10` mieści się w domyślnym limicie.
 *
 * Testy jadą na `ln=8`/`ln=10` (ten sam kod, kilkaset razy mniej pracy); jeden przypadek
 * liczy prawdziwe parametry produkcyjne i dlatego trwa dłużej niż reszta pliku razem.
 */

import { describe, expect, it } from 'vitest';

import { ScryptHasher, SCRYPT_DEFAULT_PARAMS, parsePhc } from '../src/infrastructure/auth/scryptHasher.ts';

const PASSWORD = 'zielone-smiglo-leci-2026';
const cheap = new ScryptHasher({ ln: 8 });

describe('ScryptHasher - zapis PHC i weryfikacja', () => {
  it('skrót weryfikuje się własnym hasłem, a cudzym nie', async () => {
    const phc = await cheap.hash(PASSWORD);
    expect(await cheap.verify(PASSWORD, phc)).toBe(true);
    expect(await cheap.verify(PASSWORD + 'x', phc)).toBe(false);
    expect(await cheap.verify('', phc)).toBe(false);
  });

  it('niesie parametry i sól w napisie, w zapisie PHC bez dopełnienia base64', async () => {
    const phc = await cheap.hash(PASSWORD);
    expect(phc).toMatch(/^\$scrypt\$ln=8,r=8,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);

    // Dopełnienia `=` nie ma w SEGMENTACH base64 (samo `=` w napisie jest - siedzi
    // w `ln=8,r=8,p=1`). PHC dopełnienia nie używa, a `parsePhc` go nie przyjmuje.
    const [, , , salt, hash] = phc.split('$');
    expect(salt).not.toContain('=');
    expect(hash).not.toContain('=');

    const parsed = parsePhc(phc)!;
    expect(parsed.params).toEqual({ ln: 8, r: 8, p: 1 });
    expect(parsed.salt).toHaveLength(16);
    expect(parsed.hash).toHaveLength(32);
  });

  it('sól jest LOSOWA - to samo hasło daje dwa różne skróty i oba pasują', async () => {
    const [a, b] = await Promise.all([cheap.hash(PASSWORD), cheap.hash(PASSWORD)]);
    expect(a).not.toBe(b);
    expect(await cheap.verify(PASSWORD, a)).toBe(true);
    expect(await cheap.verify(PASSWORD, b)).toBe(true);
  });

  it('SKRÓT ZE SŁABSZYCH PARAMETRÓW DALEJ SIĘ WERYFIKUJE, a `needsRehash` go zgłasza', async () => {
    // To jest cała treść zapisu PHC: podniesienie kosztu nie jest migracją, bo serwer
    // nie zna hasła, dopóki człowiek go nie wpisze. Stary wiersz przechodzi, a logowanie
    // przelicza go po udanym dowodzie.
    const old = await cheap.hash(PASSWORD);
    const stronger = new ScryptHasher({ ln: 10 });

    expect(await stronger.verify(PASSWORD, old)).toBe(true);
    expect(stronger.needsRehash(old)).toBe(true);
    expect(cheap.needsRehash(old)).toBe(false);
  });

  it('`needsRehash` pyta o KAŻDY parametr, nie tylko o koszt', async () => {
    const phc = await cheap.hash(PASSWORD);
    expect(new ScryptHasher({ ln: 8, r: 8, p: 1 }).needsRehash(phc)).toBe(false);
    expect(new ScryptHasher({ ln: 8, r: 16, p: 1 }).needsRehash(phc)).toBe(true);
    expect(new ScryptHasher({ ln: 8, r: 8, p: 2 }).needsRehash(phc)).toBe(true);
    // Koszt NIŻSZY niż w wierszu nie jest powodem do przeliczania - skrót mocniejszy
    // od bieżącej konfiguracji jest dobrym skrótem.
    expect(new ScryptHasher({ ln: 7 }).needsRehash(phc)).toBe(false);
  });

  it('obcy albo uszkodzony zapis: `verify` oddaje `false`, `needsRehash` żąda przeliczenia', async () => {
    const foreign = [
      '$argon2id$v=19$m=65536,t=3,p=4$c29s$aGFzaA',
      '$scrypt$ln=abc,r=8,p=1$c29s$aGFzaA',
      '$scrypt$ln=8,r=8,p=1$c29s', // bez skrótu
      'zwykły napis',
      '',
    ];
    for (const phc of foreign) {
      expect(parsePhc(phc), phc).toBeNull();
      await expect(cheap.verify(PASSWORD, phc), phc).resolves.toBe(false);
      expect(cheap.needsRehash(phc), phc).toBe(true);
    }
  });

  it('skrót UCIĘTY nie przechodzi - porównanie odrzuca różną długość, zamiast rzucić', async () => {
    // `timingSafeEqual` RZUCA przy różnej długości buforów, więc długość sprawdza się
    // przed nim. Bez tego wiersz przycięty w bazie wywracałby logowanie na 500.
    const phc = await cheap.hash(PASSWORD);
    const truncated = phc.slice(0, phc.length - 8);
    await expect(cheap.verify(PASSWORD, truncated)).resolves.toBe(false);
  });
});

describe('ScryptHasher - skrót zastępczy (§8 pkt 1)', () => {
  it('ma kształt prawdziwego skrótu i BIEŻĄCE parametry', () => {
    const dummy = cheap.dummyHash();
    expect(parsePhc(dummy)?.params).toEqual({ ln: 8, r: 8, p: 1 });
  });

  it('nie pasuje do żadnego hasła, a mimo to kosztuje tyle, co prawdziwy', async () => {
    const dummy = cheap.dummyHash();
    expect(await cheap.verify(PASSWORD, dummy)).toBe(false);
    expect(await cheap.verify('', dummy)).toBe(false);
  });

  it('jest JEDEN na egzemplarz hashera - liczy się raz, leniwie', () => {
    const hasher = new ScryptHasher({ ln: 8 });
    expect(hasher.dummyHash()).toBe(hasher.dummyHash());
    // …ale dwa hashery mają różne, więc wartość nie jest stałą w module.
    expect(new ScryptHasher({ ln: 8 }).dummyHash()).not.toBe(hasher.dummyHash());
  });
});

describe('ScryptHasher - parametry produkcyjne', () => {
  it('domyślne to zalecenie OWASP (N=2^17, r=8, p=1)', () => {
    expect(SCRYPT_DEFAULT_PARAMS).toEqual({ ln: 17, r: 8, p: 1 });
  });

  it('LICZĄ SIĘ NAPRAWDĘ - 128 MiB mieści się w `maxmem` (bez tego scrypt rzuca)', async () => {
    const production = new ScryptHasher();
    const phc = await production.hash(PASSWORD);

    expect(phc.startsWith('$scrypt$ln=17,r=8,p=1$')).toBe(true);
    expect(await production.verify(PASSWORD, phc)).toBe(true);
    expect(await production.verify('inne-haslo-zupelnie', phc)).toBe(false);
    expect(production.needsRehash(phc)).toBe(false);
  });
});
