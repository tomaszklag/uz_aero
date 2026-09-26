/**
 * Ninerdeck - panel: ekran „Brak dostępu" (issue #216) - trzy rozmowy, trzy brzmienia.
 *
 * Pod testem jest TREŚĆ, nie układ: członek pod modułem klubu ma usłyszeć nazwę
 * zdolności i kogo prosić; pod modułem platformy - że nie ma o co prosić; sesja
 * platformy pod ekranem klubu - że to zły zakres, nie brak prawa.
 */

import { describe, expect, it } from 'vitest';

import { noAccessCopy } from './noAccess';

describe('brak dostępu - treść', () => {
  it('członek klubu pod modułem klubu: nazwa zdolności z karty członka i kogo prosić', () => {
    const copy = noAccessCopy('panel.access', 'org');
    expect(copy.title).toBe('Ten moduł jest poza Twoim zakresem');
    expect(copy.reason).toBe('Nadaje: administrator klubu');
    expect(copy.note).toContain('„Podgląd klubu"');
    expect(copy.note).toContain('administrator klubu');
  });

  it('członek klubu pod modułem PLATFORMY: nie ma czego nadać - żadnego „poproś"', () => {
    for (const access of ['bugs.triage', 'platform.manage'] as const) {
      const copy = noAccessCopy(access, 'org');
      expect(copy.title).toBe('To moduł opiekuna platformy');
      expect(copy.note).not.toContain('poproś');
      expect(copy.reason).not.toContain('Nadaje');
    }
  });

  it('sesja PLATFORMY pod ekranem klubu: zły zakres, nie brak prawa', () => {
    for (const access of ['club', 'panel.access'] as const) {
      const copy = noAccessCopy(access, 'platform');
      expect(copy.title).toBe('Ten ekran należy do klubu');
      expect(copy.note).toContain('sesja klubu');
      expect(copy.reason).not.toContain('Nadaje');
    }
  });

  it('każde zdanie mieści się w dwóch linijkach - jak reszta napisów panelu', () => {
    for (const kind of ['org', 'platform'] as const) {
      for (const access of ['panel.access', 'accounts.manage', 'bugs.triage', 'club'] as const) {
        const copy = noAccessCopy(access, kind);
        for (const text of [copy.title, copy.reason, copy.note]) {
          expect(text.length, text).toBeLessThanOrEqual(160);
        }
      }
    }
  });
});
