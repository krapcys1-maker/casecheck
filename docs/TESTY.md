# Testy i dowody działania

## Bieżąca weryfikacja lokalna: 3 października 2026

**Aktualnie 119/119 testów**. Pięć najnowszych regresji dotyczy ręcznego wycofania wartości, zależności roszczenia, częściowej odpowiedzi AI, pustej edycji i starego pustego zatwierdzenia. Cztery najpierw odtworzyły błąd na wcześniejszym kodzie. [Ręczna kontrola korekt i eksportów](RECZNE-TESTY-KOREKT.md) oraz [raport](correction-review-2026-10-03.json) obejmują rzeczywisty interfejs, restart i odtworzenie 6/6 scenariuszy HTTP, bez nowego API.

Poprzedni etap: 114/114. Osiem nowych sprawdzeń dotyczy portalu/wzorów (6), kwarantanny typu pola (1) i związku adresu z wierzycielem (1). [Ręczny przegląd najnowszego etapu](RECZNY-PRZEGLAD-PORTALU.md) opisuje rzeczywiste odczyty, błędy, korekty i cały obieg portalu. Trzy dodatkowe operacje API podniosły licznik kopii z 17 do 20; żadnego wywołania nie wykonuje `npm test`.

Poprzedni etap obejmował osiem sprawdzeń [stron OCR](PRZEGLAD-OCR.md). Ręcznie sprawdzono ekran na kopiach S11/S12, odrzucenie, korektę, historię oraz blokadę dawnych pól. Ponowienie sześciu scenariuszy HTTP bez nowego API: **6/6**, budżet w tamtej próbie 17/20 bez zmiany. [Raport etapu OCR](ocr-review-2026-10-03.json). Wykonano również [porównanie wszystkich 200 krótkich tekstów z siedmioma wartościami odczytu](RECZNY-PRZEGLAD-200.md); bez niezależnej oceny prawnika. Sekcje poniżej zachowują wyniki wcześniejszych etapów.

Etap przed dodaniem przeglądu stron: `npm test` **98/98**, Node 24.13.0. Na początku tej kontynuacji przechodziło 85 testów; dodano 11 testów trwałego zapisu i odzyskiwania wyników oraz dwa testy braku danych o zabezpieczeniu. Nowe sprawdzenia obejmują awarię końcowej transakcji, nagłe zakończenie osobnego procesu po zapisie wyniku, restart, brak drugiego API, ochronę ręcznej korekty i aktualnych zatwierdzeń, jedno roszczenie po odzyskaniu, OCR bez podwójnych stron, błędny wynik, kopię/odtworzenie oraz izolację kancelarii i linku klienta. Zobacz [testy](../tests/job-recovery.test.mjs) i [mechanizm](ODZYSKIWANIE-WYNIKOW.md).

Istniejący zestaw obejmuje też odczyt hybrydowy, walidację częściowych odpowiedzi i odtworzenie 200 dokumentów z wcześniej zapisanych odpowiedzi bez API. [Raport](extended-evaluation-2026-10-03.json): 1397/1400 pól zgodnych z anotacjami, 3 pozostawione do przeglądu, 0 błędnych znanych wartości. To kontrola reguł na fikcyjnych tekstach UTF-8, na których rozwijano rozwiązanie; nie badanie niezależnej skuteczności, OCR ani wywiadu. `npm run ai:bench:extended` pokazuje plan bez API. Najnowszych zmian nie zweryfikowano jeszcze w CI/VPS.

Sprawdzenie odzyskiwania w przeglądarce na odrębnej, tymczasowej fikcyjnej sprawie: podsumowanie wskazało oczekujący wynik, przycisk w Historii odzyskał dane, status zmienił się na „Wykonano”, a licznik pozostał 1/20. [Zrzut po odzyskaniu](images/odzyskany-wynik-test.jpg). Późniejszy ręczny przegląd treści 200 materiałów opisano powyżej; pełnego obiegu każdego z nich nie wykonano.

## Odbiór z rzeczywistymi API: 3 października 2026

[Raport JSON](acceptance-2026-10-03.json): **6/6 scenariuszy końcowo przechodzi**, 10 dokumentów źródłowych i 17 nowych wywołań: 9 DeepSeek, 2 Anthropic, 6 OpenAI. To żądania do lokalnego serwera HTTP i rzeczywistych dostawców, z osobnymi kontami oraz stanem. Źródłem są pliki przesłane przez upload i odczytane parserem lub OCR; model nie dostaje oczekiwanych odpowiedzi. Konta prawnika i pracownika służą do testowania ról, bez niezależnej oceny merytorycznej.

