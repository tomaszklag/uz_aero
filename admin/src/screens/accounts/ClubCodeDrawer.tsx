/**
 * Ninerdeck - panel: kod klubu (`#/piloci/kod`, mockup `piloci-kod-klubu` - P4 i P4a).
 *
 * ══ KOD STOI JAWNIE I NA STAŁE ══
 * Nie jest sekretem: daje WYŁĄCZNIE zgłoszenie do rozpatrzenia, a wpuszcza człowiek
 * (`docs/wielofirmowosc.md` §3.8). Administrator odczytuje go z ekranu i dyktuje
 * pilotowi, więc nie ma tu ani „pokaż raz", ani zasłony, ani przycisku „Kopiuj".
 *
 * ══ DWIE CZYNNOŚCI, OBIE Z POTWIERDZENIEM PRZY NICH ══
 * „Wygeneruj nowy" (stary gaśnie od razu, złożone zgłoszenia zostają) i „Wyłącz
 * dołączanie kodem" (kasuje kod - do czasu nowego nikt nie dołączy, bo innej drogi nie
 * ma). Potwierdzenie stoi INLINE, przy przycisku, którego dotyczy, i nazywa SKUTEK przed
 * akcją - ten sam wzorzec `.confirm`, co przy wyłączeniu klubu i konta.
 *
 * ══ DWIE RÓŻNE LICZBY NA JEDNYM EKRANIE I TO JEST ZAMIERZONE ══
 * Podpis mówi, ile zgłoszeń czeka BIEŻĄCYM kodem (liczone od jego wygenerowania), a karta
 * ZGŁOSZENIA nad listą - ile czeka w ogóle. `memberships` nie zapisuje, którym kodem ktoś
 * wszedł, i zapisywać nie ma po co: kod jest jeden na klub, a jego zmiana ma stempel.
 */

import { useState } from 'react';

import { useClubCode, useDisableClubCode, useRotateClubCode } from '../../queries/useClubCode';
import { Banner, Button, Card, Drawer, Loadable, Pill } from '../../ui/components';
import { errorMessage } from '../common/apiMessage';
import { dateWithYear } from '../common/values';

/** Odmiana rzeczownika przy liczbie - „1 zgłoszenie", „2 zgłoszenia", „5 zgłoszeń". */
function requestsWord(count: number): string {
  if (count === 1) return 'zgłoszenie';
  const tens = count % 100;
  const units = count % 10;
  const few = units >= 2 && units <= 4 && !(tens >= 12 && tens <= 14);
  return few ? 'zgłoszenia' : 'zgłoszeń';
}

export function ClubCodeDrawer({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  const code = useClubCode(true);
  const rotate = useRotateClubCode();
  const disable = useDisableClubCode();

  /** Które potwierdzenie jest otwarte - JEDEN stan, nie dwie flagi (wzorzec z karty konta). */
  const [confirm, setConfirm] = useState<'rotate' | 'disable' | null>(null);

  const pending = rotate.isPending || disable.isPending;
  const error = code.error ?? rotate.error ?? disable.error;
  const state = code.data ?? null;
  const enabled = state?.formatted != null;

  return (
    <Drawer
      title="Kod klubu"
      sub={`${orgName} · jedyna droga do klubu`}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Gotowe
        </Button>
      }
    >
      {error == null ? null : (
        <Banner tone="danger" live>
          {errorMessage(error)}
        </Banner>
      )}

      <Loadable
        pending={code.isPending}
        skeleton={
          <Card title="Aktualny kod">
            <span className="skeleton" style={{ width: 160, height: 24 }} />
          </Card>
        }
      >
        <Card
          title="Aktualny kod"
          actions={enabled ? undefined : <Pill tone="amber">Wyłączone</Pill>}
        >
          <div className="club-code-row">
            <span className={enabled ? 'club-code' : 'club-code off'}>
              {state?.formatted ?? '— — —'}
            </span>
            <Button
              variant={enabled ? 'ghost' : 'primary'}
              size="sm"
              disabled={pending}
              onClick={() => (enabled ? setConfirm('rotate') : rotate.mutate())}
            >
              {enabled ? 'Wygeneruj nowy' : 'Wygeneruj kod'}
            </Button>
          </div>

          {enabled ? (
            <span className="hint">
              Obowiązuje od {dateWithYear(state?.since ?? null)}
              {state != null && state.pendingWithCode > 0
                ? ` · ${state.pendingWithCode} ${requestsWord(state.pendingWithCode)} tym kodem czeka na decyzję.`
                : '.'}
            </span>
          ) : (
            // Zdanie mówi o SKUTKU dla klubu, a nie o budowie mechanizmu: bez kodu nie
            // ma żadnej drogi do klubu, i to jest jedyna rzecz, którą trzeba tu wiedzieć.
            <span className="hint">Bez kodu nikt nie dołączy do klubu - innej drogi nie ma.</span>
          )}

          {confirm !== 'rotate' ? null : (
            <div className="confirm">
              <p className="confirm-q">Wygenerować nowy kod?</p>
              <p className="hint">
                Stary przestanie działać od razu. Zgłoszenia już złożone zostają i czekają
                na decyzję jak dotąd.
              </p>
              <div className="confirm-actions">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                  Nie
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={pending}
                  onClick={() => rotate.mutate(undefined, { onSuccess: () => setConfirm(null) })}
                >
                  Wygeneruj
                </Button>
              </div>
            </div>
          )}
        </Card>
      </Loadable>

      {/* Karty wyłączenia NIE MA, gdy kod już jest wyłączony: przycisk „Wyłącz" nad
          wyłączonym kodem nie miałby czego wyłączyć (wariant P4a z makiety). */}
      {!enabled ? null : (
        <Card title="Dołączanie kodem">
          <div className="access-row">
            <span>Kod przyjmuje zgłoszenia</span>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => setConfirm('disable')}
            >
              Wyłącz
            </Button>
          </div>

          {confirm !== 'disable' ? null : (
            <div className="confirm">
              <p className="confirm-q">Wyłączyć dołączanie kodem?</p>
              <p className="hint">
                Kod przestanie działać. Do czasu wygenerowania nowego nikt nie dołączy do
                klubu - innej drogi nie ma.
              </p>
              <div className="confirm-actions">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                  Nie
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  onClick={() => disable.mutate(undefined, { onSuccess: () => setConfirm(null) })}
                >
                  Wyłącz
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </Drawer>
  );
}
