/**
 * Ninerdeck - panel 2.0: karta pilota - zmiana członkostwa w klubie (`#/piloci/:id`).
 *
 * Trzy sekcje i tyle: kim jest, co mu wolno, czy ma dostęp. Panel 1.0 miał w tym miejscu
 * pięć sekcji, sześć banerów i 2 700 znaków prozy tłumaczącej budowę systemu - w tym
 * cztery wiersze o rodzajach sesji, których pilot nigdy nie zobaczy.
 *
 * == KARTA OPISUJE CZŁONKOSTWO, NIE CZŁOWIEKA (wielofirmowość, issue #101 E3) ==
 * Stąd podział na „Osobę" (imię i konto Google - wspólne dla wszystkich jej klubów)
 * i „W tym klubie" (kod, rola, dostęp - własność członkostwa). Ta sama osoba w drugim
 * klubie ma inny kod i może mieć inną rolę, więc wyłączenie tutaj odcina ją od TEGO
 * klubu i od żadnego innego.
 *
 * == ZAKLADANIA KONTA TU NIE MA (issue #100, D3) ==
 * Karta zmienia członkostwo, które już istnieje. Nowy członek wchodzi WYŁĄCZNIE kodem
 * klubu, a zatwierdza go administrator w karcie ZGŁOSZENIA (`RequestDrawer`); z panelu
 * klubu nie da się nikogo dopisać ani adresem, ani linkiem.
 *
 * == HASLA ZNIKLY (2026-09-04, `docs/logowanie-google.md`) ==
 * Karta nie pokazuje hasła i nie ma „Ustaw nowe hasło": osoba nie dostaje od klubu
 * żadnego poświadczenia. Dostęp daje logowanie jej kontem Google.
 *
 * == SKUTEK MOWIMY PRZED AKCJA, NIE PO NIEJ ==
 * Wyłączenie członkostwa pyta o potwierdzenie i w pytaniu mówi trzy rzeczy, które trzeba
 * wiedzieć: co z dostępem, co z danymi i co z innymi klubami tej osoby. Po akcji zostaje
 * jedno zdanie potwierdzenia.
 * Odwrotna kolejność (baner po fakcie, tłumaczący co się właśnie stało) była w 1.0
 * i jest odwróceniem ról: człowiek dowiadywał się o skutku, gdy nie mógł już nic zrobić.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PilotListItemDto } from '../../api/dto';
import {
  useDeletePilot,
  useSetPilotActive,
  useUpdatePilot,
} from '../../queries/usePilotCommands';
import { Banner, Button, Card, Drawer, Field, OptionButton, Pill, TextInput } from '../../ui/components';
import { conflictField, errorMessage, refusalOf } from '../common/apiMessage';
import {
  deleteBlocker,
  draftKey,
  draftOf,
  EMPTY_ACCOUNT,
  hasChanges,
  normalizeCode,
  updateBodyOf,
  verdictOf,
  type AccountDraft,
} from './accountForm';
import { accountConflictMessage, accountRefusalMessage, SELF_ACCOUNT } from './accountRefusal';
import { roleLabel, roleNote, ROLE_ORDER } from './accountRows';

interface AccountDrawerProps {
  /** Identyfikator OSOBY z listy członków klubu. */
  id: string;
  /** `null` = lista jeszcze nie przyszła; pusta tablica = przyszła i jest pusta. */
  pilots: PilotListItemDto[] | null;
  listPending: boolean;
  manages: boolean;
  selfId: string | null;
  onClose: () => void;
}

