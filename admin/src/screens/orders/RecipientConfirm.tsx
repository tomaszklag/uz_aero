/**
 * Ninerdeck - panel: PYTANIE W MIEJSCU WIERSZA przy „Odbierz zlecenie" i „Cofnij przydział"
 * (makieta `zlecenia-szczegoly`, ZL3b; 4.0.0, epik Z-D #248).
 *
 * Czerwona ramka `.confirm`, bo obie czynności komuś coś odbierają. Pytanie stawia nazwisko
 * w mianowniku po dwukropku, zdanie pod nim mówi skutek PRZED kliknięciem, a powód jest
 * opcjonalny (pkt 16) - przycisk działa od razu, a zdanie, jeśli jest, druga strona czyta
 * jako treść wiadomości. Treść liczy `confirmCopy` w `recipientMenu.ts`.
 *
 * Fokus wchodzi na pole powodu: pozycja menu, z której przyszło pytanie, znika razem
 * z menu, a fokus na czerwonym przycisku oddawałby Enterowi czynność, której nie da się
 * cofnąć.
 */

import { useEffect, useRef } from 'react';

import { Button, Field, TextInput } from '../../ui/components';
import type { ConfirmCopy } from './recipientMenu';

interface Props {
  id: string;
  copy: ConfirmCopy;
  reason: string;
  busy: boolean;
  /** Zdanie odmowy serwera; `null` = nic się nie stało. */
  error: string | null;
  onReason: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RecipientConfirm({ id, copy, reason, busy, error, onReason, onCancel, onConfirm }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);

  return (
    <div ref={root} className="confirm">
      <p className="confirm-q">{copy.question}</p>
      <p className="hint">{copy.hint}</p>
      <Field htmlFor={id} label="Powód" action={<span className="pill dim">opcjonalne</span>}>
        <TextInput id={id} value={reason} maxLength={500} placeholder={copy.placeholder} onChange={(e) => onReason(e.target.value)} />
      </Field>
      {error == null ? null : <p className="hint danger">{error}</p>}
      <div className="confirm-actions">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Anuluj
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
          {copy.confirm}
        </Button>
      </div>
    </div>
  );
}
