/**
 * Ninerdeck - panel: ŚCIEŻKA AKCEPTACJI klubu (`#/kalendarz/sciezka`; makieta
 * `kalendarz-sciezka` K4/K4b/K4c; issue #165, H2).
 *
 * Kroki, przez które przechodzi rezerwacja, zanim się potwierdzi. Klub bez ani jednego
 * kroku nie klika w nic i to jest stan domyślny KAŻDEGO klubu - stan pusty mówi
 * o SKUTKU („rezerwacje potwierdzają się od razu"), a nie o brakach.
 *
 * ══ TABELA, NIE LISTA KART ══
 * Krok niesie cztery rzeczy naraz - kolejność, nazwę, ludzi i akcje - a kolejność jest
 * tu TREŚCIĄ, nie porządkiem wyświetlania. Tabela stawia numer w osobnej kolumnie.
 * Wiersze rysuje ten ekran sam, a nie `DataTable`: uchwyt przeciągania potrzebuje
 * zdarzeń na WIERSZU (`onDragOver`, `onDrop`), których tabela-kręgosłup nie wystawia,
 * a dokładanie ich tam dla jednego ekranu zmieniałoby kontrakt czterech innych.
 *
 * ══ KOLEJNOŚĆ ZMIENIA SIĘ UCHWYTEM, NIE PARĄ STRZAŁEK ══
 * Uchwyt jest PRZYCISKIEM: przyjmuje fokus, a strzałki w górę i w dół przestawiają
 * wiersz - przeciąganie myszą jest wygodą, nie warunkiem. Przestawienie ZAPISUJE SIĘ
 * od razu, bo kolejność jest regułą („krok 2 pyta dopiero po zgodzie kroku 1"), a nie
 * szkicem do zatwierdzenia; zdanie pod tabelą mówi, że działa od zaraz.
 *
 * ══ ROZJAZD OBSADY ZE ZDOLNOŚCIĄ (K4c) ══
 * Lista kroku i zdolność „Akceptacja rezerwacji" to dwa zapisy i mogą się rozjechać.
 * Listy nie czyścimy po cichu - ekran OZNACZA: nazwisko przygasa i zdanie pod tabelą
 * mówi, kto i co dalej (stopień pierwszy); gdy krok nie ma już nikogo, baner `warn`
 * i plakietka, bo nowe rezerwacje na nim STANĄ (stopień drugi).
 */

