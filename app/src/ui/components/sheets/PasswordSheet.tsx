/**
 * Ninerdeck - 13B: arkusz USTAWIENIA / ZMIANY HASŁA (makieta `design/13-ustawienia.html`
 * ramka `#haslo`; `docs/logowanie-haslem.md` §5.3, D4).
 *
 * Rama arkusza jak przy zmianie PIN-u (uchwyt, tytuł, akcja, „Anuluj"), ale BEZ numpada:
 * hasło to pełna klawiatura. Dwa pola - „Nowe hasło" i „Powtórz hasło"; przy haśle
 * ISTNIEJĄCYM dochodzi trzecie, „Obecne hasło", NA GÓRZE.
 *
 * ══ HASŁO NIE ZASTĘPUJE PIN-U ══
 * PIN otwiera TEN telefon, offline, każdego dnia; hasło loguje TĘ SAMĄ osobę na INNYM
 * urządzeniu - wspólnym tablecie w samolocie (00F). Dwie rzeczy o różnym zasięgu.
 *
 * ══ CZEGO ARKUSZ NIE MÓWI ══
 * Że zmiana hasła wylogowuje pozostałe urządzenia tej osoby - to opis działania serwera,
 * nie instrukcja dla pilota (issue #72). Nie ma też paska „siły hasła": polityka jest
 * DŁUGOŚCIĄ, a pasek udawałby pomiar, którego nie ma.
 *
 * Pusty, za krótki albo rozjechany wpis blokuje „ZAPISZ HASŁO" BEZ zdania w przycisku -
 * widać go z pól wyżej (wąski wyjątek issue #55). Zdanie zostaje dla odmów, których
 * z ekranu nie widać: limitu prób, braku sieci i konta bez adresu.
 */

import React, { useEffect, useState } from 'react';

import { useSheetInputFocus } from '../../hooks/useSheetInputFocus';
import type { SetPasswordNotice } from '../../screens/logic/loginMessage';
import {
  EMPTY_PASSWORD_DRAFT,
  passwordVerdict,
  type PasswordDraft,
  type PasswordIdentity,
} from '../../screens/logic/passwordForm';
import { PasswordField } from '../input/PasswordField';
import { Sheet } from './Sheet';

export interface PasswordSheetProps {
  visible: boolean;
  /** Czy osoba MA już hasło - decyduje o polu „Obecne" i o tytule arkusza. */
  hasPassword: boolean;
  identity: PasswordIdentity;
  /** Zapis; `null` = udało się, inaczej zdania do rozstawienia pod polami. */
  save: (current: string | null, next: string) => Promise<SetPasswordNotice>;
  onDone: () => void;
  onCancel: () => void;
}

export function PasswordSheet({
  visible,
  hasPassword,
  identity,
  save,
  onDone,
  onCancel,
}: PasswordSheetProps) {
  const { inputRef, onShow } = useSheetInputFocus();

  const [draft, setDraft] = useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);
  const [notice, setNotice] = useState<SetPasswordNotice | null>(null);
  const [busy, setBusy] = useState(false);

  // Każde otwarcie zaczyna od czystego formularza - arkusz nie pamięta porzuconej próby,
  // a zapamiętane hasło w pamięci komponentu byłoby sekretem trzymanym bez powodu.
  useEffect(() => {
    if (!visible) return;
    setDraft(EMPTY_PASSWORD_DRAFT);
    setNotice(null);
    setBusy(false);
  }, [visible]);

  const verdict = passwordVerdict(draft, identity, hasPassword);
  const title = hasPassword ? 'ZMIEŃ HASŁO' : 'USTAW HASŁO';

  const set = (patch: Partial<PasswordDraft>): void => {
    setDraft((prev) => ({ ...prev, ...patch }));
    // Odpowiedź serwera przestaje opisywać wartość w chwili, gdy pilot ją zmienia.
    setNotice(null);
  };

  const confirm = async (): Promise<void> => {
    setBusy(true);
    const result = await save(hasPassword ? draft.current : null, draft.next);
    setBusy(false);
    if (result.currentError == null && result.fieldError == null && result.blockReason == null) {
      onDone();
      return;
    }
    setNotice(result);
  };

  return (
    <Sheet
      visible={visible}
      title={title}
      confirmLabel="ZAPISZ HASŁO"
      confirmTone="green"
      confirmDisabled={!verdict.canSave || busy}
      confirmDisabledReason={notice?.blockReason ?? null}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
      /* Przycisku zgłoszenia błędu NIE podajemy: `Sheet` wstawia go sam w rząd uchwytu
         (issue #87), a `headerAction` to linia tytułu - miejsce kosza. */
      /* Klawiatura od otwarcia - drabinka prób z `useSheetInputFocus` (issue #58 pkt 7).
         Tu wchodzi zawsze, bo arkusz startuje PUSTY i nie ma czego przesuwać: reguła
         `stepperOpensForTyping` w wersji dla formularza z samymi polami wpisu. */
      onShow={onShow}
    >
      {hasPassword && (
        <PasswordField
          inputRef={inputRef}
          label="Obecne hasło"
          value={draft.current}
          onChangeText={(current) => set({ current })}
          error={notice?.currentError ?? null}
          autoComplete="current-password"
          textContentType="password"
        />
      )}

      <PasswordField
        // Klawiatura celuje w PIERWSZE pole arkusza - przy zmianie hasła jest nim
        // „Obecne", przy pierwszym ustawieniu to.
        {...(hasPassword ? {} : { inputRef })}
        label="Nowe hasło"
        value={draft.next}
        onChangeText={(next) => set({ next })}
        // Podpowiedź polityki PO wpisie; bursztyn, dopóki wartość jej nie spełnia.
        // Odmowa serwera wypiera ją tym samym zdaniem, które ekran już pokazał.
        hint={verdict.hint ?? undefined}
        hintTone={verdict.hintWarns ? 'amber' : undefined}
        error={notice?.fieldError ?? null}
        autoComplete="new-password"
        textContentType="newPassword"
      />

      <PasswordField
        label="Powtórz hasło"
        value={draft.repeat}
        onChangeText={(repeat) => set({ repeat })}
        error={verdict.repeatError}
        autoComplete="new-password"
        textContentType="newPassword"
      />
    </Sheet>
  );
}
