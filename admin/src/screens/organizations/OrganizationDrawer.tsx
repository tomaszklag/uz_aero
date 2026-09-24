/**
 * Ninerdeck - panel: klub - założenie i karta (`#/organizacje/nowy`, `#/organizacje/:id`;
 * mockup `organizacje-klub`).
 *
 * DWA TRYBY W JEDNEJ SZUFLADZIE, bo to ten sam byt na dwóch etapach życia. Różnice są
 * dokładnie trzy:
 *  • **adres** jest polem przy zakładaniu i napisem potem - nadaje się go raz, bo stoi
 *    w adresach kart arkusza;
 *  • **pierwszy administrator** jest formularzem przy zakładaniu i listą potem - klub
 *    bez niego nie ma jak zacząć (kodem klubu nie miałby go kto zatwierdzić), a zmienia
 *    się go już w klubie, nie na platformie;
 *  • **kod klubu i „Dostęp"** istnieją dopiero, gdy klub istnieje.
 *
 * ══ CZEGO TU NIE MA ══
 * Kasowania klubu (dziennik jest jego dokumentem), generowania kodu klubu (to panel
 * KLUBU - kod jest jego konfiguracją i prowadzi go sam) i jakiegokolwiek wejścia
 * w dane klubu. Superadministrator widzi liczby i administratorów - `docs/wielofirmowosc.md`
 * §3.3.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { OrganizationAdminDto, PasswordLinkSentDto } from '../../api/dto';
import {
  useCreateOrganization,
  useOrganization,
  useResendInvite,
  useSetOrganizationActive,
  useUpdateOrganization,
} from '../../queries/useOrganizations';
import { Banner, Button, Card, Drawer, Field, Pill, TextInput } from '../../ui/components';
import { CheckIcon } from '../../ui/components/icons';
import {
  linkBlocker,
  linkFailureText,
  linkSentText,
  linkValidity,
} from '../accounts/passwordAccess';
import { lastSeenText } from '../accounts/sessionRows';
import { conflictField, errorMessage, invalidField } from '../common/apiMessage';
import { clubTimeZones } from './timeZones';
import { dateWithYear, NONE } from '../common/values';
import {
  createBodyOf,
  draftOf,
  EMPTY_ORGANIZATION,
  hasChanges,
  NEW_ORGANIZATION,
  normalizeCode,
  patchBodyOf,
  normalizeIcao,
  slugFrom,
  verdictOf,
  type OrganizationDraft,
} from './organizationForm';

interface OrganizationDrawerProps {
  /** Identyfikator klubu albo `nowy` - tryb rozstrzyga adres, nie stan komponentu. */
  id: string;
  onClose: () => void;
}

