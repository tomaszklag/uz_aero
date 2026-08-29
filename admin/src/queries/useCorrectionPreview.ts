/**
 * UZ Aero - panel: PODGLĄD korekty przed zapisem (`A02b`, dry-run).
 *
 * `useQuery`, a nie `useMutation`, mimo że pod spodem jedzie `POST`: to jest pytanie
 * bez skutków ubocznych („co się stanie, jeśli…"), a nie polecenie. Różnica jest
 * praktyczna, nie doktrynalna - zapytanie ma cache, więc przełączanie `retime` ↔ `void`
 * i powrót do wcześniej wpisanego czasu nie wołają serwera drugi raz o tę samą liczbę.
 *
 * ══ CZEGO TU NIE MA ══
 * Unieważnień. Podgląd niczego nie zmienia, więc nie ma czego odświeżać; a ponieważ
 * cały szkic korekty siedzi w kluczu, „nieaktualnego" podglądu w tym cache'u po prostu
 * nie ma - jest tylko podgląd innego pytania.
 */

import { useQuery } from '@tanstack/react-query';

import type { CorrectionDraftDto, CorrectionPreviewDto } from '../api/dto';
import { previewCorrection } from '../api/corrections';
import { isHttpError } from '../api/httpClient';
import { keys } from './keys';

export function useCorrectionPreview(
  sessionUuid: string,
  /** `null` = szkic jeszcze niekompletny (np. `retime` bez czytelnego czasu). */
  draft: CorrectionDraftDto | null,
) {
  return useQuery<CorrectionPreviewDto>({
    // `draft!` jest bezpieczne pod `enabled`: przy `null` zapytanie się nie wykonuje,
    // a klucz i tak musi być stabilnym literałem - takim samym jak przy pierwszym
    // kompletnym szkicu, inaczej cache gubiłby trafienia.
    queryKey: keys.corrections.preview(sessionUuid, draft ?? EMPTY_DRAFT),
    queryFn: () => previewCorrection(sessionUuid, draft!),
    enabled: sessionUuid !== '' && draft != null,
    // Odmowa serwera (403 bez zdolności, 404 przy złym uuid) nie naprawi się przez
    // powtórzenie. Powtarzamy wyłącznie awarie sieci. Odmowy „przy otwartym dniu"
    // już nie ma - bramka `400 day_open` znikła 2026-08-07, a kolizja z pilotem jedzie
    // w ciele odpowiedzi 200 jako `warnings`.
    retry: (attempt, error) => attempt < 2 && !isHttpError(error),
  });
}

/** Wypełniacz klucza dla szkicu niekompletnego - zapytanie i tak jest wyłączone. */
const EMPTY_DRAFT: CorrectionDraftDto = { targetUuid: '', action: 'void' };