export function AccountDrawer({
  id,
  pilots,
  listPending,
  manages,
  selfId,
  onClose,
}: AccountDrawerProps) {
  const pilot = pilots?.find((item) => item.id === id) ?? null;

  const [draft, setDraft] = useState<AccountDraft>(EMPTY_ACCOUNT);
  /**
   * Które potwierdzenie jest otwarte. JEDEN stan, nie dwie flagi: dwa pytania „czy na
   * pewno" naraz w jednej karcie to dwa czerwone bloki, z których człowiek odpowiada
   * na niewłaściwy.
   */
  const [confirm, setConfirm] = useState<'disable' | 'delete' | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Szkic przestawia się DOKŁADNIE wtedy, gdy zmienia się tożsamość edytowanego konta
  // - także przy jego PIERWSZYM pojawieniu się, bo przy wejściu z linku szuflada
  // montuje się przed listą (`draftKey` opisuje to szerzej). Odświeżenie listy po
  // zapisie klucza nie zmienia, więc nie kasuje wpisanych zmian.
  const synced = useRef<string | null>(null);
  useEffect(() => {
    const key = draftKey(pilot);
    // `key == null` znaczy dokładnie `pilot == null`; warunek na obiekcie stoi obok,
    // żeby kompilator widział zawężenie bez wykrzyknika.
    if (pilot == null || synced.current === key) return;
    synced.current = key;
    setDraft(draftOf(pilot));
    setConfirm(null);
    setDone(null);
  }, [pilot]);

  const update = useUpdatePilot();
  const setActive = useSetPilotActive();
  const remove = useDeletePilot();

  const pending = update.isPending || setActive.isPending || remove.isPending;
  const error = update.error ?? setActive.error ?? remove.error;

  const verdict = verdictOf(draft);
  // `pilot == null` znaczy tu „wklejony link do konta spoza bieżącego zawężenia" -
  // nie ma czego zapisać, więc zapis jest nieczynny (karta mówi to niżej osobno).
  const changed = pilot != null && hasChanges(pilot, draft);
  const readOnly = !manages;

  const field = conflictField(error);
  const conflict = accountConflictMessage(field);
  const refusal = refusalOf(error);
  const refusalText = refusal == null ? null : accountRefusalMessage(refusal);

  // Odmowa reguły i konflikt pola mają SWOJE miejsca (baner / pole), więc zdanie
  // ogólne zostaje wyłącznie dla reszty - inaczej ekran mówiłby to samo dwa razy.
  const generalError =
    error == null || conflict != null || refusalText != null ? null : errorMessage(error);

  const save = (): void => {
    if (pilot == null) return;
    update.mutate(
      { id: pilot.id, body: updateBodyOf(pilot, draft) },
      { onSuccess: () => setDone('Zapisano.') },
    );
  };

  const title = pilot?.name ?? 'Pilot';
  const sub = pilot == null ? 'Konto spoza listy' : subtitleOf(pilot);

  return (
    <Drawer
      title={title}
      sub={
        <>
          {sub}
          {readOnly ? <Pill tone="dim">Tylko podgląd</Pill> : null}
        </>
      }
      onClose={onClose}
      footer={
        readOnly ? undefined : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={pending || !verdict.complete || verdict.blocker != null || !changed}
              reason={verdict.blocker ?? undefined}
            >
              {pending ? 'Zapisuję…' : 'Zapisz'}
            </Button>
          </>
        )
      }
    >
      {/* Konto spoza listy: wklejony link do kogoś, kogo bieżące zawężenie nie pokazuje. */}
      {pilot == null && !listPending ? (
        <Card title="Nie ma go na liście">
          <p className="hint">
            Wyszukiwanie albo zawężenie ukrywa to konto.{' '}
            <Link to="/piloci">Pokaż wszystkich</Link>
          </p>
        </Card>
      ) : null}

      {generalError == null ? null : (
        <Banner tone="danger" live>
          {generalError}
        </Banner>
      )}
      {refusalText == null ? null : (
        <Banner tone="warn" live>
          {refusalText}
        </Banner>
      )}
      {done == null ? null : (
        <Banner tone="ok" live>
          {done}
        </Banner>
      )}

      {/* OSOBA: to, co jest wspólne dla WSZYSTKICH klubów tego człowieka. */}
      <Card title="Osoba">
        <Field htmlFor="name" label="Imię i nazwisko">
          <TextInput
            id="name"
            value={draft.name}
            disabled={readOnly}
            invalid={verdict.invalid.includes('name')}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>

        {/* E-MAIL JEST DO ODCZYTU: to konto Google, którym osoba się loguje, a klub nie ma
            nad nim władzy - adres nadaje dostawca przy pierwszym logowaniu. Do 2.0.0 pole
            było edytowalne, bo wpisany zawczasu adres podpinał konto; ta droga należy dziś
            do platformy (pierwszy administrator klubu), a członek wchodzi kodem. */}
        <Field
          htmlFor="email"
          label="Konto Google"
          hint="Adres, którym się loguje. Nadaje go Google - klub go nie zmienia."
        >
          <TextInput id="email" mono value={draft.email} disabled />
        </Field>
      </Card>

      {/* W TYM KLUBIE: własność CZŁONKOSTWA. Kod jest jedyny w klubie, nie na serwerze. */}
      <Card title="W tym klubie">
        <Field
          htmlFor="code"
          label="Kod pilota"
          hint="Krótki skrót przy każdym locie, np. TMK. Jedyny w tym klubie - w innym klubie ta osoba może mieć inny."
        >
          <TextInput
            id="code"
            mono
            value={draft.code}
            disabled={readOnly}
            invalid={verdict.invalid.includes('code') || field === 'code'}
            onChange={(event) => setDraft({ ...draft, code: normalizeCode(event.target.value) })}
          />
        </Field>
        {field === 'code' && conflict != null ? <p className="hint danger">{conflict}</p> : null}
      </Card>

      <Card title="Rola w klubie">
        <div className="opt-list" role="radiogroup" aria-label="Rola konta">
          {ROLE_ORDER.map((role) => (
            <OptionButton
              key={role}
              name={roleLabel(role)}
              desc={roleNote(role)}
              selected={draft.role === role}
              disabled={readOnly}
              onSelect={() => setDraft({ ...draft, role })}
            />
          ))}
        </div>
      </Card>

      {pilot == null || readOnly ? null : (
        <Card title="Dostęp">
          <div className="access-row">
            <span className="kv-k">Członkostwo w klubie</span>
            {pilot.active ? (
              <Button
                variant="danger"
                size="sm"
                disabled={pending || pilot.id === selfId}
                reason={pilot.id === selfId ? SELF_ACCOUNT : undefined}
                onClick={() => setConfirm('disable')}
              >
                Wyłącz członkostwo
              </Button>
            ) : (
              <Button
                variant="ok"
                size="sm"
                disabled={pending}
                onClick={() =>
                  setActive.mutate(
                    { id: pilot.id, active: true },
                    { onSuccess: () => setDone(`${pilot.name} znów jest w klubie.`) },
                  )
                }
              >
                Włącz członkostwo
              </Button>
            )}
          </div>

          {confirm === 'disable' ? (
            <div className="confirm">
              {/* DWUKROPEK, nie „konto Anny Kowal" (2026-09-07). Pytanie musi nazwać
                  konto, a polszczyzna chciałaby tu dopełniacza - odmiany dowolnego
                  nazwiska nie da się złożyć w kodzie („Kowal" → „Kowal", ale
                  „Małkiewicz" → „Małkiewicza"), więc szablon obiecywał brzmienie,
                  którego panel nie umie wyprodukować. Dwukropek stawia nazwisko
                  w mianowniku i jest poprawny dla KAŻDEGO. */}
              <p className="confirm-q">Wyłączyć członkostwo: {pilot.name}?</p>
              {/* Trzy rzeczy, po które sięga administrator: dostęp (od razu), dane
                  (zostają) i INNE KLUBY tej osoby (bez zmian) - trzecia jest nowa
                  w 2.0.0 i bez niej wyłączenie czytałoby się jak zablokowanie człowieka. */}
              <p className="hint">
                Przestanie się logować w tym klubie od razu - na telefonie i w panelu. Loty
                zostają w dzienniku klubu; członkostwa w innych klubach bez zmian.
              </p>
              <div className="confirm-actions">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                  Anuluj
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    setActive.mutate(
                      { id: pilot.id, active: false },
                      {
                        onSuccess: () => {
                          setConfirm(null);
                          setDone(`${pilot.name} nie jest już w klubie.`);
                        },
                      },
                    )
                  }
                >
                  Wyłącz członkostwo
                </Button>
              </div>
            </div>
          ) : null}

          <div className="access-row">
            <span className="kv-k">Usuń z klubu</span>
            {/* Powód blokady stoi W PRZYCISKU, bo widać go z listy: członkostwo ma
                plakietkę „Aktywny". Drugiego warunku (brak lotów w TYM klubie) panel nie
                zna - lista nie niesie ich liczby - więc ten wraca odmową serwera.
                Usunięcie dotyczy CZŁONKOSTWA: osoba zostaje na serwerze ze swoimi innymi
                klubami, a osobę bez żadnego członkostwa sprząta superadministrator. */}
            <Button
              variant="danger"
              size="sm"
              disabled={pending || deleteBlocker(pilot, selfId) != null}
              reason={deleteBlocker(pilot, selfId) ?? undefined}
              onClick={() => setConfirm('delete')}
            >
              Usuń z klubu
            </Button>
          </div>

          {confirm === 'delete' ? (
            <div className="confirm">
              <p className="confirm-q">Usunąć z klubu: {pilot.name}?</p>
              <p className="hint">
                Zniknie z listy klubu na zawsze - tego nie da się cofnąć. Jeśli ma tu
                zapisane loty, członkostwo zostanie tylko wyłączone.
              </p>
              <div className="confirm-actions">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                  Anuluj
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  // Po udanym usunięciu ZAMYKAMY kartę: członkostwa, którego dotyczyła,
                  // już nie ma, a formularz nad nieistniejącym wierszem obiecuje zapis.
                  onClick={() => remove.mutate(pilot.id, { onSuccess: onClose })}
                >
                  Usuń z klubu
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </Drawer>
  );
}

/** Podtytuł karty: kod, e-mail i - gdy trzeba - stan konta. */
function subtitleOf(pilot: PilotListItemDto): string {
  const parts = [pilot.code, pilot.email ?? 'bez adresu Google'];
  if (!pilot.active) parts.push('członkostwo wyłączone');
  return parts.join(' · ');
}