| Przypadek | Zweryfikowane działanie |
|---|---|
| S01: konsument | Rozmowa i finanse, trzy PDF-y, różnica 10 000 PLN, korekta z historią, cztery wzory, role, zadanie i zamknięcie |
| S02: cesja | Dwa dokumenty, ręczne powiązanie i jedno aktywne saldo 53 200 PLN |
| S04: spór | Odczyt Anthropic, naprawa błędnej interpretacji zabezpieczenia i odzyskanie opłaconej odpowiedzi po błędzie SQLite bez kolejnego API |
| S11: skan | Rzeczywisty OCR OpenAI, odczyt transkrypcji, kontrola kwoty i cytatów |
| S12: nieczytelna kwota | OCR i pozostawienie nieczytelnej kwoty jako `unknown` |
| S18: firma | Finanse przez OpenAI, dwa dokumenty, dalsza wiadomość klienta i cztery sekcje planu z cytatami; tekst trafia do PDF |

Pierwszy przebieg: 15 wywołań, 5/6 scenariuszy. Anthropic skrócił „Informacja o zabezpieczeniu: brak danych.” do wartości „brak”, błędnie sugerując brak zabezpieczenia. Po dodaniu filtra `NO_SECURITY_INFORMATION` i dwóch regresji świadomie powtórzono S04: jedno wywołanie, właściwe `unknown` i zachowany cytat. Dodatkowe wywołanie rozszerzyło kontrolę firmowego planu. Łącznie **17/20** rezerwacji w odrębnym stanie testu; nie podnoszono limitu.

Pięć wygenerowanych PDF-ów sprawdzono tekstowo i wizualnie: sześć stron wyrenderowanych Popplerem, poprawne polskie znaki, numeracja oraz brak obcięć i nakładania tekstu. Pakiet JSON po przeglądzie działa we wszystkich sześciu sprawach. Sprawdzono blokady uprawnień, brak danych wewnętrznych w widoku klienta i odrzucenie unieważnionego linku. Kopię odtworzono w osobnej aplikacji i porównano logowanie, liczbę spraw, wersje, hashe wszystkich załączników i trwały licznik API.

Uruchamianie:

- `npm run test:acceptance` — plan bez połączeń i kosztu.
- `node scripts/acceptance.mjs --run` — nowy stan, do 16 wywołań, klucze z `.env`, bez otwierania przeglądarki.
- `node scripts/acceptance.mjs --resume` — kontynuacja; zapisane odczyty są używane ponownie, brakujące kroki mogą wywołać API.
- `node scripts/acceptance.mjs --resume --no-api` — kontynuacja z zablokowanym nowym API. Przegląd stron OCR korzysta wyłącznie z dokładnie zgodnych hashami zapisów rzeczywistego porównania agenta w `docs/ocr-reviewed-pages-2026-10-03.json`. Nowy/zmieniony wynik wymaga nowego porównania; runner go nie zatwierdza automatycznie.
- `node scripts/acceptance.mjs --resume --retry-case S04` — jawne powtórzenie odczytu dokumentów wybranej sprawy, płatne.

Prywatny stan i losowe hasła: `data/local/acceptance`; pełne raporty, PDF-y i kopie: `reports/local/acceptance`. Oba katalogi są ignorowane przez Git. Udostępniany raport zawiera metadane, hashe, zakres prób i znaleziony błąd, bez poświadczeń. Te sześć spraw nie potwierdza trafności na wszystkich aktach kancelarii.

## Wcześniejsza aktualizacja po audycie: 3 października 2026

Na tym etapie `npm test` obejmował **70 testów**. Dodano 22 sprawdzenia od poprzednich 48: kontakt z człowiekiem, odrzucone dane, porównywanie sald, walidacja dat, równoległa praca, awarie transakcji, limity źródeł, aktualność bazy wiedzy, eksport po przeglądzie, kotwiczenie cytatów i zachowawcze filtry semantyczne. [Audyt](AUDYT.md) opisuje odtworzone problemy i naprawy; wcześniejsza sekcja poniżej zachowuje wynik poprzedniego etapu.

