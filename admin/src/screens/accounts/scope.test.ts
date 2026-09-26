/**
 * Ninerdeck - panel: ZAKRES UPRAWNIEŃ (epik #197).
 *
 * Trzy rzeczy, których złamanie zmienia znaczenie ekranu, a nie jego wygląd:
 *  1. nazwa zakresu liczy się ZE ZBIORU - nic jej nie przechowuje, więc nie ma jak
 *     rozjechać się z uprawnieniami;
 *  2. „własny zakres" nie jest zestawem, tylko nazwą stanu „żaden skrót nie pasuje";
 *  3. zdolność, której panel nie zna, PRZEŻYWA edycję - formularz wysyła zbiór, który
 *     dostał, a nie zbiór, który umiał narysować.
 */

import { describe, expect, it } from 'vitest';

import type { Capability } from '../../api/dto';
import {
  CAPABILITY_LABELS,
  CLUB_CAPABILITIES,
  presetOf,
  SCOPE_PRESETS,
  scopeLabel,
  scopeSummary,
  scopeTone,
  toggleCapability,
} from './scope';

describe('nazwa zakresu', () => {
  it('pusty zbiór to PILOT - stan domyślny członka, nie brak danych', () => {
    expect(scopeLabel([])).toBe('Pilot');
    expect(scopeTone([])).toBe('dim');
  });

  it('komplet zdolności klubowych to ADMINISTRATOR', () => {
    expect(scopeLabel(CLUB_CAPABILITIES)).toBe('Administrator');
    expect(scopeTone(CLUB_CAPABILITIES)).toBe('blue');
  });

  it('KOLEJNOŚĆ NIE JEST INFORMACJĄ - ten sam zbiór w innej kolejności to ten sam zestaw', () => {
    expect(scopeLabel(['fleet.manage', 'panel.access', 'fleet.watch'])).toBe('Technik');
    expect(scopeLabel(['fleet.watch', 'panel.access', 'fleet.manage'])).toBe('Technik');
  });

  it('zbiór spoza katalogu zestawów to WŁASNY ZAKRES, a nie najbliższy zestaw', () => {
    // Zaokrąglanie do „najbliższego" zestawu byłoby kłamstwem o uprawnieniach: ekran
    // napisałby „technik", a człowiek miałby o jedną zdolność więcej.
    expect(scopeLabel(['panel.access', 'fleet.manage', 'audit.read'])).toBe('Własny zakres');
    expect(scopeTone(['panel.access', 'fleet.manage', 'audit.read'])).toBe('amber');
    // Technik SPRZED 3.2.0 (bez obserwowania) też jest własnym zakresem - nikomu nic nie
    // odjęto, ale zestaw w nowym brzmieniu ma o jedną pozycję więcej (issue #205, §3.2).
    expect(scopeLabel(['panel.access', 'fleet.manage'])).toBe('Własny zakres');
  });

  it('każdy zestaw katalogu nazywa się SOBĄ - inaczej lista proponowałaby nieosiągalny stan', () => {
    for (const preset of SCOPE_PRESETS) {
      expect(scopeLabel(preset.capabilities)).toBe(preset.label);
      expect(presetOf(preset.capabilities)?.id).toBe(preset.id);
    }
  });
});

describe('katalog zdolności', () => {
  it('zdolności PLATFORMOWE nie stoją na liście klubu', () => {
    // Wpuszczenie ich na ekran zakresu obiecywałoby władzę, której serwer nie nada:
    // `platform.manage` i `bugs.triage` wynikają z roli platformowej, nie z członkostwa.
    expect(CLUB_CAPABILITIES).not.toContain('platform.manage');
    expect(CLUB_CAPABILITIES).not.toContain('bugs.triage');
  });

  it('każda zdolność ma JEDNO zdanie o tym, co otwiera', () => {
    for (const capability of CLUB_CAPABILITIES) {
      const { label, desc } = CAPABILITY_LABELS[capability];
      expect(label.length).toBeGreaterThan(3);
      // Jedno zdanie, nie akapit - opis w karcie wyboru ma się zmieścić w linii.
      expect(desc.split('.').filter((part) => part.trim() !== '')).toHaveLength(1);
    }
  });

  it('„Administrator" to DOKŁADNIE lista klubowa - zestaw nie może obiecywać więcej', () => {
    const admin = SCOPE_PRESETS.find((p) => p.id === 'admin')!;
    expect([...admin.capabilities].sort()).toEqual([...CLUB_CAPABILITIES].sort());
  });
});

describe('podpis karty', () => {
  it('pusty zbiór mówi zdaniem, a nie „0 z 9" - to stan domyślny, nie usterka', () => {
    expect(scopeSummary([])).toContain('Bez zdolności');
  });

  it('podaje LICZBĘ i nazwy, a przy długiej liście skraca', () => {
    expect(scopeSummary(['reservations.manage'])).toBe(
      'Nadane 1 z 11 zdolności · Cudze rezerwacje',
    );
    expect(scopeSummary(CLUB_CAPABILITIES)).toContain('11 z 11');
    expect(scopeSummary(CLUB_CAPABILITIES)).toContain('i 8 więcej');
  });

  it('zdolność NIEZNANA panelowi nie wywraca podpisu - po prostu się nie liczy', () => {
    const fromFuture: Capability[] = ['reservations.manage', 'nowa.zdolnosc' as Capability];
    expect(scopeSummary(fromFuture)).toBe('Nadane 1 z 11 zdolności · Cudze rezerwacje');
  });
});

describe('przełączanie pojedynczej zdolności', () => {
  it('dokłada i zdejmuje', () => {
    expect(toggleCapability([], 'audit.read')).toEqual(['audit.read']);
    expect(toggleCapability(['audit.read'], 'audit.read')).toEqual([]);
  });

  it('zbiór zostaje w kolejności KATALOGU, nie klikania', () => {
    // Stabilna kolejność sprawia, że diff w dzienniku nadzoru czyta się tak samo za
    // każdym razem - serwer i tak porównuje zbiory, więc to jest wyłącznie czytelność.
    const picked = toggleCapability(toggleCapability([], 'audit.read'), 'panel.access');
    expect(picked).toEqual(['panel.access', 'audit.read']);
  });

  it('ZDOLNOŚĆ NIEZNANA PRZEŻYWA edycję innej pozycji', () => {
    // Wdrożenie serwera idzie pierwsze, więc panel bywa o wersję w tyle. Gdyby formularz
    // wysyłał wyłącznie to, co umiał narysować, pierwsza edycja kodu pilota po cichu
    // odbierałaby uprawnienie, o którym panel jeszcze nie wie.
    const withFuture = ['nowa.zdolnosc' as Capability, 'panel.access' as Capability];
    expect(toggleCapability(withFuture, 'audit.read')).toContain('nowa.zdolnosc');
  });
});
