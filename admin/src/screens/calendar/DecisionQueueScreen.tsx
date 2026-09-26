/**
 * Ninerdeck - panel: KOLEJKA DECYZJI - co czeka na MOJĄ zgodę (`#/kalendarz/decyzje`;
 * makieta `kalendarz-kolejka` K5/K5a/K5b; issue #165, H3).
 *
 * Tytuł mówi, CZYJA to decyzja: ekran nie pokazuje wszystkiego, co czeka w klubie, tylko
 * kroki, za które odpowiada zalogowany. Kolejka cudzego kroku nie jest jego sprawą i nie
 * ma jak jej rozstrzygnąć.
 *
 * ══ CAŁY PLAN NA KARCIE, NIE W SZUFLADZIE ══
 * Pola i tak jadą na ekran (akceptujący widzi komplet, §17), więc chowanie ich w szufladzie
 * kazałoby otwierać każdą sprawę osobno, żeby ją rozstrzygnąć. Karta niesie te same pary
 * klucz-wartość, co szuflada zajętości - jedna rzecz, jeden wygląd.
 *
 * ══ ODMOWA JEST KROKIEM KARTY, NIE OSOBNYM EKRANEM ══
 * „Odmów" zamienia stopkę karty na pole powodu (K5a). Przycisk blokuje BEZ zdania, bo
 * puste pole widać nad nim (issue #55). Powód przy odmowie jest WYMAGANY, przy zgodzie
 * nie ma go z czego brać - pole, które prawie zawsze zostaje puste, uczy je pomijać.
 *
 * ══ NIC NIE CZEKA = STAN, W KTÓRYM EKRAN JEST PRZEZ WIĘKSZOŚĆ CZASU ══
 * Wejście z kalendarza wtedy NIE ISTNIEJE (baner pojawia się wyłącznie z pracą); ekran
 * zostaje osiągalny adresem i mówi wprost, że nie ma nic do zrobienia (K5b).
 *
 * Znak maszyny na tytule karty oraz pilot i drugi pilot PROWADZĄ W GŁĄB (issue #206):
 * otwierają szufladę podglądu nad kolejką - sprawa zostaje widoczna pod spodem, a decyzja
 * zapada na jej karcie. Szuflada nie ma ani jednej akcji na sprawie.
 */

import { useMemo, useState } from 'react';

