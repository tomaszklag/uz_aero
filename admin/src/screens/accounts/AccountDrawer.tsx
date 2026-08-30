/**
 * UZ Aero - panel 2.0: karta pilota - nowe konto i zmiana istniejącego (`#/piloci/:id`).
 *
 * Trzy sekcje i tyle: kim jest, co mu wolno, jak wchodzi. Panel 1.0 miał w tym miejscu
 * pięć sekcji, sześć banerów i 2 700 znaków prozy tłumaczącej budowę systemu - w tym
 * cztery wiersze o rodzajach sesji, których pilot nigdy nie zobaczy.
 *
 * == SKUTEK MOWIMY PRZED AKCJA, NIE PO NIEJ ==
 * Wyłączenie konta pyta o potwierdzenie i w pytaniu mówi obie rzeczy, które trzeba
 * wiedzieć: co z dostępem i co z danymi. Po akcji zostaje jedno zdanie potwierdzenia.
 * Odwrotna kolejność (baner po fakcie, tłumaczący co się właśnie stało) była w 1.0
 * i jest odwróceniem ról: człowiek dowiadywał się o skutku, gdy nie mógł już nic zrobić.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PilotListItemDto } from '../../api/dto';
import {
  useCreatePilot,
  useDeletePilot,
  useResetPilotPassword,
  useSetPilotActive,
  useUpdatePilot,
} from '../../queries/usePilotCommands';
import { Banner, Button, Card, Drawer, Field, OptionButton, Pill, TextInput } from '../../ui/components';
import { conflictField, errorMessage, refusalOf } from '../common/apiMessage';
import {
  createBodyOf,
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
import { accountConflictMessage, accountRefusalMessage } from './accountRefusal';
import { roleLabel, roleNote, ROLE_ORDER } from './accountRows';

interface AccountDrawerProps {
  /** `nowy` albo identyfikator konta z listy. */
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
  const creating = id === 'nowy';
  const pilot = creating ? null : (pilots?.find((item) => item.id === id) ?? null);

  const [draft, setDraft] = useState<AccountDraft>(EMPTY_ACCOUNT);
  /**
   * Hasło pokazane raz. `created` znaczy „konto właśnie powstało" i zamienia kartę
   * w podsumowanie: formularz znika, bo drugie kliknięcie „Utwórz konto" założyłoby
   * drugie konto o tym samym nazwisku.
   */
  const [secret, setSecret] = useState<{ name: string; password: string; created: boolean } | null>(
    null,
  );
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
    const key = draftKey(creating, pilot);
    if (key == null || synced.current === key) return;
    synced.current = key;
    setDraft(pilot == null ? EMPTY_ACCOUNT : draftOf(pilot));
    setConfirm(null);
    setDone(null);
  }, [creating, pilot]);

  const create = useCreatePilot();
  const update = useUpdatePilot();
  const setActive = useSetPilotActive();
  const reset = useResetPilotPassword();
  const remove = useDeletePilot();

  const pending =
    create.isPending ||
    update.isPending ||
    setActive.isPending ||
    reset.isPending ||
    remove.isPending;
  const error = create.error ?? update.error ?? setActive.error ?? reset.error ?? remove.error;

  const verdict = verdictOf(draft);
  const changed = pilot == null ? true : hasChanges(pilot, draft);
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
    if (pilot == null) {
      create.mutate(createBodyOf(draft), {
        onSuccess: (result) => {
          setSecret({ name: result.pilot.name, password: result.password, created: true });
          setDone(null);
        },
      });
      return;
    }
    update.mutate(
      { id: pilot.id, body: updateBodyOf(pilot, draft) },
      { onSuccess: () => setDone('Zapisano.') },
    );
  };

  const title = creating ? 'NOWY PILOT' : (pilot?.name ?? 'PILOT').toUpperCase();
  const sub = pilot == null ? 'Nowe konto' : subtitleOf(pilot);

  // Konto właśnie powstało: karta pokazuje wyłącznie hasło i wyjście. Formularz pod
  // spodem obiecywałby drugi zapis, a on założyłby drugie konto.
  if (secret?.created === true) {
    return (
      <Drawer
        title={title}
        sub={`${secret.name} · konto założone`}
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose}>
            Zamknij
          </Button>
        }
      >
        <PasswordCard name={secret.name} password={secret.password} />
      </Drawer>
    );
  }

  return (
    <Drawer
      title={title}
      sub={
        <>
          {sub}
          {readOnly ? <Pill tone="dim">tylko podgląd</Pill> : null}
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
              {pending ? 'Zapisuję…' : creating ? 'Utwórz konto' : 'Zapisz'}
            </Button>
          </>
        )
      }
    >
      {/* Konto spoza listy: wklejony link do kogoś, kogo bieżące zawężenie nie pokazuje. */}
      {!creating && pilot == null && !listPending ? (
        <Card title="Nie ma go na liście">
          <p className="hint">
            Wyszukiwanie albo zawężenie ukrywa to konto.{' '}
            <Link to="/piloci">Pokaż wszystkich</Link>
          </p>
        </Card>
      ) : null}

      {secret == null ? null : (
        <PasswordCard
          name={secret.name}
          password={secret.password}
          onDismiss={() => setSecret(null)}
        />
      )}

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

      <Card title="Dane pilota">
        <Field htmlFor="name" label="Imię i nazwisko">
          <TextInput
            id="name"
            value={draft.name}
            disabled={readOnly}
            invalid={verdict.invalid.includes('name')}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>

        <Field
          htmlFor="code"
          label="Kod pilota"
          hint="Krótki skrót przy każdym locie, np. TMK. Można się nim logować."
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

        <Field
          htmlFor="email"
          label="E-mail"
          hint="Można zostawić puste - wtedy pilot loguje się kodem."
        >
          <TextInput
            id="email"
            mono
            value={draft.email}
            disabled={readOnly}
            invalid={verdict.invalid.includes('email') || field === 'email'}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
        </Field>
        {field === 'email' && conflict != null ? <p className="hint danger">{conflict}</p> : null}
      </Card>

      <Card title="Rola">
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
            <span className="kv-k">Hasło</span>
            <Button
              variant="ok"
              size="sm"
              disabled={pending || !pilot.active}
              reason={pilot.active ? undefined : 'najpierw włącz konto'}
              onClick={() =>
                reset.mutate(pilot.id, {
                  onSuccess: (result) =>
                    // `created: false` - to jest to samo hasło pokazane raz, ale konto
                    // już istniało, więc formularz zostaje na ekranie.
                    setSecret({
                      name: result.pilot.name,
                      password: result.password,
                      created: false,
                    }),
                })
              }
            >
              Ustaw nowe hasło
            </Button>
          </div>

          <div className="access-row">
            <span className="kv-k">Konto</span>
            {pilot.active ? (
              <Button
                variant="danger"
                size="sm"
                disabled={pending || pilot.id === selfId}
                reason={pilot.id === selfId ? 'to Twoje konto' : undefined}
                onClick={() => setConfirm('disable')}
              >
                Wyłącz konto
              </Button>
            ) : (
              <Button
                variant="ok"
                size="sm"
                disabled={pending}
                onClick={() =>
                  setActive.mutate(
                    { id: pilot.id, active: true },
                    { onSuccess: () => setDone(`Konto ${pilot.name} włączone.`) },
                  )
                }
              >
                Włącz konto
              </Button>
            )}
          </div>

          {confirm === 'disable' ? (
            <div className="confirm">
              <p className="confirm-q">Wyłączyć konto {pilot.name}?</p>
              <p className="hint">
                Przestanie się logować od razu - na telefonie i w panelu. Zapisane loty
                zostają w systemie.
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
                          setDone(`Konto ${pilot.name} wyłączone.`);
                        },
                      },
                    )
                  }
                >
                  Wyłącz konto
                </Button>
              </div>
            </div>
          ) : null}

          <div className="access-row">
            <span className="kv-k">Usuń trwale</span>
            {/* Powód blokady stoi W PRZYCISKU, bo widać go z listy: konto ma plakietkę
                „Aktywny". Drugiego warunku (brak historii) panel nie zna - lista nie
                niesie liczby lotów - więc ten wraca odmową serwera z nazwanym powodem. */}
            <Button
              variant="danger"
              size="sm"
              disabled={pending || deleteBlocker(pilot, selfId) != null}
              reason={deleteBlocker(pilot, selfId) ?? undefined}
              onClick={() => setConfirm('delete')}
            >
              Usuń konto
            </Button>
          </div>

          {confirm === 'delete' ? (
            <div className="confirm">
              <p className="confirm-q">Usunąć konto {pilot.name}?</p>
              <p className="hint">
                Zniknie z listy na zawsze - tego nie da się cofnąć. Jeśli konto ma
                zapisane loty, zostanie tylko wyłączone.
              </p>
              <div className="confirm-actions">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                  Anuluj
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  // Po udanym usunięciu ZAMYKAMY kartę: konta, którego dotyczyła, już
                  // nie ma, a formularz nad nieistniejącym wierszem obiecuje zapis.
                  onClick={() => remove.mutate(pilot.id, { onSuccess: onClose })}
                >
                  Usuń konto
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
  const parts = [pilot.code, pilot.email ?? 'bez e-maila'];
  if (!pilot.active) parts.push('konto wyłączone');
  return parts.join(' · ');
}

/**
 * Hasło pokazane JEDEN RAZ.
 *
 * Nie ma trasy „pokaż ponownie", więc karta musi to powiedzieć - ale jednym zdaniem
 * i takim, które mówi CO ZROBIC („zapisz je teraz"), a nie gdzie w bazie leży hash.
 */
function PasswordCard({
  name,
  password,
  onDismiss,
}: {
  name: string;
  password: string;
  onDismiss?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    // Schowek potrafi nie istnieć (stara przeglądarka) albo odmówić (brak zgody).
    // Hasło jest wtedy nadal na ekranie i da się je przepisać - więc milczymy
    // przyciskiem zamiast wywalać się błędem nad wypełnionym formularzem.
    try {
      await navigator.clipboard?.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="secret">
      <div className="secret-head">
        <span className="secret-title">Hasło dla: {name}</span>
        {onDismiss == null ? null : (
          <button type="button" className="x-btn" aria-label="Ukryj hasło" onClick={onDismiss}>
            ×
          </button>
        )}
      </div>
      <div className="secret-row">
        <code className="secret-value">{password}</code>
        <Button size="sm" onClick={() => void copy()}>
          {copied ? 'Skopiowano' : 'Kopiuj'}
        </Button>
      </div>
      <p className="hint">Zapisz je teraz - po zamknięciu okna nie da się go odczytać.</p>
    </div>
  );
}
