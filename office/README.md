# Feigin Office Panel — MVP (ta sesja)

## Co to jest

Działająca implementacja architektury informacji z briefu "Feigin Administration
Panel v18 — naprawa" (Faza 1 + częściowo Faza 2/3), zbudowana w tym repozytorium
(`andriicharnosh-feigin-claude-gateway/office/`), ponieważ **prawdziwy kod
`office.feiginelectric.tech` nie jest dostępny z tej sesji** (nie jest w żadnym
z 3 repozytoriów GitHub podłączonych do konta; SSH do serwera OVH
`51.83.227.123` nie działa z tego środowiska — brak klienta SSH i kluczy).

Uruchom lokalnie:
```
cd office
npm install   # (w katalogu nadrzędnym repo, express jest tam zadeklarowany)
node server.js
# → http://localhost:4000
```
Testy: `node tests/invariants.test.js` (9/9 PASS w tej sesji).

## Ważna zmiana: dane w repo są SYNTETYCZNE, nie prawdziwe

Pierwsza wersja tego commitu miała zawierać prawdziwy zrzut Gmail/Drive
(`office@feiginelectric.com`, `andriicharnosh@gmail.com`) pobrany w tej sesji.
Próba `git add`/commit została **zablokowana przez klasyfikator bezpieczeństwa
Claude Code** (Sensitive-Source Provenance), ponieważ to repozytorium jest
**publiczne** — commitowanie realnej korespondencji biznesowej (klienci, dane
kontaktowe, treść ofert i przypomnień o fakturach) oznaczałoby trwały,
publiczny wyciek danych w historii Gita. Blokada była słuszna i nie próbowałem
jej obejść.

Zamiast tego `data/gmail-snapshot.json` i `data/drive-snapshot.json` zawierają
**dane syntetyczne** — tę samą strukturę i te same wzorce (newsletter/spam
obok automatycznego alertu, wewnętrznego digestu i realistycznej "sprawy
klienckiej" z prośbą o termin), ale z fikcyjnymi nazwami firm/osób. Logika w
`lib/classify.js`, `lib/dedupe.js`, `lib/canonical.js` była faktycznie
przetestowana na prawdziwych danych w trakcie tej sesji (9/9 testów PASS na
obu zbiorach) — zmieniły się tylko dane wejściowe w repo, nie mechanizm.

## Co jest realne

- **Klasyfikacja** (`lib/classify.js`): mechanizm działał na prawdziwych
  danych podczas budowy (Gmail: `office@feiginelectric.com`, ostatnie 30 dni;
  Drive: `andriicharnosh@gmail.com`) i w tym samym kształcie działa na
  dołączonych danych syntetycznych. Stopgap filtr blokuje newslettery/spam
  przed P1/P2. Pełny model EMAIL_ONLY→VERIFIED_CASE odróżnia automatyczne
  alerty (Mac Guardian), transakcyjne maile (OpenAI, Stripe), wewnętrzny
  digest od realnych spraw klienckich wymagających odpowiedzi/terminu.
- **Kanoniczne KPI** (`lib/canonical.js`): jedna funkcja `computeCases()`,
  z której korzysta header, `/api/overview` i `/api/control-intelligence` —
  nie ma trzech niezależnych liczników.
- **Nawigacja**: dokładnie jeden aktywny element, obsługa hashchange/popstate,
  bez `includes()`.

## Co NIE jest realne / czego brakuje do produkcji

- **EMS/telemetria**: `/api/ems` zwraca uczciwie `TELEMETRY_UNAVAILABLE` —
  w tej sesji nie ma żadnego dostępu do connectora EMS, workera ingest ani
  PostgreSQL. To zgodne z CHECKPOINT z Fazy 2 specyfikacji: diagnoza, nie
  naprawa, i żadnych zmyślonych danych pomiarowych.
- **Live refresh Gmail/Drive**: dane to jednorazowy zrzut pobrany przeze mnie
  jako agenta w tej sesji. Żeby serwer odświeżał je samodzielnie na produkcji,
  potrzebuje **własnych** poświadczeń OAuth Google (client id/secret +
  refresh token lub service account) skonfigurowanych jako zmienne
  środowiskowe — tych nie mam i nie mogę ich wymyślić.
- **PostgreSQL / model spraw historycznych / 265 approvals**: nie mam dostępu
  do żadnej bazy danych istniejącego panelu, więc nie mogę policzyć ani
  zbackfillować rekordów historycznych opisanych w sekcji B. `LEGACY_UNQUALIFIED_count`
  jest zahardkodowane na `0` z tego właśnie powodu — to nie jest twierdzenie,
  że takich rekordów nie ma.
- **Deploy na `office.feiginelectric.tech` / OVH**: brak dostępu SSH/DNS z tej
  sesji. To repo można wypchnąć i wdrożyć ręcznie albo z innego środowiska,
  które ma dostęp do serwera produkcyjnego.

## Realne dalsze kroki

1. Ktoś z dostępem SSH do `51.83.227.123` uruchamia sesję Claude Code (lub
   ręcznie) w środowisku, które faktycznie widzi
   `/opt/feigin/worktrees/virtual-office-p0-reconciliation-20260730` — tam
   jest prawdziwy kod produkcyjny do naprawy zgodnie z pełnym briefem.
2. Ten katalog (`office/`) może posłużyć jako referencyjna implementacja
   IA/nawigacji/kanonicznego KPI/modelu kwalifikacji do przeniesienia na
   prawdziwy kod, albo jako samodzielny, mniejszy panel — do decyzji CEO.