import { useApprovalQueue, useDecideBooking } from '../../queries/useApprovals';
import { useDirectory } from '../../queries/useDirectory';
import { Banner, Breadcrumbs, Button, EmptyState, LinkButton, Loadable, PageHead } from '../../ui/components';
import { ChecklistIcon, PreviewIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { decisionErrorMessage } from './approvalRefusal';
import { personLookup, regLookup } from './directoryLookups';
import { PreviewDrawer } from './PreviewDrawer';
import type { PreviewTarget } from './previewLabels';
import { decisionHint, queueCards, type QueueCard, type QueueRow } from './queueCards';

export function DecisionQueueScreen() {
  const queue = useApprovalQueue(true);
  // Nazwiska i znaki ze SŁOWNIKA klubu (issue #216): akceptujący bez „Podglądu klubu"
  // nie ma prawa do list modułów Piloci i Samoloty - a kolejka jest jego.
  const directory = useDirectory();
  const decide = useDecideBooking();

  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  /** Ostatnia decyzja - JEDNO zdanie u góry; karta pod nim właśnie zniknęła z listy. */
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; error: unknown } | null>(null);
  // Szuflada podglądu NAD kolejką (issue #206): sprawa zostaje widoczna pod spodem,
  // a decyzja zapada na jej karcie - szuflada nie ma ani jednej akcji na sprawie.
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const person = useMemo(() => personLookup(directory.data), [directory.data]);
  const reg = useMemo(() => regLookup(directory.data), [directory.data]);

  const items = queue.data?.items ?? [];
  // „Teraz" liczy się RAZ na odpowiedź, nie przy każdym renderze: „wczoraj 18:40" nie ma
  // prawa przeskoczyć na „22 wrz" w trakcie czytania.
  const cards = useMemo(
    () => queueCards(items, { person, reg, timezone: queue.data?.timezone ?? '', now: Date.now() }),
    [items, person, reg, queue.data?.timezone],
  );

  const settle = (card: QueueCard, decision: 'approved' | 'rejected'): void => {
    setFailed(null);
    decide.mutate(
      { id: card.id, body: { decision, reason: decision === 'rejected' ? reason.trim() : null } },
      {
        onSuccess: () => {
          setDone(`${decision === 'approved' ? 'Zatwierdzono' : 'Odmówiono'}: ${card.title}.`);
          setRefusing(null);
          setReason('');
        },
        onError: (error) => setFailed({ id: card.id, error }),
      },
    );
  };

  const error = queue.error ?? directory.error;

  return (
    <>
      <Breadcrumbs items={[{ label: 'Kalendarz', to: '/kalendarz' }, { label: 'Czeka na decyzję' }]} />
      <PageHead title="Czeka na Twoją decyzję" />

      {error == null ? null : (
        <Banner tone="danger" live>
          {errorMessage(error)}
        </Banner>
      )}
      {done == null ? null : (
        <Banner tone="ok" live>
          {done}
        </Banner>
      )}

      <Loadable pending={queue.isPending} skeleton={<QueueSkeleton />}>
        {cards.length === 0 ? (
          <EmptyState
            icon={<ChecklistIcon />}
            title="Nikt nie czeka na Twoją zgodę"
            note="Rezerwacje z kroków, za które odpowiadasz, są rozstrzygnięte."
            action={
              <LinkButton to="/kalendarz" variant="ghost">
                Wróć do kalendarza
              </LinkButton>
            }
          />
        ) : (
          <>
            {cards.map((card) => (
              <div className="card" key={card.id}>
                <div className="card-title">
                  <button
                    type="button"
                    className="go"
                    aria-label={`Podgląd samolotu ${card.aircraft.reg}`}
                    onClick={() =>
                      setPreview({ kind: 'aircraft', bookingId: card.id, label: card.aircraft.reg })
                    }
                  >
                    {card.aircraft.reg}
                    <PreviewIcon />
                  </button>
                  {` · ${card.when}`}
                </div>
                {card.rows.map((row) => (
                  <div className="kv" key={row.label}>
                    <span className="kv-k">{row.label}</span>
                    <span className={row.tone === 'amber' ? 'kv-v amber' : 'kv-v'}>
                      {row.go == null ? (
                        <RowValue row={row} />
                      ) : (
                        <button
                          type="button"
                          className="go"
                          aria-label={`Podgląd pilota ${row.value}`}
                          onClick={() => setPreview(row.go ?? null)}
                        >
                          <RowValue row={row} />
                          <PreviewIcon />
                        </button>
                      )}
                    </span>
                  </div>
                ))}

                {refusing === card.id ? (
                  <>
                    <div className="field">
                      <label className="label" htmlFor={`reason-${card.id}`}>
                        Powód
                      </label>
                      <textarea
                        id={`reason-${card.id}`}
                        className="input area"
                        rows={3}
                        value={reason}
                        placeholder="Np. maszyna po przeglądzie dopiero w poniedziałek."
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>
                    <p className="hint">
                      Pilot zobaczy ten powód w telefonie. Odmowa jest ostateczna: rezerwacja
                      zostaje odrzucona, a termin wraca do puli.
                    </p>
                    <div className="drawer-foot">
                      <Button
                        variant="ghost"
                        disabled={decide.isPending}
                        onClick={() => {
                          setRefusing(null);
                          setReason('');
                        }}
                      >
                        Anuluj
                      </Button>
                      <Button
                        variant="danger"
                        disabled={reason.trim() === '' || decide.isPending}
                        onClick={() => settle(card, 'rejected')}
                      >
                        {decide.isPending ? 'Zapisuję…' : 'Odmów'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="drawer-foot">
                    <Button
                      variant="ghost"
                      disabled={decide.isPending}
                      onClick={() => {
                        setRefusing(card.id);
                        setReason('');
                      }}
                    >
                      Odmów
                    </Button>
                    <Button
                      variant="primary"
                      disabled={decide.isPending}
                      onClick={() => settle(card, 'approved')}
                    >
                      Zatwierdź
                    </Button>
                  </div>
                )}

                {failed?.id === card.id ? (
                  <p className="card-note danger">{decisionErrorMessage(failed.error)}</p>
                ) : null}
              </div>
            ))}

            {/* Co dzieje się PO decyzji - raz, pod listą, nie przy każdej karcie. */}
            <p className="hint">{decisionHint(items)}</p>
          </>
        )}
      </Loadable>

      {preview == null ? null : (
        <PreviewDrawer target={preview} person={person} reg={reg} onClose={() => setPreview(null)} />
      )}
    </>
  );
}

/** Wartość wiersza z podpisem - ta sama w wierszu zwykłym i w prowadzącym w głąb. */
function RowValue({ row }: { row: QueueRow }) {
  return (
    <>
      {row.mono ? <span className="mono">{row.value}</span> : row.value}
      {row.sub == null ? null : (
        <>
          {' '}
          <span className={row.subMono ? 'cell-sub mono' : 'cell-sub'}>{row.sub}</span>
        </>
      )}
    </>
  );
}

/** Plamki w geometrii karty sprawy: tytuł i cztery pary klucz-wartość, dwie karty. */
function QueueSkeleton() {
  return (
    <div aria-busy="true">
      {[0, 1].map((card) => (
        <div className="card" key={card}>
          <span className="skeleton cell" style={{ width: '46%' }} />
          {[0, 1, 2, 3].map((row) => (
            <div className="kv" key={row}>
              <span className="skeleton cell" style={{ width: '64px' }} />
              <span className="skeleton cell" style={{ width: row % 2 === 0 ? '38%' : '22%' }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