export function OrganizationDrawer({ id, onClose }: OrganizationDrawerProps) {
  const creating = id === NEW_ORGANIZATION;
  const query = useOrganization(creating ? null : id);
  const organization = query.data?.organization ?? null;

  const [draft, setDraft] = useState<OrganizationDraft>(EMPTY_ORGANIZATION);
  /**
   * Czy adres był RUSZANY ręką. Bez tego podpowiedź z nazwy nadpisywałaby wpis
   * administratora przy każdej kolejnej literze nazwy - a adres jest polem, które wolno
   * skrócić (`ks-gliwice` zamiast `klub-spadochronowy-gliwice`).
   */
  const [slugTouched, setSlugTouched] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Szkic przestawia się DOKŁADNIE wtedy, gdy zmienia się tożsamość klubu - także przy
  // jego PIERWSZYM pojawieniu się, bo przy wejściu z linku szuflada montuje się przed
  // odpowiedzią serwera. Odświeżenie po zapisie klucza nie zmienia, więc nie kasuje
  // tego, co człowiek właśnie wpisał.
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (organization == null || synced.current === organization.id) return;
    synced.current = organization.id;
    setDraft(draftOf(organization));
    setConfirmDisable(false);
    setDone(null);
  }, [organization]);

  const create = useCreateOrganization();
  const update = useUpdateOrganization();
  const setActive = useSetOrganizationActive();

  const pending = create.isPending || update.isPending || setActive.isPending;
  const error = create.error ?? update.error ?? setActive.error;

  const verdict = verdictOf(draft, creating ? 'create' : 'edit');
  const changed = creating || (organization != null && hasChanges(organization, draft));

  const field = conflictField(error);
  // `400 invalid` to inne zdanie niż `409 conflict`: tam wartość jest poprawna i tylko
  // zajęta, tu nie da się jej przyjąć w ogóle.
  const rejected = invalidField(error);
  const conflict =
    field === 'slug'
      ? 'Ten adres jest już zajęty przez inny klub. Wybierz inny.'
      : field === 'email'
        ? 'Ta osoba jest już administratorem tego klubu.'
        : null;
  const generalError =
    error == null || conflict != null || rejected != null ? null : errorMessage(error);

  const save = (): void => {
    if (creating) {
      create.mutate(createBodyOf(draft), {
        // Po założeniu ZOSTAJEMY w szufladzie, tylko już jako karta klubu: to tutaj stoi
        // kod klubu, który superadministrator ma przekazać pierwszemu administratorowi.
        // Zamknięcie karty odesłałoby go po ten kod z powrotem na listę.
        onSuccess: (change) => {
          synced.current = change.organization.id;
          setDraft(draftOf(change.organization));
          setDone(`Klub ${change.organization.name} założony.`);
        },
      });
      return;
    }
    if (organization == null) return;
    update.mutate(
      { id: organization.id, ...patchBodyOf(organization, draft) },
      { onSuccess: () => setDone('Zapisano.') },
    );
  };

  // Po założeniu karta pokazuje KLUB, który właśnie powstał - `creating` opisuje
  // wyłącznie to, z jakiego adresu weszliśmy, a nie to, co jest na ekranie.
  const created = create.data?.organization ?? organization;
  const showsCard = created != null;

  return (
    <Drawer
      title={showsCard ? created.name : 'Nowy klub'}
      sub={
        showsCard ? (
          <>
            <span className="mono">{created.slug}</span> · założony{' '}
            {dateWithYear(created.createdAt)}
            {created.active ? null : <Pill tone="dim">Wyłączony</Pill>}
          </>
        ) : (
          'Klub zaczyna działać w chwili, w której ma administratora'
        )
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {showsCard && creating ? 'Zamknij' : 'Anuluj'}
          </Button>
          {showsCard && creating ? null : (
            <Button
              variant="primary"
              onClick={save}
              disabled={pending || !verdict.complete || verdict.blocker != null || !changed}
              reason={verdict.blocker ?? undefined}
            >
              {pending ? 'Zapisuję…' : creating ? 'Załóż klub' : 'Zapisz'}
            </Button>
          )}
        </>
      }
    >
      {generalError == null ? null : (
        <Banner tone="danger" live>
          {generalError}
        </Banner>
      )}
      {done == null ? null : (
        <Banner tone="ok" live>
          {done}
        </Banner>
      )}

      <Card title="Klub">
        <Field htmlFor="org-name" label="Nazwa">
          <TextInput
            id="org-name"
            value={draft.name}
            invalid={verdict.invalid.includes('name')}
            onChange={(event) => {
              const name = event.target.value;
              setDraft((prev) => ({
                ...prev,
                name,
                // Adres podpowiada się z nazwy, dopóki nikt go nie tknął.
                slug: creating && !slugTouched ? slugFrom(name) : prev.slug,
              }));
            }}
          />
        </Field>

        <Field
          htmlFor="org-slug"
          label="Adres"
          hint={
            creating
              ? 'Podpowiedziany z nazwy. Po założeniu już się nie zmienia - stoi w adresach kart arkusza.'
              : 'Stały od założenia - stoi w adresach kart arkusza.'
          }
        >
          <TextInput
            id="org-slug"
            mono
            value={showsCard && !creating ? created.slug : draft.slug}
            disabled={!creating || showsCard}
            invalid={verdict.invalid.includes('slug') || field === 'slug'}
            onChange={(event) => {
              setSlugTouched(true);
              setDraft((prev) => ({ ...prev, slug: event.target.value }));
            }}
          />
        </Field>
        {conflict != null && field === 'slug' ? <p className="hint danger">{conflict}</p> : null}

        {!showsCard ? null : (
          <>
            <div className="kv">
              <span className="kv-k">Członkowie</span>
              <span className="kv-v">{created.members}</span>
            </div>
            <div className="kv">
              <span className="kv-k">Samoloty</span>
              <span className="kv-v">{created.aircraft}</span>
            </div>
          </>
        )}
      </Card>

      {/* KALENDARZ KLUBU (3.0.0, `docs/rezerwacje.md` §7.1) - wyłącznie na KARCIE.
          Formularz zakładania o to nie pyta: klub powstaje razem z administratorem jednym
          zamówieniem, a szuflada zostaje potem otwarta już jako karta, więc pola są na
          wyciągnięcie ręki. Puste pola NIE BLOKUJĄ niczego - kalendarz schodzi wtedy na
          okno domyślne, tą samą zasadą, przez którą brak normy zużycia nie blokuje lotu. */}
      {!showsCard ? null : (
        <Card title="Kalendarz">
          <Field
            htmlFor="org-icao"
            label="Lotnisko macierzyste"
            // Nazwa z katalogu opisuje kod ZAPISANY, więc pokazujemy ją wyłącznie wtedy,
            // gdy pole jeszcze go niesie - inaczej po wpisaniu `EPKK` pod spodem dalej
            // stałoby „Gliwice-Trynek", czyli podpis o innym lotnisku niż to w polu.
            hint={
              normalizeIcao(draft.homeIcao) === (created.homeIcao ?? '') &&
              created.homeAirfieldName != null
                ? created.homeAirfieldName
                : 'Z jego współrzędnych liczy się doba lotna. Puste = kalendarz stoi na 06:00-21:00.'
            }
          >
            <TextInput
              id="org-icao"
              mono
              value={draft.homeIcao}
              placeholder="Kod ICAO"
              invalid={rejected === 'homeIcao'}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, homeIcao: event.target.value }))
              }
            />
          </Field>
          {rejected === 'homeIcao' ? (
            <p className="hint danger">Nie znam takiego lotniska. Sprawdź kod ICAO.</p>
          ) : null}

          <Field
            htmlFor="org-tz"
            label="Strefa czasu"
            hint="Godziny kalendarza i rezerwacji. Log operacji zostaje w UTC."
          >
            <select
              id="org-tz"
              className="input"
              value={draft.timezone}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, timezone: event.target.value }))
              }
            >
              {clubTimeZones(draft.timezone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>
          {rejected === 'timezone' ? (
            <p className="hint danger">Tej strefy nie znam. Wybierz z listy.</p>
          ) : null}
        </Card>
      )}

      {creating && !showsCard ? <FirstAdminCard draft={draft} setDraft={setDraft} verdict={verdict} conflict={field === 'email' ? conflict : null} /> : null}

      {!showsCard ? (
        <Card title="Kod klubu">
          {/* Kod powstaje RAZEM z klubem, więc formularz o niego nie pyta - mówi tylko,
              że będzie. Zapytanie o kod byłoby pytaniem o liczbę losową. */}
          <span className="hint">
            Wygeneruje się razem z klubem - przekaż go administratorowi razem z dostępem.
            Nowe kody generuje potem on sam.
          </span>
        </Card>
      ) : (
        <>
          <AdminsCard orgId={created.id} admins={created.admins} justInvited={create.data?.invite ?? null} />

          <Card title="Kod klubu">
            <div className="club-code-row">
              <span className={created.joinCodeFormatted == null ? 'club-code off' : 'club-code'}>
                {created.joinCodeFormatted ?? '— — —'}
              </span>
              <span className="cell-sub">
                {created.joinCodeSince == null ? NONE : `od ${dateWithYear(created.joinCodeSince)}`}
              </span>
            </div>
            <span className="hint">
              Jedyna droga do klubu dla pilotów. Nowy kod generuje administrator klubu u siebie.
            </span>
          </Card>

          {creating ? null : (
            <Card title="Dostęp">
              <div className="access-row">
                <span>Klub na serwerze</span>
                {created.active ? (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={pending}
                    onClick={() => setConfirmDisable(true)}
                  >
                    Wyłącz klub
                  </Button>
                ) : (
                  <Button
                    variant="ok"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      setActive.mutate(
                        { id: created.id, active: true },
                        { onSuccess: () => setDone(`Klub ${created.name} włączony.`) },
                      )
                    }
                  >
                    Włącz klub
                  </Button>
                )}
              </div>

              {!confirmDisable ? null : (
                <div className="confirm">
                  {/* DWUKROPEK, nie dopełniacz: odmiany dowolnej nazwy klubu nie da się
                      złożyć w kodzie, a mianownik po dwukropku jest poprawny dla każdej. */}
                  <p className="confirm-q">Wyłączyć klub: {created.name}?</p>
                  <p className="hint">
                    Panel i aplikacja przestaną wpuszczać jego członków od razu. Dziennik,
                    flota i konta zostają - klub da się włączyć z powrotem.
                  </p>
                  <div className="confirm-actions">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDisable(false)}>
                      Nie
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        setActive.mutate(
                          { id: created.id, active: false },
                          {
                            onSuccess: () => {
                              setConfirmDisable(false);
                              setDone(`Klub ${created.name} wyłączony.`);
                            },
                          },
                        )
                      }
                    >
                      Wyłącz
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </Drawer>
  );
}

/**
 * PIERWSZY ADMINISTRATOR - pole wymagane, nie opcja.
 *
 * To jedyne miejsce w systemie, w którym członkostwo powstaje z ADRESU: klasa bootstrap,
 * nie druga droga do klubu (`docs/wielofirmowosc.md` §3.8). Z panelu KLUBU nie da się
 * nikogo dopisać ani adresem, ani linkiem - wchodzi się wyłącznie kodem klubu.
 */
function FirstAdminCard({
  draft,
  setDraft,
  verdict,
  conflict,
}: {
  draft: OrganizationDraft;
  setDraft: (update: (prev: OrganizationDraft) => OrganizationDraft) => void;
  verdict: ReturnType<typeof verdictOf>;
  conflict: string | null;
}) {
  return (
    <Card title="Pierwszy administrator">
      {/* ADRES NIE MUSI BYĆ KONTEM GOOGLE (2.1.0, `docs/logowanie-haslem.md` D8): razem
          z klubem wychodzi do niego list z linkiem do ustawienia hasła (72 h), więc
          etykieta brzmi „E-mail", a podpis mówi o SKUTKU - co ten człowiek dostanie
          i jak wejdzie. Podpięcie Googlem po tym samym adresie działa dalej. */}
      <Field
        htmlFor="org-admin-email"
        label="E-mail"
        hint="Tym adresem się zaloguje. Dostanie e-mail z linkiem do ustawienia hasła; jeśli to adres Google, może też kliknąć Google."
      >
        <TextInput
          id="org-admin-email"
          mono
          value={draft.adminEmail}
          invalid={verdict.invalid.includes('adminEmail') || conflict != null}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, adminEmail: event.target.value }))
          }
        />
      </Field>
      {conflict == null ? null : <p className="hint danger">{conflict}</p>}

      <Field htmlFor="org-admin-name" label="Imię i nazwisko">
        <TextInput
          id="org-admin-name"
          value={draft.adminName}
          invalid={verdict.invalid.includes('adminName')}
          onChange={(event) => setDraft((prev) => ({ ...prev, adminName: event.target.value }))}
        />
      </Field>

      <Field
        htmlFor="org-admin-code"
        label="Kod pilota"
        hint="Krótki skrót przy każdym locie, np. AKO. Jedyny w tym klubie."
      >
        <TextInput
          id="org-admin-code"
          mono
          value={draft.adminCode}
          invalid={verdict.invalid.includes('adminCode')}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, adminCode: normalizeCode(event.target.value) }))
          }
        />
      </Field>
    </Card>
  );
}

