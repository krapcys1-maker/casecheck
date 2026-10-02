# CaseCheck — analiza celu, ulepszenia, dane testowe i GitHub

Research: **2 października 2026 r.** Przejrzano cztery dokumenty planistyczne i zapis strony Legal Flow. W katalogu nie było kodu aplikacji. Na GitHubie sprawdzono metadane 20 repozytoriów, wybrane README, pliki licencji i kilka plików kodu. Nie uruchamiano tych projektów. Rekomendacje poniżej są oceną dopasowania do naszego planu, a nie potwierdzeniem jakości produkcyjnej.

## 1. Jaki produkt budujemy

**Asystenta przyjęcia i kontroli sprawy dla kancelarii upadłościowych i restrukturyzacyjnych.** Klient rozmawia i dodaje dokumenty; kancelaria otrzymuje dane, źródła, rozbieżności, projekty dokumentów i zadania. Najbardziej wartościowy wynik to możliwość szybkiego sprawdzenia, dlaczego dana kwota znalazła się w karcie sprawy.

Docelowy zakres bierze się z [PLAN-PELNEGO-BOTA.md](PLAN-PELNEGO-BOTA.md): trwałe dane, konta i role, rzeczywisty wywiad przez API, odczyt plików, przegląd, wersje i zadania. Wcześniejsze dokumenty o demonstracji są materiałem pomocniczym. Pierwszy działający fragment powinien przejść całą ścieżkę na jednej sprawie konsumenckiej, potem analogicznie na zgłoszeniu firmowym. To kolejność realizacji pełnego celu, a nie zamiana aplikacji na odtwarzaną prezentację.

Własny serwer utrzymuje aplikację, pliki, bazę i OCR. Generatywny model działa przez API. Tesseract wykorzystuje model rozpoznawania znaków, ale nie jest generatywnym LLM; nie wymaga lokalnego serwera modelu rozmów. Nie potrzebujemy trenować własnego LLM.

Najlepszy pierwszy scenariusz: klient deklaruje 120 tys. zł, lista daje 110 tys. zł, dwa pisma opisują tę samą umowę pod różnymi wierzycielami i z innymi składnikami kwoty. System przedstawia pytania i kandydatów powiązania. Prawnik otwiera źródła i podejmuje decyzje.

## 2. Ocena obecnych dokumentów

Dobry fundament już istnieje: oddzielenie faktów od wiedzy prawnej, kwoty liczone dokładnie, zachowanie źródeł, zatwierdzenie konkretnej wersji, kontrola dostępu przed pobraniem kontekstu i ostrożność wobec KRZ.

Do doprecyzowania przed implementacją:

- **Jeden dokument nadrzędny.** Pełny plan jest aktualnym zakresem; pomiary, integracje i ograniczenia z pozostałych dokumentów trzeba utrzymywać jako jego załączniki.
- **Dokładny kontrakt faktu i zobowiązania.** Obecny opis jest dobry, ale potrzebuje schematu oraz rozdzielenia pochodzenia, jakości odczytu i decyzji prawnika.
- **Konfiguracja pytań i przejść.** Schemat wymaganych pól powinien być wersjonowany osobno dla ścieżki konsumenckiej i firmowej. LLM nie powinien sam określać kompletności procesu.
- **Powtarzalny zbiór testów.** Dwudziestu opisów scenariuszy nie należy utożsamiać z dwudziestoma sprawdzonymi sprawami ani z testami OCR na rzeczywistych skanach.
- **Jednoznaczne reguły aktualizacji.** Wynik opóźnionego zadania nie może nadpisać nowszej korekty lub wartości potwierdzonej przez prawnika.
- **Granica wiedzy prawnej.** Stan prawny, procedury kancelarii i fakty klienta mają różne wersje i różne osoby zatwierdzające. Cytat potwierdza pochodzenie tekstu, nie poprawność wniosku prawnego.

## 3. Ulepszenia, które warto zaprojektować od początku

