/**
 * UZ Aero - panel: korekta administratora (`/admin/api/sessions/:uuid/corrections*`).
 *
 * Osobny plik od `sessions.ts`, bo to osobny zasób trasy i osobna odpowiedzialność:
 * tamten CZYTA dni, ten dopisuje zdarzenie do rejestru klubu. Ta sama granica, co po
 * stronie serwera (`http/routes/admin/corrections.ts`).
 *
 * ══ DWA WYWOŁANIA, JEDEN KSZTAŁT ══
 * `previewCorrection` i `postCorrection` przyjmują ten sam `CorrectionDraftDto` -
 * podgląd dokłada do niego zero pól, a zapis dokłada wyłącznie `reason`. Gdyby kształty
 * się rozjechały, karta „przed → po" opisywałaby inną operację niż ta, którą panel
 * wysyła dwie sekundy później, i nikt by tego nie zauważył.
 *
 * `reason` jedzie WYŁĄCZNIE w zapisie i WYŁĄCZNIE do audytu - serwer nie wpuszcza go
 * do payloadu zdarzenia (rejestr opisuje lot, nie motywację człowieka przy biurku).
 */

import type { CorrectionDraftDto, CorrectionPreviewDto, CorrectionResultDto } from './dto';
import { apiPost } from './httpClient';

/**
 * Podgląd „przed → po". `POST`, choć to zapytanie: parametrem jest KSZTAŁT korekty
 * (unia z opcjonalnym `newTime`), a nie filtr listy - wciskanie go w query string
 * oznaczałoby drugą, ręczną serializację tego samego payloadu.
 *
 * Nic nie zapisuje: ani zdarzenia, ani wpisu w audycie, ani karty arkusza.
 */
export function previewCorrection(
  sessionUuid: string,
  draft: CorrectionDraftDto,
): Promise<CorrectionPreviewDto> {
  return apiPost<CorrectionPreviewDto>(
    `/sessions/${encodeURIComponent(sessionUuid)}/corrections/preview`,
    draft,
  );
}

/**
 * Zapis korekty. `reason` jest WYMAGANY po obu stronach - serwer odrzuca pusty i sam
 * trim (`400`), a panel blokuje przycisk wcześniej (`reasonState`), żeby człowiek
 * zobaczył powód przy przycisku, a nie po żądaniu.
 *
 * Nagłówek CSRF dokłada `apiPost`; bez niego trasa odpowiada 403.
 */
export function postCorrection(
  sessionUuid: string,
  draft: CorrectionDraftDto,
  reason: string,
): Promise<CorrectionResultDto> {
  return apiPost<CorrectionResultDto>(`/sessions/${encodeURIComponent(sessionUuid)}/corrections`, {
    ...draft,
    reason,
  });
}
