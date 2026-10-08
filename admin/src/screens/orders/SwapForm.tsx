/**
 * Ninerdeck - panel: „Zamień osobę" przy fotelu imiennym (makieta `zlecenia-szczegoly`,
 * ZL3b; 4.0.0, epik Z-D #248).
 *
 * Usunięcie i dopisanie w JEDNYM ruchu (pkt 29), więc fotel dalej obsadza przyjęcie -
 * teraz nowej osoby. Formularz stoi w karcie fotela pod wierszem osoby wychodzącej, bez
 * czerwonej ramki: zamiana niczego nie kasuje, tylko podmienia adresata. Wybór z listy
 * członków to `<select>` (zbiór rośnie z klubem), a zdanie pod polami mówi, co dostanie
 * każda ze stron. Bez wyboru „Zamień osobę" jest nieaktywne bez zdania - pusty wybór
 * widać nad przyciskiem (issue #55). Listę i zdanie liczy `recipientMenu.ts`. Fokus wchodzi
 * na listę osób - pozycja menu, z której przyszedł formularz, znika razem z menu.
 */

import { useEffect, useRef } from 'react';

import { Button, Field, Select, TextInput } from '../../ui/components';
import type { SwapOption } from './recipientMenu';

interface Props {
  id: string;
  options: readonly SwapOption[];
  pick: string;
  reason: string;
  hint: string;
  busy: boolean;
  error: string | null;
  onPick: (pilotId: string) => void;
  onReason: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SwapForm({ id, options, pick, reason, hint, busy, error, onPick, onReason, onCancel, onConfirm }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLSelectElement>('select')?.focus();
  }, []);

  return (
    <div ref={root}>
      <Field htmlFor={`${id}-who`} label="Zamień na">
        <Select
          id={`${id}-who`}
          value={pick}
          options={[{ value: '', label: 'Wybierz osobę' }, ...options.map((o) => ({ value: o.value, label: o.label }))]}
          onChange={onPick}
        />
      </Field>
      <Field htmlFor={`${id}-reason`} label="Powód" action={<span className="pill dim">opcjonalne</span>}>
        <TextInput
          id={`${id}-reason`}
          value={reason}
          maxLength={500}
          placeholder="Np. zmiana planu - leci instruktor"
          onChange={(e) => onReason(e.target.value)}
        />
      </Field>
      <p className="hint">{hint}</p>
      {error == null ? null : <p className="hint danger">{error}</p>}
      <div className="confirm-actions">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Anuluj
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={busy || pick === ''}>
          Zamień osobę
        </Button>
      </div>
    </div>
  );
}
