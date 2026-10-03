# Stan projektu — 3 października 2026

CaseCheck jest działającą aplikacją pilotażową: od rozmowy i dokumentów do przeglądu sprawy, projektów Word/PDF oraz współpracy w portalu klienta. Można pokazać ją jako konkretny moduł do współpracy freelance z kancelarią lub dostawcą Legal Flow. [Porównanie](POROWNANIE-LEGALFLOW.md) wskazuje szerszy deklarowany zakres konkurenta oraz sprawdzone funkcje CaseCheck; nie mamy podstaw do porównania skuteczności obu modeli.

Etap portalu: **114/114 testów**, portal, własne wzory z historią i zatwierdzaniem, eksport DOCX. Ręcznie przeczytano S01/S02/S04 i końcowe eksporty, sprawdzono obieg klient–zespół, wycofanie starych pism i kopię 12 plików. [Pełny zapis obserwacji i niepowodzeń](RECZNY-PRZEGLAD-PORTALU.md), [dowody JSON](portal-review-2026-10-03.json).

Wykonano trzy dodatkowe operacje API (Anthropic 2, DeepSeek 1): jedna nieudana z błędem typu, jedna poprawna i jedna z błędnym adresem starego wierzyciela. Błąd adresu poprawiono ręcznie; nowy filtr potwierdzono na zapisanych odpowiedziach, bez nowego API. Budżet kopii lokalnej wynosi 20/20 po przeniesieniu bazowych 17 rezerwacji. Historyczne raporty poniżej zachowują swoje pierwotne zakresy.

Najnowszy przegląd wykrył błędy wycofywania danych, zależności pól i pustego pisma. Naprawiono je, ponowiono operacje w interfejsie po restarcie i przeczytano oba końcowe eksporty. **121/121 testów oraz 6/6 odtworzonych scenariuszy HTTP**, bez nowego API. [Pełny zapis napraw i obserwacji](RECZNE-TESTY-KOREKT.md), [raport JSON](correction-review-2026-10-03.json).

Dalsza ręczna kontrola ujawniła błędną klasyfikację HTTP 400 z KRS i niewłaściwą etykietę środowiska. Oba problemy odtworzono przed poprawką, naprawiono i ponowiono zapytania. Udany publiczny KRS i testowy wykaz VAT działają. [Pełny zapis](REJESTRY-I-ZADANIA-PRZEGLAD.md). [Prezentacja](../output/presentation/README.md) oraz [katalog funkcji](FUNKCJE-I-WERYFIKACJA.md) zawierają aktualny zakres.

## Co już jest

Konta i role, izolacja kancelarii, link klienta do jednej sprawy, wywiad konsumencki/firmowy, upload i odczyt dokumentów, AI przez API, OCR skanów, cytaty i strony źródeł, korekty/przegląd, kontrola sald i duplikatów, zadania, pięć wzorów, PDF, KRS/VAT, pakiet JSON po przeglądzie, wersje/audyt oraz kopia i odtworzenie. Aktualny stos: Node.js, SQLite i HTML/CSS/JS; generowanie tekstu przez zewnętrzne API.

Przy rozpoczęciu tej kontynuacji repozytorium zawierało niezacommitowane poprawki odczytu hybrydowego, normalizacji i semantyki oraz większy zestaw testowy. Zachowano je. Ostatni zastany commit: `17b4e93`; lokalnie przechodziło 85 testów.

## Co dodano w tej kontynuacji

Trwały zapis zweryfikowanych wyników AI/OCR przed końcowym zastosowaniem do sprawy. Po awarii lub restarcie zespół odzyskuje wynik z Historii bez nowego API. Odzyskanie jest atomowe, chroni nowsze korekty, nie dodaje drugi raz roszczeń/stron i ma audyt. Zapis jest objęty kopią oraz usuwaniem sprawy. [Opis](ODZYSKIWANIE-WYNIKOW.md).

Dodano 11 testów odzyskiwania, dwa testy błędnej interpretacji braku danych o zabezpieczeniu oraz osiem testów nowego przeglądu OCR. **Na etapie OCR: 106/106 na Node 24.13.0**; obecnie 121/121, bez płatnych wywołań w `npm test`. Dodano bezpłatne plany większej próby (`npm run ai:bench:extended`) i testu całej aplikacji (`npm run test:acceptance`).

Sprawdzono działanie odzyskiwania w przeglądarce na fikcyjnej sprawie: wynik odzyskany, licznik nadal 1/20. [Dowód](images/odzyskany-wynik-test.jpg). Następnie dodano [porównanie oryginału i OCR](PRZEGLAD-OCR.md): strony, korekty z historią, blokowanie nieaktualnych danych i eksportu. Ręcznie przetestowano ekran na kopiach rzeczywistych wyników S11/S12. Ponowiono sześć scenariuszy HTTP z wyłączonym nowym API: 6/6, budżet nadal 17/20. [Bieżący raport](ocr-review-2026-10-03.json).

Przeczytano i porównano wszystkie 200 krótkich syntetycznych tekstów E001–E200 z siedmioma polami odczytu. Trzy braki sporu wynikają z niepoprawnych odpowiedzi JSON; pozostają jawne. [Notatki i granice przeglądu](RECZNY-PRZEGLAD-200.md). Nie wykonano pełnego obiegu aplikacji dla każdego z tych 200 tekstów.