/**
 * Administratorzy = jedyne osoby z klubu widoczne dla superadministratora: odpowiadają
 * na pytanie „do kogo dzwonić". Reszta członków zostaje w klubie.
 *
 * ══ ZAPROSZENIE (2.1.0, `docs/logowanie-haslem.md` D8, §5.4) ══
 * To TEN SAM mechanizm, co reset hasła: link „ustaw hasło" z dłuższą ważnością (72 h)
 * i nazwą klubu w treści listu. Dopóki administrator nie wszedł, wiersz niesie
 * potwierdzenie wysyłki (kiedy i jak długo ważne) oraz „Wyślij ponownie" - nowy list
 * zużywa poprzedni link.
 *
 * Superadministrator NIE WIDZI ani linku, ani kodu i to jest decyzja, nie brak: link do
 * wklejenia w komunikator byłby tym samym kanałem ręcznym, który przegląd właściciela
 * odrzucił razem z kodem jednorazowym. Po pierwszym wejściu wiersz mówi „ostatnia
 * aktywność …", a przycisk znika.
 */
function AdminsCard({
  orgId,
  admins,
  justInvited,
}: {
  orgId: string;
  admins: OrganizationAdminDto[];
  /**
   * Zaproszenie z odpowiedzi ZAŁOŻENIA klubu.
   *
   * Potrzebne, bo list wychodzi PO zapisie klubu: administrator w tej odpowiedzi jest
   * jeszcze bez zaproszenia, choć list właśnie poszedł. Bez tego karta tuż po założeniu
   * milczałaby o wysyłce i kazała wysyłać drugą.
   */
  justInvited: PasswordLinkSentDto | null;
}) {
  const waiting = admins.length > 0 && admins.every((a) => !a.signedIn);
  const resend = useResendInvite(orgId);
  /** Potwierdzenie OSTATNIEJ wysyłki z tego okna - stan ekranu, nie danych karty. */
  const [sent, setSent] = useState<Record<string, PasswordLinkSentDto>>({});
  const now = Date.now();

  const noteSource = (person: OrganizationAdminDto): PasswordLinkSentDto | null => {
    const clicked = sent[person.pilotId];
    if (clicked != null) return clicked;
    const address = person.email?.toLowerCase();
    return justInvited != null && address != null && justInvited.sentTo.toLowerCase() === address
      ? justInvited
      : null;
  };

  return (
    <Card
      title="Administratorzy"
      actions={waiting ? <Pill tone="amber">Nie zalogował się</Pill> : undefined}
    >
      {resend.error == null ? null : (
        <Banner tone="warn" live>
          {linkFailureText(resend.error)}
        </Banner>
      )}

      {admins.length === 0 ? (
        <span className="hint">Ten klub nie ma administratora - nie ma kto zatwierdzać zgłoszeń.</span>
      ) : (
        admins.map((person) => (
          <div className="access-row" key={person.pilotId}>
            <span>
              {person.name}{' '}
              <span className="cell-sub">
                {person.email ?? NONE} · kod {person.code}
              </span>
            </span>
            {person.signedIn ? (
              // Wszedł - zostaje odpowiedź na pytanie „czy ten klub żyje". `null` znaczy
              // „nie ma teraz czynnej sesji", a nie „nigdy nie wszedł", więc milczymy.
              person.lastSeenAt == null ? null : (
                <span className="cell-sub">
                  ostatnia aktywność {lastSeenText(person.lastSeenAt, now)}
                </span>
              )
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={resend.isPending || linkBlocker(person.email) != null}
                reason={linkBlocker(person.email) ?? undefined}
                onClick={() =>
                  resend.mutate(person.pilotId, {
                    onSuccess: (result) => setSent((prev) => ({ ...prev, [person.pilotId]: result })),
                  })
                }
              >
                Wyślij ponownie
              </Button>
            )}

            {/* Nota wysyłki: najpierw ta z TEGO kliknięcia, w jej braku - zaproszenie,
                które serwer trzyma w bazie. Bez drugiego źródła nota znikałaby po
                odświeżeniu strony, a superadministrator wysyłałby drugi list po to,
                żeby się dowiedzieć, że pierwszy jeszcze żyje. */}
            {inviteNote(noteSource(person), person.invite, now)}
          </div>
        ))
      )}
      {!waiting ? null : (
        <span className="hint">
          Administrator wchodzi z linku w e-mailu - ustawia hasło i loguje się do panelu.
          Adres można poprawić, dopóki nie wszedł.
        </span>
      )}
    </Card>
  );
}

/**
 * Potwierdzenie wysyłki pod wierszem administratora; `null` = nic nie wysłano.
 *
 * Zaproszenie PO TERMINIE nie jest „w drodze" i nie udaje, że jest: mówi to wprost,
 * bo to jedyny stan, w którym „Wyślij ponownie" naprawdę trzeba kliknąć.
 */
function inviteNote(
  justSent: PasswordLinkSentDto | null,
  stored: { sentAt: string; expiresAt: string } | null,
  now: number,
): ReactNode {
  if (justSent != null) {
    return (
      <span className="sent-note" role="status">
        <CheckIcon size={13} />
        zaproszenie {linkSentText(justSent, now)}
      </span>
    );
  }
  if (stored == null) return null;

  const expired = new Date(stored.expiresAt).getTime() <= now;
  return (
    <span className="sent-note" role="status">
      {expired ? null : <CheckIcon size={13} />}
      {expired
        ? `zaproszenie wysłano ${dateWithYear(stored.sentAt)} · już wygasło`
        : `zaproszenie wysłano ${dateWithYear(stored.sentAt)} · ważne ${linkValidity(stored.expiresAt, now)}`}
    </span>
  );
}
