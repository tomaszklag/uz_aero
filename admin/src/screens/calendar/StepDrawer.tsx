/**
 * Ninerdeck - panel: SZUFLADA KROKU ścieżki akceptacji (`#/kalendarz/sciezka/:stepId`,
 * `nowy` = nowy krok; makieta `kalendarz-sciezka` K4a; issue #165, H2).
 *
 * Nazwa i ludzie - tyle ma krok. Szuflada, nie osobny ekran: krok jest wierszem listy,
 * a panel otwiera wiersze szufladą (piloci, samoloty, zajętość kalendarza).
 *
 * ══ ZAPIS IDZIE CAŁĄ ŚCIEŻKĄ ══
 * Serwer przyjmuje KOMPLET kroków, więc szuflada składa zamówienie z listy, którą ekran
 * już ma, z jednym krokiem podmienionym albo dołożonym (`withStep`). Zdjęcie kroku to
 * to samo zamówienie bez niego - krok przestaje być pytany, a decyzje pod nim zapadłe
 * zostają w historii.
 *
 * ══ OSOBA, KTÓRA STRACIŁA PRAWO, ZOSTAJE NA LIŚCIE ══
 * Lista wyboru pokazuje kandydatów (aktywnych ze zdolnością akceptacji) ORAZ osoby
 * z obsady kroku, które kandydatami już nie są - przygaszone, ale zaznaczone: inaczej
 * administrator nie miałby jak ich z kroku zdjąć, a zapis odbiłby się o serwer.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { ApprovalStepDto, PilotListItemDto } from '../../api/dto';
import { useReplaceApprovalSteps } from '../../queries/useApprovals';
import { Button, Card, Drawer, Field, OptionButton, TextInput } from '../../ui/components';
import {
  approverCandidates,
  draftOf,
  EMPTY_STEP,
  hasStepChanges,
  STEP_LABEL_MAX,
  stepBlocker,
  stepMembers,
  toggleMember,
  withoutStep,
  withStep,
  type StepDraft,
} from './approvalPath';
import { stepsErrorMessage } from './approvalRefusal';

interface Props {
  /** Krok z listy albo `null` = nowy. */
  step: ApprovalStepDto | null;
  steps: readonly ApprovalStepDto[];
  pilots: readonly PilotListItemDto[];
  onClose: () => void;
}

export function StepDrawer({ step, steps, pilots, onClose }: Props) {
  // Szkic startuje z kroku RAZ - szuflada montuje się z kluczem kroku (`key`), więc
  // zmiana adresu daje świeży szkic, a odświeżenie listy po zapisie go nie kasuje.
  const [draft, setDraft] = useState<StepDraft>(() => (step == null ? EMPTY_STEP : draftOf(step)));
  const [removing, setRemoving] = useState(false);
  const replace = useReplaceApprovalSteps();

  const candidates = approverCandidates(pilots);
  // Obsada spoza kandydatów: ci, którzy stracili zdolność albo członkostwo.
  const stale = stepMembers(draft.memberIds, pilots).filter(
    (m) => !candidates.some((c) => c.id === m.id),
  );

  const blocker = stepBlocker(draft);
  const unchanged = step != null && !hasStepChanges(steps, draft);

  const save = (): void => {
    replace.mutate(withStep(steps, draft), { onSuccess: onClose });
  };
  const remove = (): void => {
    if (step == null) return;
    replace.mutate(withoutStep(steps, step.id), { onSuccess: onClose });
  };

  return (
    <Drawer
      title={step == null ? 'Nowy krok' : step.label}
      sub="Nazwa kroku i osoby, które mogą go zatwierdzić"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={replace.isPending}>
            Anuluj
          </Button>
          {/* Powód blokady W PRZYCISKU (issue #55) - pusta lista osób nie jest stanem
              widocznym z jednej kontrolki. Brak zmian blokuje BEZ zdania: widać z pól. */}
          <Button
            variant="primary"
            onClick={save}
            disabled={blocker != null || unchanged || replace.isPending}
            reason={blocker ?? undefined}
          >
            {replace.isPending ? 'Zapisuję…' : 'Zapisz'}
          </Button>
        </>
      }
    >
      <Card title="Krok ścieżki">
        <Field
          htmlFor="step-label"
          label="Nazwa kroku"
          hint={
            <>
              Nazwa jest dla ludzi i trafia do powiadomienia pilota: „czeka na krok{' '}
              <b>{draft.label.trim() === '' ? 'Mechanik' : draft.label.trim()}</b>". Opisuje, czego
              dotyczy zgoda - nie musi odpowiadać żadnej funkcji w klubie.
            </>
          }
        >
          <TextInput
            id="step-label"
            value={draft.label}
            maxLength={STEP_LABEL_MAX}
            placeholder="np. Mechanik"
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </Field>

        <div className="opt-list" role="group" aria-label="Kto może zatwierdzić ten krok">
          {candidates.map((c) => (
            <OptionButton
              key={c.id}
              multiple
              name={c.name}
              desc={c.code}
              selected={draft.memberIds.includes(c.id)}
              onSelect={() => setDraft({ ...draft, memberIds: toggleMember(draft.memberIds, c.id) })}
            />
          ))}
          {stale.map((m) => (
            <OptionButton
              key={m.id}
              multiple
              name={m.name}
              desc={m.code == null ? 'nie jest już członkiem klubu' : `${m.code} · nie ma już zdolności akceptacji`}
              selected
              onSelect={() => setDraft({ ...draft, memberIds: toggleMember(draft.memberIds, m.id) })}
            />
          ))}
        </div>
        <p className="hint">
          Na liście stoją wyłącznie osoby ze zdolnością <b>Akceptacja rezerwacji</b>. Kogo tu
          brakuje, temu nadaj ją w karcie członka (<Link to="/piloci">Piloci</Link>).
        </p>

        {replace.error == null ? null : (
          <p className="card-note danger">{stepsErrorMessage(replace.error)}</p>
        )}
      </Card>

      {/* Zdjęcie kroku - poniżej i w tonie ostrzeżenia, bo intencją wchodzącego jest
          poprawka obsady, nie kasowanie. Skutek pada PRZED kliknięciem: sprawy czekające
          na ten krok przejdą dalej, a zgody pod nim zostają w historii. */}
      {step == null ? null : (
        <Card title="Zdjęcie kroku ze ścieżki" tone="danger">
          <p className="card-note">
            Rezerwacje czekające na ten krok przejdą do następnego od razu. Zgody już wydane
            zostają w historii.
          </p>
          {removing ? (
            <div className="drawer-foot">
              <Button variant="ghost" onClick={() => setRemoving(false)} disabled={replace.isPending}>
                Zostaw
              </Button>
              <Button variant="danger" onClick={remove} disabled={replace.isPending}>
                Zdejmij krok
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setRemoving(true)} disabled={replace.isPending}>
              Zdejmij krok ze ścieżki
            </Button>
          )}
        </Card>
      )}
    </Drawer>
  );
}