## Rzeczywiste API i obieg aplikacji

[Raport odbioru](acceptance-2026-10-03.json): **6/6 scenariuszy**, 10 źródłowych dokumentów, 17 rzeczywistych wywołań API (DeepSeek 9, Anthropic 2, OpenAI 6). Test uruchamia lokalny serwer HTTP, przesyła prawdziwe pliki PDF i skany, używa parsera/OCR, przeglądu, korekty, powiązania cesji, zadań, zamknięcia sprawy oraz eksportu. Dane są fikcyjne; oczekiwane odpowiedzi nie trafiają do modelu.

Pierwsza próba wykryła błąd: Anthropic zamienił „brak danych” o zabezpieczeniu na „brak” zabezpieczenia. Dodano zachowawczy filtr, dwa testy i wersję reguł `claim-rules-v2`. Nowe płatne wywołanie potwierdziło działanie filtra: wynik `unknown`, cytat zachowany. Wymuszona awaria końcowego zapisu rzeczywistej odpowiedzi została odzyskana bez kolejnego API.

Sprawdzono tekst i wszystkie sześć stron pięciu PDF-ów. Dodatkowa wiadomość klienta firmy przeszła przez API do czterech sekcji planu: przyczyny, działania, harmonogram i stan sprawozdania. Kopię odtworzono w oddzielnej aplikacji: działa logowanie, zachowano sześć spraw, wersje danych, hashe wszystkich załączników i licznik API. Te próby wykonano przez terminal, bez logowania do dostawców w przeglądarce.

## Co mówią dane testowe

[Większy raport](extended-evaluation-2026-10-03.json) pochodzi z wcześniejszych prac: 200 fikcyjnych tekstów UTF-8, 40 rodzin, 400 odczytów dokumentów i 385 wywołań API. Końcowe odtworzenie zapisanych odpowiedzi z aktualnymi regułami obejmuje 1400 pól: 1397 zgodnych z anotacjami, 3 pozostawione do przeglądu, 0 błędnych znanych wartości. W 15 dokumentach reguły lokalne wystarczają bez API.

To dowód działania filtrów na tych materiałach. Anotacje są inżynierskie, reguły rozwijano na zestawie, a badanie nie obejmuje OCR ani oceny prawnej. Do oceny rzeczywistych spraw potrzebny jest osobny, zamrożony zestaw uzgodniony z kancelarią.

## GitHub i prezentacja

Kod, raporty i prezentację opublikowano na `main`. Commit `dd32a3b` zawiera także poprawki rejestrów. [GitHub Actions](https://github.com/krapcys1-maker/casecheck/actions/runs/37120399973) potwierdził **121/121 na Node 22 oraz 24**. Wcześniejszy commit `693ed7a` przeszedł 119/119. [Raport publikacji](publication-check-2026-10-03.json) zachowuje zakres kolejnych prób.

Gotowa [prezentacja 22 slajdy](../output/presentation/README.md) opisuje działanie, funkcje, porównanie z oficjalną ofertą LegalFlow i kierunki poprawy.

## Wdrożenie i następny etap

Najnowszą wersję aplikacji wdrożono na VPS w commicie `0c7c247`: działa istniejący [panel HTTPS](https://astrologiapoludzku.com/casecheck/). [Ręczny odbiór aktualizacji](RECZNY-ODBIOR-VPS.md) obejmuje kopię bazy, migrację schematu, portal klienta, własny wzór, podgląd źródła oraz PDF/Word. Na VPS przeszło 121/121 testów. Po wdrożeniu zachowano 18 spraw, 46 plików, konta, historię i budżet. Dziesięć adresów obu stron zachowało te same odpowiedzi i hashe. Nie wykonywano nowych wywołań modeli.

Adres `https://inproduction.dev/casecheck/` jest przygotowany, ale jeszcze nieaktywny (404). [Migracja domeny](../deploy/PRZENIESIENIE-INPRODUCTION.md) wymaga komendy administratora, ponieważ konto `web` nie może zapisywać konfiguracji tej domeny. Dane dostępu pozostają prywatne.

Kolejność dalszej pracy:

1. Uruchomić przygotowane przeniesienie domeny przez administratora, a potem sprawdzić logowanie, pliki, portal i zachowanie strony portfolio pod nowym adresem. Kod i bieżące wyniki są publikowane na GitHubie.
2. Uzgodnić z kancelarią jeden proces i osobny zestaw dokumentów do oceny. Zmierzyć błędy, czas ręcznego przeglądu, czas poprawek i koszt API.
3. Wykonać niezależny przegląd pytań/wzorów, przygotować dostęp z MFA/SSO oraz zasady danych i kopii przed przyjęciem rzeczywistych spraw.
4. Rozwinąć jeden przydatny adapter do CRM/obiegu kancelarii na istniejącym pakiecie JSON, po uzgodnieniu odbiorcy i formatu.

Brakuje m.in. pełnego KRZ/CEIDG/BIR, integracji CRM/KSeF, podpisu, audio, automatycznej wysyłki oraz niezależnego pomiaru skuteczności na rzeczywistych aktach. Eksport DOCX, własne wzory i przegląd OCR per strona są teraz również w kodzie wdrożonym na VPS. Import dowolnego pliku Word jako wzoru nie jest obsługiwany. Te granice są opisane w [audycie](AUDYT.md).
