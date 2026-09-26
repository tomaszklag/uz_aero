/**
 * Ninerdeck - panel: TREŚĆ ekranu „Brak dostępu" (issue #216, makieta `brak-dostepu`).
 *
 * Moduł CZYSTY (bez Reacta): to jest decyzja o tym, co człowiek przeczyta pod adresem
 * nie dla siebie - a ta treść ma dokładnie trzy zadania: nazwać, CO tu jest, powiedzieć,
 * CZEGO brakuje, i wskazać, KOGO prosić. Bez trzeciego zdania kłódka jest wyłącznie
 * informacją, że coś nie działa (`auth/can.ts`).
 *
 * ══ TRZY RÓŻNE ROZMOWY, TRZY BRZMIENIA ══
 *  • członek klubu pod modułem klubu - brakuje ZDOLNOŚCI: nazywamy ją tak, jak nazywa ją
 *    karta członka (`CAPABILITY_LABELS`), i odsyłamy do administratora klubu;
 *  • członek klubu pod modułem PLATFORMY - nie ma czego nadać: kluby i zgłoszenia
 *    z aplikacji prowadzi opiekun platformy (`docs/wielofirmowosc.md` §3.3). Zdanie
 *    „poproś administratora" byłoby tu obietnicą bez pokrycia;
 *  • sesja PLATFORMY pod ekranem klubu - to nie brak prawa, tylko zły zakres: ekran
 *    otwiera sesja klubu, w którym ta osoba jest członkiem.
 */

import type { Capability } from '../../api/dto';
import { denialReason } from '../../auth/can';
import { CAPABILITY_LABELS, CLUB_CAPABILITIES } from '../accounts/scope';
import type { Access, SessionKind } from '../../ui/shell/nav';

export interface NoAccessCopy {
  title: string;
  /** Plakietka pod tytułem - kto nadaje albo czym to jest. */
  reason: string;
  note: string;
}

const isClubCapability = (access: Access): access is Capability =>
  access !== 'club' && CLUB_CAPABILITIES.includes(access);

export function noAccessCopy(access: Access, kind: SessionKind): NoAccessCopy {
  if (kind === 'platform') {
    return {
      title: 'Ten ekran należy do klubu',
      reason: 'Zakres platformy',
      note: 'Ta sesja pracuje na platformie. Ten ekran otwiera sesja klubu, w którym jesteś członkiem.',
    };
  }

  if (isClubCapability(access)) {
    const label = CAPABILITY_LABELS[access].label;
    return {
      title: 'Ten moduł jest poza Twoim zakresem',
      reason: denialReason(access),
      note: `Otwiera go zdolność „${label}". Zakres zmienia administrator klubu w karcie członka - poproś go, jeśli ten ekran jest Ci potrzebny.`,
    };
  }

  if (access === 'club') {
    // Sesja klubu ZAWSZE ma dostęp `'club'` - ta gałąź jest stanem niemożliwym, ale
    // funkcja ma odpowiedzieć zdaniem, a nie wyjątkiem: ekran nie jest miejscem na awarię.
    return {
      title: 'Ten ekran jest poza Twoim zakresem',
      reason: denialReason('panel.access'),
      note: 'Zakres zmienia administrator klubu w karcie członka - poproś go, jeśli ten ekran jest Ci potrzebny.',
    };
  }

  return {
    title: 'To moduł opiekuna platformy',
    reason: 'Poza klubem',
    note: 'Kluby i zgłoszenia z aplikacji prowadzi opiekun platformy, nie klub - nie ma zdolności, którą klub mógłby tu nadać.',
  };
}