| Ulepszenie | Jak działa u nas | Wartość / kolejność |
|---|---|---|
| Pole → źródło | Kliknięcie kwoty otwiera wiadomość lub stronę PDF z zaznaczonym fragmentem | Najwyższa; pierwszy działający fragment |
| Osobne osie statusu | `origin`, `review_status`, `extraction_quality`; np. dokument + oczekuje na przegląd + nieczytelny fragment | Najwyższa; model danych |
| Chronologia kwot | Osobno data pisma, data salda, kapitał, odsetki, koszty, waluta i zakres kwoty | Najwyższa; kontrola danych |
| Tożsamość roszczenia | Umowa i strony są oddzielone od numeru pisma, wierzyciela i nadawcy; cesja tworzy relację do sprawdzenia | Najwyższa; zapobieganie podwójnemu liczeniu |
| Kolejka pytań | Bot wybiera najważniejszy nierozstrzygnięty brak, pokazuje powód pytania i respektuje odpowiedź „nie wiem” | Wysoka; wywiad |
| Przegląd zmian | Prawnik widzi nowe propozycje i różnicę względem zatwierdzonej karty | Wysoka; przegląd |
| Wznowienie i człowiek | Zapis rozmowy, link powrotu, możliwość przekazania sprawy pracownikowi z krótką notatką | Wysoka; pełny proces |
| Rejestr wywołań API | Model, wersja promptu, zakres kontekstu, koszt, czas, status; treść dostępna zgodnie z uprawnieniami sprawy | Wysoka; utrzymanie i mierzenie jakości |
| Pakiet integracyjny | To samo API kontroli zasila własny panel i potencjalny system kancelarii | Wysoka; możliwość współpracy freelancerskiej |
| Kreator konfiguracji | Wersjonowane pytania, wymagane pola i wzory, z testami przed aktywacją | Później; wiele kancelarii |

### Źródła i maskowanie muszą działać razem

Zachowujemy oryginalny plik z hashem oraz osobną wersję tekstu po OCR. Fakt wskazuje identyfikator źródła, wersję ekstrakcji, stronę, cytat i pozycję w tym konkretnym tekście. Model dostaje `source_id` wybranych fragmentów. Backend sprawdza obecność cytatu i odwołanie do dopuszczonego źródła.

Po maskowaniu danych przesunięcia znaków się zmieniają. Potrzebna jest mapa fragmentów między tekstem oryginalnym, OCR i tekstem przekazanym do API. Nie zapisujemy pozycji w tekście zamaskowanym jako pozycji w oryginale. Samo znalezienie cytatu nie dowodzi, że model właściwie odczytał jego znaczenie.

### Brak jest pełnoprawną informacją

`null`, „nie wiem”, „nieczytelne”, „nie dotyczy” i jawne „nie” mają inne znaczenia. Podobnie „około 50 tys.” nie jest dokładnym saldem 50 000,00 zł. Przybliżenia zachowują kwalifikator i nie trafiają bez oznaczenia do dokładnego uzgodnienia sum.

### LLM proponuje, backend decyduje o zapisie

Wyniki modelu stają się propozycjami faktów. Kontrola formatu, kwot, źródeł, wersji i uprawnień odbywa się na serwerze. Sumy, waluty, przejścia etapów, zatwierdzenia i powtarzanie zadań nie zależą od swobodnej odpowiedzi LLM. Nowe wykonanie zadania ma klucz obejmujący sprawę, wersję wejścia i typ zadania. Przed zapisem sprawdzamy, czy wejście nadal jest aktualne.

## 4. Biblioteki z GitHuba: rekomendowane zastosowania

Licencje dotyczą wskazanych projektów lub rdzeni. Przed włączeniem konkretnej wersji sprawdzamy również zależności i licencje modeli. Nie skopiowano kodu z poniższych repozytoriów.