import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { ApprovalStepDto, PilotListItemDto } from '../../api/dto';
import { useApprovalSteps, useReplaceApprovalSteps } from '../../queries/useApprovals';
import { usePilots } from '../../queries/usePilots';
import {
  Banner,
  Breadcrumbs,
  EmptyState,
  LinkButton,
  Loadable,
  PageHead,
  Pill,
  TableSkeleton,
} from '../../ui/components';
import { ChecklistIcon, DragHandleIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import {
  asInput,
  moveStep,
  namesSentence,
  orphanNotices,
  pathSentence,
  stepMembers,
  type OrphanNotice,
} from './approvalPath';
import { stepsErrorMessage } from './approvalRefusal';
import { StepDrawer } from './StepDrawer';

const HEADERS = ['', 'Krok', 'Nazwa', 'Kto może zatwierdzić', ''];

export function ApprovalPathScreen() {
  const navigate = useNavigate();
  const { stepId } = useParams();
  const path = useApprovalSteps(true);
  const pilots = usePilots({});
  const replace = useReplaceApprovalSteps();

  // Kolejność W TRAKCIE przestawiania - lokalna, żeby wiersz nie wracał na stare
  // miejsce na czas odpowiedzi serwera. Odpowiedź (odświeżona lista) ją zastępuje.
  const [order, setOrder] = useState<ApprovalStepDto[] | null>(null);
  useEffect(() => setOrder(null), [path.data]);
  const steps = order ?? path.data?.steps ?? [];
  const members = pilots.data?.items ?? [];

  const reorder = (from: number, to: number): void => {
    if (to < 0 || to >= steps.length || from === to) return;
    const next = moveStep(steps, from, to);
    setOrder(next);
    replace.mutate(asInput(next));
  };

  const notices = orphanNotices(steps, members);
  const stuck = notices.filter((n) => n.health === 'none');
  const partial = notices.filter((n) => n.health === 'partial');
  const error = path.error ?? pilots.error;

  const open = stepId == null ? null : stepId === 'nowy' ? 'nowy' : (steps.find((s) => s.id === stepId) ?? null);
  const backToList = (): void => {
    void navigate('/kalendarz/sciezka');
  };

  return (
    <>
      {/* Okruszki, bo ekran leży POD kalendarzem: ścieżka jest konfiguracją tego modułu,
          a nie piątą pozycją w kolumnie - kolumna wymienia MODUŁY klubu. */}
      <Breadcrumbs items={[{ label: 'Kalendarz', to: '/kalendarz' }, { label: 'Ścieżka akceptacji' }]} />

      <PageHead
        title="Ścieżka akceptacji"
        actions={
          steps.length === 0 ? undefined : (
            <LinkButton to="/kalendarz/sciezka/nowy" variant="primary">
              Dodaj krok
            </LinkButton>
          )
        }
      />

      {error == null ? null : (
        <Banner tone="danger" live>
          {errorMessage(error)}
        </Banner>
      )}
      {replace.error == null ? null : (
        <Banner tone="danger" live>
          {stepsErrorMessage(replace.error)}
        </Banner>
      )}

      {/* Stopień drugi rozjazdu: krok bez nikogo. Baner `warn`, bo nowe rezerwacje
          zatrzymają się na nim - i droga naprawy w banerze. */}
      {stuck.map((n) => (
        <Banner
          key={n.stepId}
          tone="warn"
          action={
            <LinkButton to={`/kalendarz/sciezka/${n.stepId}`} size="sm" variant="ghost">
              Wskaż kogoś
            </LinkButton>
          }
        >
          <b>Kroku „{n.stepLabel}" nie ma kto zatwierdzić.</b> {namesSentence(n.lost)} nie ma już
          zdolności „Akceptacja rezerwacji", a nikt inny w tym kroku nie stoi. Nowe rezerwacje
          zatrzymają się na nim.
        </Banner>
      ))}

      {/* Baner mówi, CO ta ścieżka robi - PRZED listą: kto wchodzi, pyta „jak to u nas
          działa". Reguła wymienia kroki po nazwach, więc czyta się razem z tabelą. */}
      {steps.length === 0 ? null : (
        <Banner tone="status">
          <b>{pathSentence(steps.map((s) => s.label))}</b> Wystarczy zgoda jednej osoby z kroku.
          Pierwsza odmowa jest ostateczna: rezerwacja zostaje odrzucona, termin wraca do puli
          i nie idzie już do kolejnych kroków.
        </Banner>
      )}

      <Loadable
        pending={path.isPending || pilots.isPending}
        skeleton={<TableSkeleton headers={HEADERS} widths={[28, 32, 150, 220, 54]} rows={2} />}
      >
        {steps.length === 0 ? (
          <EmptyState
            icon={<ChecklistIcon />}
            title="Rezerwacje potwierdzają się od razu"
            note="Nikt w tym klubie nie musi zatwierdzać cudzych terminów. Dodaj krok, jeśli chcesz, żeby ktoś je oglądał, zanim staną się wiążące."
            action={
              <LinkButton to="/kalendarz/sciezka/nowy" variant="primary">
                Dodaj pierwszy krok
              </LinkButton>
            }
          />
        ) : (
          <>
            <StepsTable steps={steps} pilots={members} notices={notices} onReorder={reorder} />
            {/* Stopień pierwszy rozjazdu: krok ma jeszcze kogo pytać, więc nic nie krzyczy -
                zdanie pod tabelą mówi, KTO i CO dalej. */}
            {partial.map((n) => (
              <p className="hint" key={n.stepId}>
                <b>{namesSentence(n.lost)}</b> nie ma już zdolności „Akceptacja rezerwacji" i nie
                rozstrzygnie kroku „{n.stepLabel}". Krok zostaje z {ableText(n)} - nadaj jej zdolność
                z powrotem (<Link to="/piloci">Piloci</Link>) albo zdejmij ją z listy.
              </p>
            ))}
            {/* Cena ZMIANY stoi pod tym, co się zmienia: czyta ją ten, kto przestawia
                kroki, nie każdy, kto wszedł zobaczyć ścieżkę. */}
            <p className="hint">
              <b>Zmiana działa od zaraz, także na rezerwacjach w toku.</b> Dołożenie kroku cofa
              sprawy, które czekają na zgodę dalszego kroku - wrócą do nowego kroku 1. Zgody już
              wydane zostają przy swoich krokach.
            </p>
          </>
        )}
      </Loadable>

      {open == null ? null : (
        <StepDrawer
          key={open === 'nowy' ? 'nowy' : open.id}
          step={open === 'nowy' ? null : open}
          steps={steps}
          pilots={members}
          onClose={backToList}
        />
      )}
    </>
  );
}

const ableText = (n: OrphanNotice): string =>
  n.able === 1 ? 'jedną osobą' : `${n.able} osobami`;

interface TableProps {
  steps: readonly ApprovalStepDto[];
  pilots: readonly PilotListItemDto[];
  notices: readonly OrphanNotice[];
  onReorder: (from: number, to: number) => void;
}

function StepsTable({ steps, pilots, notices, onReorder }: TableProps) {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState<number | null>(null);

  const onHandleKey = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onReorder(index, index - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onReorder(index, index + 1);
    }
  };

  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">Kroki ścieżki akceptacji</caption>
        <thead>
          <tr>
            {HEADERS.map((header, i) => (
              <th key={i}>{header === '' && i === 0 ? <span className="visually-hidden">Kolejność</span> : header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((step, index) => {
            const obsada = stepMembers(step.memberIds, pilots);
            const stuck = notices.some((n) => n.stepId === step.id && n.health === 'none');
            return (
              <tr
                key={step.id}
                className={dragging === index ? 'clickable dragging' : 'clickable'}
                onClick={() => navigate(`/kalendarz/sciezka/${step.id}`)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragging != null) onReorder(dragging, index);
                  setDragging(null);
                }}
              >
                <td>
                  <button
                    type="button"
                    className="drag-handle"
                    aria-label={`Przenieś krok ${step.label}`}
                    draggable
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={onHandleKey(index)}
                    onDragStart={() => setDragging(index)}
                    onDragEnd={() => setDragging(null)}
                  >
                    <DragHandleIcon />
                  </button>
                </td>
                <td className="reg">{index + 1}</td>
                <td className="cell-strong">
                  {step.label}
                  {stuck ? (
                    <>
                      {' '}
                      <Pill tone="amber">Nikt nie zatwierdzi</Pill>
                    </>
                  ) : null}
                </td>
                <td>
                  <span className="cell-sub">
                    {obsada.map((m, i) => (
                      <span key={m.id}>
                        {i === 0 ? null : ' · '}
                        <span className={m.able ? undefined : 'dim'}>{m.name}</span>
                      </span>
                    ))}
                  </span>
                </td>
                <td className="row-actions">
                  <LinkButton to={`/kalendarz/sciezka/${step.id}`} size="sm" variant="ghost">
                    Edytuj
                  </LinkButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