[Nowa próba jakości AI](quality-bench-2026-10-03.json): 7 rzeczywistych wywołań na tekstach odczytanych z PDF-ów, 49 zaplanowanych pól. Przed końcowymi poprawkami cytowania i filtrów: 3 odpowiedzi zablokowane, 4 przyjęte, 25/28 dokładnych zgodności w przyjętych odpowiedziach. Dwa odstępstwa są formatowaniem nazw, jedno błędem znaczenia. To mała diagnostyczna próba, nie potwierdzenie trafności całego modelu. Nieczytelne skany i wywiad konwersacyjny nie należą do tej próby. Późniejsze zabezpieczenia zweryfikowano bez API; ich efektu na całej próbie jeszcze nie zmierzono.

Plan: `npm run ai:bench`. Płatne uruchomienie: `node scripts/quality-bench.mjs --run`, maksymalnie 9 prób/dzień UTC w `data/local/quality-bench`. Oczekiwania pozostają poza wejściem modelu, raport zapisuje wersję promptu, hashe PDF/wejścia, tokeny i czas. Nie ma automatycznych ponowień. Limit runnera i limit aplikacji VPS są odrębne.

## Poprzedni etap: pokaz portfolio i 48 testów

Weryfikacja po audycie: [CI 37096789137](https://github.com/krapcys1-maker/casecheck/actions/runs/37096789137) — Node 22 i 24; VPS Node 22.22.1 — 70/70. [Metadane](audit-verification-2026-10-03.json) zawierają także kontrolę publicznego pakietu S01, oryginału i PDF. Odtworzenie tylko czterech przyjętych odpowiedzi z bazy potwierdziło naprawę znalezionego błędu stanowiska klienta; nie wykonano nowej próby API i nie włączono trzech zablokowanych odpowiedzi.

Stan weryfikacji: 3 października 2026 czasu Europe/Bucharest. Trzy nowe wywołania API zakończyły się 2 października według czasu UTC. Testy syntetyczne i kontrola techniczna nie zastępują oceny rzeczywistych spraw przez niezależny zespół.

## Automatyczne testy bez płatnego API

`npm ci` i `npm test` uruchamiają 48 testów. W części testów aplikacji adapter AI jest zastąpiony deterministyczną odpowiedzią. Testujemy walidację, obieg danych i błędy; te wyniki nie są pomiarem trafności modeli LLM. Testy korzystają z odrębnych tymczasowych baz, a pięć nowych scenariuszy przechodzi przez rzeczywisty serwer HTTP.

| Scenariusz | Sprawdzony rezultat |
|---|---|
| Rozbieżność S01 | 120 000 zł deklaracji, 110 000 zł dokumentów, różnica 10 000 zł |
| Cesja S02 | Dwie pozycje wyłączone z sumy przed przeglądem; po powiązaniu oba źródła i jedno saldo 53 200 zł |
| Spór S04 | 19 000 zł odczytanej kwoty oraz osobne oznaczenie sporu |
| Waluty i daty S06 | Trzy grupy sald pozostają osobne; brak automatycznego przeliczania |
| Brak informacji o zabezpieczeniu | Wartość pozostaje `unknown`, nie staje się odpowiedzią „nie” |

Każdy z tych pięciu testów obejmuje konto prawnika, zapis sprawy i pliku, odczyt przez kontrolowany adapter, przegląd, projekt, zatwierdzenie i pobranie PDF. Dodanie zadania zachowuje zatwierdzenie. Nowa wiadomość unieważnia pismo. Historia pozostaje dostępna.

Pozostałe testy obejmują cytaty i typy, daty i grosze, błędy/odmowy API, brak automatycznych powtórzeń, licznik dzienny, spóźniony wynik po korekcie, role, kancelarie, zakres i wygaśnięcie linku klienta, ograniczenia plików, OCR, PDF oraz backup/odtworzenie. Nowe testy katalogu zespołu sprawdzają także brak cudzych kont, kont wyłączonych, e-maili i hashy haseł w odpowiedzi oraz brak dostępu klienta.

[GitHub Actions](https://github.com/krapcys1-maker/casecheck/actions/workflows/tests.yml) uruchamia tę samą komendę na Node 22 i 24. Wynik konkretnego uruchomienia jest widoczny w dzienniku CI; badge w README wskazuje ostatni stan.

Potwierdzony [run 37066310540](https://github.com/krapcys1-maker/casecheck/actions/runs/37066310540) zakończył się sukcesem na obu wersjach Node. VPS: 48/48 testów, Node 22.22.1; lokalnie: 48/48, Node 24.13.0. [Raport JSON](test-results-2026-10-03.json) zachowuje wybrane metadane prób, bez danych dostępu. Dalsze poprawki tekstu i materiały portfolio nie zmieniają wyników wcześniejszej próby API.

## Nowe testy z rzeczywistym OpenAI

Wykonano trzy wywołania modelu `gpt-4.1-mini-2025-04-14` na już zaimportowanych fikcyjnych dokumentach, bez przekazania modelowi oczekiwanych odpowiedzi. Sprawdzono kwotę całkowitą, walutę, datę salda, numer umowy, występowanie cytatów w źródłach i nieznane zabezpieczenie. W S04 sprawdzono również odczyt sporu.

| Dokument | Wynik odczytu | Wynik kontroli aplikacji |
|---|---|---|
| S02-D01 | 50 000 PLN, 2026-08-31, ALFA/2022/008 | Para z drugim dokumentem; kwota poza sumą do powiązania |
| S02-D02 | 53 200 PLN, 2026-09-30, ALFA/2022/008 | Ta sama umowa; zachowana informacja o cesji |
| S04-D01 | 19 000 PLN, 2026-09-30, EPS/2020/050, spór | Kwota po testowym przeglądzie i osobny sygnał sporu |

Wszystkie trzy odczyty zakończyły się statusem `completed` i przeszły wymienione asercje. Wykorzystano pozostałe trzy rezerwacje: 17 → 20 z limitu 20 na dobę UTC. Nie zwiększano limitu i nie ponawiano wywołań automatycznie. Wcześniejsze próby API/OCR dokumentują [wyniki pierwszego procesu](../WYNIKI-PELNEGO-PROCESU.md) oraz [testy trzech dostawców](../WYNIKI-TESTU-API.md).

Dodatkowy przegląd ujawnił jeden błąd interpretacji: w S04 model wpisał obecnego wierzyciela również jako poprzedniego, chociaż dokument nie wskazuje cesji ani poprzedniego wierzyciela. Ręczna korekta testowa zmieniła to pole na `unknown`, zachowując wcześniejszą wartość i uzasadnienie. Utworzono aktualny projekt karty. Korekta nie wywołała API. Ten przykład pokazuje, dlaczego poprawny cytat i status `completed` nie wystarczają do potwierdzenia całej interpretacji.

S02 pozostawiono z widoczną parą do ręcznego powiązania, aby pokazać decyzję przeglądającego. S04 zachowuje spór. Trzy pola wywiadu w każdej z tych dwóch spraw przeniesiono ręcznie z fikcyjnych wiadomości, ze źródłem i etykietą „SYMULACJA AI”; nie są przedstawione jako odczyt modelu. Projekty kart S02/S04 są projektami roboczymi, bez niezależnego zatwierdzenia.

To mała próba demonstracyjna wybranych pól na danych syntetycznych. Nie oznacza 100% trafności systemu na aktach kancelarii. Oczekiwania przygotował autor projektu z pomocą AI; nie ma niezależnej anotacji prawniczej. Miarodajny pilotaż powinien korzystać z nowego zestawu i osobnej oceny merytorycznej.

## Kontrola przeglądarki i wdrożenia

Sprawdzamy kartotekę, podsumowanie S01, filtr otwartych zadań, zapis zadania z nazwanym wykonawcą i rozdzielenie historii pism. Układ mobilny kontrolowany jest przy 390 × 844 oraz na standardowym widoku desktopowym; nie powinien mieć poziomego przepełnienia strony. Kontrola UI jest wykonana ręcznie przez agenta, poza automatycznym CI.

Przed wdrożeniem wykonujemy spójną kopię stanu i kontrolę hashy 46 załączników. Po wdrożeniu sprawdzamy HTTPS, health, logowanie, panel, plik/PDF i odrzucenie dostępu bez autoryzacji. Oryginalna strona główna i formularz kontaktowy pod tym samym hostem są kontrolowane osobno.

## Co mierzyć dalej

Przygotowanie i przegląd porównywalnych rzeczywistych spraw, błędne kwoty/datowania/wierzyciele, fałszywe połączenia dokumentów, nieuprawnione ujawnienia, ręczne korekty, koszt API oraz zachowanie po przerwaniu. Podziel dane na rozwój i odrębny test; nie poprawiaj promptu na podstawie wyników zestawu końcowego. Oczekiwania i dopuszczalną tolerancję uzgodnij przed próbą.
