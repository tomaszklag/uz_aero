/**
 * UZ Aero - arkusz „DOŁĄCZ DO KLUBU" (mockup `13a`, wielofirmowość §3.8).
 *
 * To samo pole, co na 00E, dla pilota, który już w jakimś klubie lata: zgłoszenie
 * dopisuje się do listy klubów jako wiersz „czeka na zatwierdzenie", a pilot pracuje
 * dalej tam, gdzie był.
 *
 * Arkusz ma JEDNO pytanie, więc nie tłumaczy, skąd wziąć kod - mówi to podpis wejścia
 * na ekranie („kod klubu od jego administratora"). Odmowy serwera zachowują się jak
 * na 00E: nieznany kod to zdanie PRZY POLU (pola nie czyścimy - pilot poprawia to, co
 * wpisał), a limit prób i brak sieci to powód W PRZYCISKU (issue #55).
 */

import React, { useState } from 'react';

import { Sheet } from './Sheet';
import { TextField } from '../input/Field';
import { useAuthStore } from '../../store/authStore';
import { clubCodeComplete, maskClubCodeInput } from '../../screens/logic/clubCode';

export interface JoinClubSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Zgłoszenie przyjęte - wołający odświeża listę klubów. */
  onJoined: () => void;
}

export function JoinClubSheet({ visible, onClose, onJoined }: JoinClubSheetProps) {
  const joinClub = useAuthStore((s) => s.joinClub);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const close = (): void => {
    setCode('');
    setError(null);
    setBlocked(null);
    onClose();
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setBlocked(null);
    const result = await joinClub(code);
    if (result.kind === 'error') setError(result.message);
    else if (result.kind === 'blocked') setBlocked(result.reason);
    else {
      onJoined();
      close();
    }
  };

  return (
    <Sheet
      visible={visible}
      title="DOŁĄCZ DO KLUBU"
      onCancel={close}
      confirmLabel="DOŁĄCZ"
      // Puste pole blokuje BEZ zdania - widać je z kontrolki nad przyciskiem
      // (wąski wyjątek issue #55).
      confirmDisabled={!clubCodeComplete(code)}
      confirmDisabledReason={blocked ?? undefined}
      onConfirm={() => void submit()}
    >
      <TextField
        label="Kod klubu"
        mono
        value={code}
        onChangeText={(raw) => {
          setCode(maskClubCodeInput(raw));
          setError(null);
        }}
        error={error}
        placeholder="np. AZG-7K4M"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
      />
    </Sheet>
  );
}