| Projekt | Co można wykorzystać | Decyzja dla CaseCheck | Licencja sprawdzona |
|---|---|---|---|
| [Mozilla PDF.js](https://github.com/mozilla/pdf.js) | Podgląd strony i odczyt warstwy tekstowej | Pierwszy wybór dla PDF z tekstem i panelu źródeł; kolejność elementów i tabele wymagają własnych testów | Apache-2.0 |
| [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) + [Tesseract](https://github.com/tesseract-ocr/tesseract) | Dodanie tekstu OCR, prostowanie i obracanie skanów | Osobny proces roboczy; język `pol` oraz `eng` dla dokumentów mieszanych. Zachować oryginał | MPL-2.0 / Apache-2.0; zależności osobno |
| [pg-boss](https://github.com/timgit/pg-boss) | Kolejka oparta na Postgresie, retry, zadania w tle | Pasuje do istniejącego planu Next.js + Postgres; własna idempotencja operacji nadal potrzebna | MIT |
| [Docxtemplater](https://github.com/open-xml-templating/docxtemplater) | Wypełnianie wzorów Word danymi | Preferowany, gdy kancelaria daje wzór DOCX. Najpierw prosty zakres rdzenia | Rdzeń: MIT lub GPLv3; moduły osobno |
| [docx](https://github.com/dolanmiu/docx) | Tworzenie DOCX z kodu JS/TS | Alternatywa dla własnej karty sprawy; wybór zależy od pochodzenia wzorów | MIT |
| [Promptfoo](https://github.com/promptfoo/promptfoo) | Porównanie modeli i promptów, asercje, testy w CI | Włączyć wcześnie; poprawność kwoty i cytatu sprawdzać kodem | MIT |
| [Presidio](https://github.com/data-privacy-stack/presidio) | Detekcja i maskowanie danych z własnymi recognizerami | Rozważyć, jeżeli własne reguły PL okażą się niewystarczające. Mierzyć również pominięcia i nadmierne maskowanie | MIT |
| [Docling](https://github.com/docling-project/docling) | Struktura tabel, układ stron, wiele formatów | Porównać na trudnych dokumentach po pomiarze prostszego parsera; dobrać pipeline zgodny z założeniem API LLM | MIT; modele mogą mieć inne licencje |
| [pgvector](https://github.com/pgvector/pgvector) | Wyszukiwanie podobnych fragmentów w Postgresie | Dopiero gdy wyszukiwanie po identyfikatorze, artykule i tekście nie daje wystarczającej jakości | Licencja PostgreSQL |
| [Docassemble](https://github.com/jhpyle/docassemble) + [AssemblyLine](https://github.com/SuffolkLITLab/docassemble-AssemblyLine) | Wywiad sterowany zależnościami i składanie pakietów dokumentów | Przejąć wzorce projektowe; pełne wdrożenie oznaczałoby dodatkowy stos Python/YAML | MIT / MIT |

Konkretne obserwacje z dokumentacji: PDF.js udostępnia `getTextContent()` na poziomie strony; potrzebna będzie własna warstwa mapowania cytatów do podglądu. [API PDF.js](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html)

README pg-boss wskazuje Node **22.12+** i PostgreSQL **13+**. Tych wymagań nie należy kopiować ze starszych tutoriali. Opisywany mechanizm kolejki nie zastępuje ochrony przed ponownym wykonaniem skutków zewnętrznych. [README pg-boss](https://github.com/timgit/pg-boss)

Docxtemplater ma rdzeń na licencji MIT lub GPLv3, ale rozszerzenia mają odrębne warunki i część jest płatna. Funkcji HTML, obrazów czy zaawansowanych tabel nie traktujemy automatycznie jako części bezpłatnego rdzenia. [Licencja rdzenia](https://github.com/open-xml-templating/docxtemplater/blob/master/LICENSE.md), [moduły i ich warunki](https://docxtemplater.com/modules/)

Promptfoo może oceniać JSON własnymi asercjami JavaScript. Wywołanie zewnętrznego modelu podczas lokalnego testu nadal wysyła do jego API treść wejściową; lokalny runner nie oznacza lokalnego LLM. [Dokumentacja asercji](https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/)

## 5. Projekty szczególnie bliskie problemowi

### MecenasAi — przydatna inspiracja, wymaga selekcji

[alsk1992/MecenasAi](https://github.com/alsk1992/MecenasAi) deklaruje obsługę polskich spraw, import prawa, dokumenty i maskowanie. Licencja repozytorium: MIT. Przejrzano README oraz importer i dwa pliki modułu prywatności; nie sprawdzono działania całej aplikacji.

Warto obejrzeć [importer ELI](https://github.com/alsk1992/MecenasAi/blob/main/src/legal/ingest-cli.ts) i [mapowanie identyfikatorów](https://github.com/alsk1992/MecenasAi/blob/main/src/privacy/anonymizer.ts). Importer ma na stałe wskazane akty z lat 2023–2024 i przykładowe treści na wypadek awarii. U nas potrzebne są wersje oraz jawny status nieudanego pobrania. Nie można utożsamiać udanego importu ze sprawdzeniem aktualnego stanu prawnego.

[Detektor](https://github.com/alsk1992/MecenasAi/blob/main/src/privacy/detector.ts) pokazuje reguły dla polskich identyfikatorów. Do naszych testów trzeba dodać PESEL z błędem OCR, identyfikatory ze spacjami i nazwiska w odmianie. Poprawność sumy kontrolnej nie może być jedynym warunkiem maskowania tekstu opisanego jako PESEL. Mapa podstawień powinna być izolowana według sprawy i żądania; przywracamy tylko rozpoznane tokeny w dopuszczonych polach.

### Wywiady o zadłużeniu z Docassemble

[PineTreeLegalAssistance/docassemble-DebtValidationLetter](https://github.com/PineTreeLegalAssistance/docassemble-DebtValidationLetter) to projekt formularza pisma o weryfikację lub zakwestionowanie długu w Maine, z licencją MIT. Warto przejrzeć zależności pytań i przejście do dokumentu. Reguły amerykańskie nie stanowią treści dla polskiego bota.

[SuffolkLITLab/docassemble-ConsumerDebt](https://github.com/SuffolkLITLab/docassemble-ConsumerDebt) jest dodatkowym tropem dla przepływu spraw zadłużeniowych. README jest bardzo oszczędne, a plik LICENSE zawiera tylko oznaczenie MIT. Traktować jako inspirację do przeglądu, przed kopiowaniem ustalić dokładny zakres licencji i zawartość materiałów.

### KRS w TypeScript

[pkolawa/krs-poland-mcp-server](https://github.com/pkolawa/krs-poland-mcp-server), MIT: obsługuje aktualny i pełny odpis. Przejrzany [adapter HTTP](https://github.com/pkolawa/krs-poland-mcp-server/blob/main/src/utils/api.ts) pokazuje timeout i alternatywne URL-e. U nas wystarczy zwykły adapter backendu; MCP nie jest konieczne. Dodać walidację numeru KRS, rozróżnienie błędu od braku danych, bufor odpowiedzi i selektywne retry. Nie powtarzać każdego błędu 4xx w taki sam sposób.

### REGON: uważać na wersję

[rolzwy7/RegonAPI](https://github.com/rolzwy7/RegonAPI), MIT, jest klientem Python i dokumentuje BIR v1/v1.1 oraz tryb testowy. Oficjalna strona GUS udostępnia obecnie paczkę dokumentacji BIR **1.2**. Nie zakładamy zgodności klienta z najnowszą usługą bez próby integracyjnej. W naszym stosie może to być osobna usługa albo wskazówka do własnego adaptera. [GUS API REGON](https://api.stat.gov.pl/Home/RegonApi)

### Polski chatbot z RAG: niższy priorytet

[byessilyurt/polish-legal-assistant](https://github.com/byessilyurt/polish-legal-assistant) dotyczy informacji dla cudzoziemców i korzysta z innego zestawu usług. README deklaruje MIT, ale w przejrzanym katalogu głównym nie ma pliku LICENSE, a metadane nie wskazują rozpoznanej licencji. Zanim kopiować kod, trzeba wyjaśnić zakres praw. Podane w opisie wyniki jakości są deklaracją autora, nie naszym pomiarem. Nie rozwiązuje bezpośrednio kontroli listy zobowiązań.

W przejrzanej próbce nie znalazłem gotowego, zweryfikowanego bota odpowiadającego całemu naszemu procesowi. Da się natomiast wykorzystać dojrzałe biblioteki i wzorce z powyższych projektów. To wynik ograniczonego researchu, nie twierdzenie o całym GitHubie.

## 6. Skąd wziąć dane do testów

| Potrzeba | Źródło | Jak użyć / co potwierdzono |
|---|---|---|
| Rozmowy, zadłużenie, korekty | Własne fikcyjne sprawy z jawnym oczekiwanym wynikiem | Najlepiej dopasowane do problemu; początek w `tests/fixtures/cases.json` |
| Wezwania, cesje, zestawienia | Własne pisma na bazie fikcyjnej karty sprawy | Przygotować kilka różnych układów dokumentów, potem PDF z tekstem i skany |
| Wyszukiwanie VAT i błędy adaptera | [Środowisko testowe MF](https://www.gov.pl/web/kas/api-wykazu-podatnikow-vat) | Oficjalny adres `https://wl-test.mf.gov.pl`; jeden odczyt testowy zwrócił HTTP 200 i podmiot |
| Identyfikatory do testów MF | [Oficjalny plik danych testowych](https://www.gov.pl/attachment/5e7f6a61-d6de-4841-891b-ef8122353445) | NIP/REGON/rachunki; plik publikowany jako zestaw z 2019 r., więc poszczególne przypadki sprawdzić na bieżąco |
| Odpisy spółek | [Otwarte API KRS](https://prs.ms.gov.pl/krs/openApi) | Odczyt jednego publicznego podmiotu: HTTP 200; do regresji zapisać kontrolowaną migawkę, a nie polegać na zmiennym odpisie |
| REGON/BIR | [Dokumentacja GUS](https://api.stat.gov.pl/Home/RegonApi) | Oficjalna strona i archiwum dokumentacji dostępne; nie wykonano logowania SOAP ani testu usługi BIR |
| Jednoosobowe działalności | [Dokumentacja API CEIDG v3](https://pliki.biznes.gov.pl/akademia/Hurtownia_danych/HD%20CEIDG%20-%20API%20v3%20HD%20-%20Dokumentacja%20dla%20integrator%C3%B3w%20v1.0.pdf) | Indeksowana dokumentacja wskazuje `https://test-dane.biznes.gov.pl/api/ceidg/v3/firmy`; pobranie PDF przez narzędzie zwróciło 403. Dostęp z tokenem nie był testowany |
| Przepisy i wersje | [ELI / Sejm](https://api.sejm.gov.pl/eli_pl.html) | Oficjalne metadane, teksty i relacje aktów; potwierdzono HTTP 200 dla metadanych tekstu Prawa upadłościowego |
| Struktura dokumentów procesowych | [Materiały MS dla konsumentów](https://www.gov.pl/web/sprawiedliwosc/formularze-konsumenci-od-24-marca-2020) | Materiał pomocniczy; aktualny zakres pytań i dokumentów wymaga przeglądu prawnika |
| Monitoring KRZ | [FAQ MS](https://www.gov.pl/web/sprawiedliwosc/8-czy-planuja-panstwo-realizacje-api-w-systemie-krz) | FAQ nadal opisuje rozwój API do pobierania danych. Nie potwierdzono publicznej dokumentacji odczytu dla naszego zastosowania |

**Publiczne rejestry nie dają pełnej listy prywatnych zobowiązań klienta.** Mają służyć testom adapterów i potwierdzaniu wskazanych danych podmiotu. Rozmowy i pisma do kontroli zadłużenia przygotowujemy osobno.

KRZ ma również wyspecjalizowane integracje: opis wydania 1.13.001 wymienia API dla organów administracji publicznej do zamieszczania informacji egzekucyjnych i alimentacyjnych. Nie należy więc mówić ogólnie, że „KRZ nie ma żadnego API”. Nie jest to potwierdzenie dostępu kancelarii do ogólnego odczytu rejestru. [Opis wydania KRZ](https://krz-info-prod.apps.ocp.prod.ms.gov.pl/krz-help/KRZ_Opis_zmian_wydanie_1.13.001.pdf)

### Gotowe zbiory prawne mają inne zadanie

[LQAD-PL](https://github.com/brodzik/lqad-pl) zawiera według README 2916 par pytanie–odpowiedź z testów dla aplikantów, w formacie zbliżonym do SQuAD. Przydatny trop do badania polskiego QA, ale nie do pomiaru ekstrakcji wierzycieli z pism. Przejrzany fork ma dane z 2021 r. i nie ma jawnego pliku licencji w katalogu głównym. Nie włączono danych do naszego zestawu. Aktualność odpowiedzi i prawa do wykorzystania trzeba ustalić osobno.

Nie znalazłem w przejrzanych źródłach gotowego, jednoznacznie licencjonowanego zestawu polskich rozmów upadłościowych z oczekiwanymi faktami i powiązaniami długów. Własny zestaw syntetyczny jest najkrótszą drogą do testowania naszego procesu. Zanonimizowane sprawy kancelarii mogą później posłużyć do osobnego pilotażu na uzgodnionych zasadach.

## 7. Plan testów, który daje użyteczny wynik

Dodano **20 syntetycznych scenariuszy** z danymi wejściowymi i oczekiwaniami w [tests/fixtures/cases.json](tests/fixtures/cases.json). Są autorskim punktem startowym przygotowanym w tej sesji, bez oceny przez prawnika. To teksty i opisy zdarzeń; nie zawierają rzeczywistych PDF-ów, skanów ani odpowiedzi API. Nie stanowią jeszcze uruchomionego benchmarku.

Plan rozbudowy:

1. Przejrzeć oczekiwania z człowiekiem, a reguły merytoryczne z prawnikiem. Uzupełnić fakty, które mają być mierzone, i kryteria niepewności.
2. Z 20 scenariuszy przygotować kilka rodzin pism o różnych układach: zwykły tekst, tabela, wielostronicowe zestawienie, nieczytelny fragment, duplikat, cesja.
3. Dopiero potem wytworzyć PDF-y i warianty skanów. Ocena OCR potrzebuje obrazu wejściowego i niezależnego tekstu wzorcowego; uszkodzony tekst sam w sobie tego nie zapewnia.
4. Rozszerzyć do około 100 spraw. Podzielić według całych rodzin spraw i wzorów, np. 60 do rozwoju, 20 walidacyjnych i 20 odłożonych. To propozycja organizacji, nie uzasadnienie statystyczne ani zestaw do treningu LLM.
5. Uruchamiać te same przypadki na wersjach promptu i 2–3 dostępnych modelach API, z zapisem konfiguracji, czasu i zużycia. Trudne przypadki powtarzać, bo generowanie może być niedeterministyczne.
6. Rejestry testować oddzielnie: pozytywny wynik, brak danych, timeout, 429, błędny format, zmiana schematu i odpowiedź z dawną datą. Najpierw lokalne kontrolowane odpowiedzi, potem niewielki test rzeczywistego adaptera.

| Miara | Jak mierzyć |
|---|---|
| Poprawność pól | Kwota w groszach, waluta, data, numer umowy i rola strony względem wzorca |
| Wymyślone informacje | Liczba faktów niewynikających z dopuszczonych źródeł; obecność cytatu oceniana osobno od znaczenia |
| Rozbieżności | Precision/recall dla oznaczonych sytuacji; wyraźnie odróżnić inne daty i inne składniki kwoty |
| Powiązania zobowiązań | Poprawne propozycje i błędne propozycje połączenia; scalenie pozostaje decyzją człowieka |
| Kontrola procesu | Nieuprawniony dostęp, utrata rozmowy, nadpisanie potwierdzonego faktu, ponowne skutki retry, użycie dawnego zatwierdzenia |
| Czas i koszt | Opóźnienie oraz zużycie na sprawę; koszt według faktycznego rozliczenia wybranego API |
| Użyteczność | Czas przeglądu i liczba korekt na tych samych sprawach z pomocą aplikacji i bez niej |

Proponowana bramka przed pokazaniem wyniku: wszystkie krytyczne scenariusze procesu przechodzą; każdy prezentowany fakt ma poprawne odwołanie do źródła albo jawny brak; nie ma automatycznego scalenia długów ani ukrytej zamiany wartości nieznanych na zero. Wartości docelowe jakości ekstrakcji należy ustalić po pierwszym pomiarze. Nie ogłaszamy procentu skuteczności na podstawie samego schematu JSON ani kilkunastu przykładów.

## 8. Co wdrażać u nas w kolejności

1. **Model danych i ręczny panel kontroli.** Sprawa, źródło, propozycja faktu, roszczenie, obserwacja kwoty, rozbieżność i decyzja. Konta, role, izolacja spraw i wersje są częścią tego etapu.
2. **Wywiad przez API oraz PDF z tekstem.** Ten sam kontrakt faktów dla obu źródeł. Wersjonowane pytania, wznowienie rozmowy, możliwość poprawienia danych.
3. **Kontrola długu i panel dowodów.** Powiązania umów, rozbieżności dat/składników, kliknięcie cytatu, zadania wyjaśniające. To najlepszy moduł do zaoferowania w ramach pilotażu.
4. **Dokumenty i workflow.** Wzory DOCX, lista braków, potwierdzanie wersji, etapy i zadania. Po zmianie danych nowa wersja wymaga przeglądu.
5. **OCR, rejestry i zatwierdzona wiedza.** OCR jest potrzebny do pełnego zakresu skanów; MF/KRS mają już konkretne punkty startowe. Rozwijać BIR/CEIDG po sprawdzeniu dostępu. Wyszukiwanie prawne wersjonować niezależnie od danych sprawy.
6. **Wdrożenie i pomiary całego procesu.** Kontenery, prywatne pliki, limity, kontrola kosztów, kopia i próba odtworzenia. Testować zbiorem spraw, a nie tylko pojedynczym czatem.

Nie ma obecnie podstaw do wyboru konkretnego modelu, deklarowania lepszej jakości od Legal Flow ani obiecywania określonych oszczędności. Mamy za to wystarczająco konkretny cel, zestaw klocków i pierwsze scenariusze, aby zacząć implementację.

## 9. Zapis weryfikacji

- GitHub: [research/github-snapshot.json](research/github-snapshot.json) — metadane 20 repozytoriów. `pushed_at` oznacza aktywność repozytorium, nie audyt ani gwarancję utrzymania.
- KRS: `GET https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/0001068572?rejestr=P&format=json` → HTTP 200, obiekt `odpis`.
- ELI: `GET https://api.sejm.gov.pl/eli/acts/DU/2026/913` → HTTP 200, metadane obwieszczenia o tekście jednolitym Prawa upadłościowego. Nie przeprowadzono pełnej analizy późniejszych zmian.
- MF sandbox: `GET https://wl-test.mf.gov.pl/api/search/nip/3245174504?date=2026-10-02` → HTTP 200, `result.subject` obecny. NIP pochodzi z pliku testowego MF, a nie ze sprawy klienta.
- GUS: oficjalna strona → HTTP 200; link do paczki `GUS-Regon-UslugaBIRver1.2-dokumentacjaVer1.4.zip`. Nie testowano SOAP.
- CEIDG: źródło indeksowane wskazuje testowy URL; pobranie dokumentacji PDF przez narzędzie → 403; nie potwierdzono integracji z tokenem.
- Nie wykonywano wywołań generatywnego modelu, instalacji bibliotek, wdrożenia ani testów bota. Sprawdzono tylko przygotowane dane testowe i opisane odczyty publiczne.
