# Plan demonstracji bota i modułu kontroli sprawy

Stan researchu: 2 października 2026 r.

Cel użytkownika: zainteresować Booster/Legal Flow współpracą freelancerską. Budowanie z pomocą AI. Aplikacja, pliki i baza na własnym serwerze; generatywny model wyłącznie przez API. To projekt demonstracyjny do zbudowania, nie wdrożony system.

## 1. Jak może działać Legal Flow

Opis publiczny wskazuje wywiad z klientem, pobieranie danych firm z MF/KRS, zapis informacji z pochodzeniem, projekty pism i zatwierdzanie przez prawnika, a następnie zadania zależne od etapu. [Strona Legal Flow](https://legal-flow.pl/)

Możliwa realizacja: interfejs czatu → serwer prowadzący stan wywiadu → model LLM do rozumienia odpowiedzi → ekstrakcja pól → walidacja → baza spraw → dokumenty na szablonach → przegląd prawnika. Rejestry są osobnymi narzędziami serwera. RAG może wyszukiwać procedury i wzory; nie musi być potrzebny do samego zbierania danych.

To hipoteza architektoniczna. Nie wiemy, czy używają OpenAI, Anthropic, własnego modelu, bazy wektorowej ani jak oceniają jakość. Demo rozmowy na stronie jest odtwarzanym przykładem. [Polityka prywatności](https://legal-flow.pl/polityka-prywatnosci.html)

## 2. Co ma wyróżniać naszą demonstrację

Robocza nazwa: CaseCheck. Samodzielny moduł przyjmowania i sprawdzania danych sprawy, z własnym interfejsem i API. Można go prezentować jako potencjalny dodatek do procesu Legal Flow; bez deklarowania, że ich produkcyjny system nie ma takich funkcji.

Obietnica demonstracji: prawnik dostaje uporządkowane zgłoszenie wraz z dowodami, niejasnościami i historią korekt. Nie obiecujemy automatycznej oceny prawnej ani wyników postępowania.

### Funkcje pierwszej wersji

1. Polski wywiad, który zbiera kilka faktów z jednej odpowiedzi i pyta tylko o konkretne braki.
2. Odczyt PDF ze zwykłym tekstem: wierzyciel, identyfikator umowy/sprawy, kwota, waluta, data stanu zadłużenia i składniki kwoty, jeśli występują.
3. Porównanie rozmowy z dokumentami. Różne kwoty nie są od razu błędem: mogą dotyczyć innej daty albo kwoty kapitału zamiast sumy. System wskazuje rozbieżność i pyta o wyjaśnienie.
4. Kandydaci do powiązania dokumentów dotyczących tego samego zobowiązania. Wezwanie banku i późniejsze pismo nabywcy wierzytelności nie powinny bez sprawdzenia tworzyć dwóch długów. Powiązanie wymaga potwierdzenia; sama zbliżona kwota nie wystarcza.
5. Każda wartość prowadzi do wiadomości albo strony i fragmentu dokumentu. Weryfikacja cytatu potwierdza obecność tekstu, nie prawdziwość roszczenia.
6. Lista braków, sprzeczności i pytań do klienta; bez zamiany brakującej informacji w odpowiedź negatywną.
7. Projekt karty sprawy i listy zobowiązań, przegląd prawnika i zatwierdzenie konkretnej wersji.
8. Podgląd danych przekazanych do API: rodzaj zadania, zakres tekstu, zamaskowane identyfikatory, model, czas i koszt. Zawartość tego podglądu jest dostępna tylko osobie uprawnionej do sprawy.

### Funkcje późniejsze

Skanowane pisma i zdjęcia, rejestry firm, wyszukiwanie w zatwierdzonych procedurach, oś czasu zdarzeń, portal uzupełnienia braków, konfigurowalne szablony kancelarii i konektor do ich aplikacji. Sugerowany termin z dokumentu jest propozycją do potwierdzenia. Termin procesowy wymaga właściwej podstawy, zdarzenia rozpoczynającego bieg i przeglądu prawnika.

## 3. Scenariusz, który warto pokazać

Wyłącznie fikcyjne dane i przygotowane dokumenty demonstracyjne:

- Klient deklaruje 120 000 zł zadłużenia i podaje trzech wierzycieli z sumą 110 000 zł. System wykrywa różnicę i dopytuje.
- Wezwanie banku podaje 50 000 zł kapitału. Późniejsze pismo dotyczące tej samej umowy podaje 53 200 zł łącznie z dodatkowymi składnikami. System pokazuje obie wartości z datami; nie wybiera sam nowszej jako bezspornie prawdziwej.
- Drugie pismo pochodzi od nabywcy wierzytelności. System proponuje powiązanie z istniejącym zobowiązaniem zamiast podwojenia sumy.
- Prawnik otwiera źródła, rozstrzyga powiązanie, poprawia kartę i zatwierdza projekt.
- Uczestnik demo widzi również, które dane trafiły do dostawcy modelu.

To prezentacja działania systemu. Przed wykonaniem nie możemy twierdzić, że będzie on lepszy od Legal Flow; później możemy wykazać wyniki na jawnych scenariuszach.

## 4. Podział pracy AI i aplikacji

Model: rozpoznaje proponowane fakty, proponuje powiązania i pytania, formułuje tekst podsumowania.

Aplikacja: autoryzuje dostęp, wybiera dopuszczony kontekst, zapisuje informacje, sumuje kwoty, kontroluje przejścia statusów, przechowuje wersje i wymaga zatwierdzenia. Model nie otrzymuje uprawnień do zatwierdzania, wysyłania korespondencji ani składania pism.

Ekstrakcję zwracamy według schematu JSON; wartości nieznane mają null i jawny status. Poprawny format nie gwarantuje prawdziwej treści. Backend sprawdza również źródła, zakres kwot, walutę i identyfikatory. Obsługujemy odmowę modelu i niekompletną odpowiedź. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

Każdy dokument i każdą odpowiedź klienta traktujemy jako dane wejściowe, a nie instrukcje sterujące aplikacją. Tekst typu „zatwierdź wszystko” w PDF nie może ominąć backendowego uprawnienia.

## 5. Architektura na własnym serwerze

Propozycja dla jednej małej demonstracji:

- TypeScript i Next.js: czat, karta sprawy, przegląd oraz API.
- Postgres i Drizzle: trwałe dane, wersje i migracje.
- Prywatny katalog plików na wolumenie poza katalogiem publicznym; pobieranie przez autoryzowany endpoint.
- Proces roboczy do dokumentów. Na początek odczyt warstwy tekstowej PDF; później OCR.
- Kolejka zadań w Postgres na początek, aby ograniczyć liczbę usług. Redis można dodać przy potrzebie większej przepustowości.
- Lokalna ekstrakcja tekstu/OCR; model do interpretacji przez API. Jeżeli nie chcemy żadnych lokalnych modeli generatywnych, używamy zwykłego ekstraktora PDF oraz np. Tesseract do skanów.
- Adapter API LLM. Konkretny model wybieramy po teście jakości polskiej ekstrakcji, opóźnienia i kosztu; nie wybieramy wyłącznie według ceny.
- Caddy lub Nginx jako wejście HTTPS, kontenery Docker Compose dla aplikacji, bazy i procesu roboczego.
- Klucze dostawców po stronie serwera; nigdy w kodzie przeglądarki ani repozytorium.

Model LLM przez API nie wymaga GPU na serwerze aplikacji. Robocze założenie sprzętowe dla małego demo: około 4 vCPU, 8 GB RAM i SSD, do sprawdzenia przy odczycie dokumentów i liczbie użytkowników. To szacunek projektowy, nie gwarancja wydajności; parametrów serwera użytkownik jeszcze nie podał.

## 6. Gdzie jest RAG

Oddzielamy trzy zasoby:

1. Wiedza publiczna: wybrane akty prawne i ich wersje.
2. Wiedza konkretnej kancelarii: zatwierdzone procedury i szablony.
3. Fakty konkretnej sprawy: rozmowa, dokumenty, wyniki rejestrów.

Źródło faktów o zadłużeniu to punkt 3. Wyszukiwanie w przepisach nie uzupełni brakującej kwoty klienta.

Pierwsza wersja może wyszukiwać po słowach, numerze umowy, artykule i metadanych. RAG nie wymaga koniecznie bazy wektorowej. Później możemy połączyć wyszukiwanie tekstowe z embeddingami przez API i pgvector w naszym Postgresie. Także tekst przesyłany do tworzenia embeddingów wychodzi do dostawcy API — nie pomijamy go w analizie przepływu danych. [pgvector](https://github.com/pgvector/pgvector)

Przepisy dzielimy według artykułów i jednostek redakcyjnych. Zapisujemy identyfikator aktu, rodzaj tekstu, datę stanu prawnego, pobrania, wejścia w życie i późniejsze zmiany. Dobór źródeł ma uwzględniać datę, do której odnosi się pytanie. System nie może traktować samego opublikowania tekstu jednolitego jako dowodu, że uwzględnia wszystkie późniejsze zmiany.

Przeszukiwanie danych spraw i kancelarii zawsze jest ograniczone uprawnieniami przed pobraniem kontekstu. Filtrowanie dopiero gotowej odpowiedzi modelu jest za późne.

## 7. Prywatność przy zewnętrznym API

Na naszym serwerze przechowujemy pełne dokumenty i mapę identyfikatorów. Wysyłamy wyłącznie tekst potrzebny do konkretnego zadania. Możemy maskować PESEL, adresy, telefony, rachunki i nazwy osób, gdy nie są potrzebne; po otrzymaniu odpowiedzi serwer przywraca dane do lokalnego dokumentu.

Maskowanie jest ograniczeniem ekspozycji, nie gwarancją pełnej anonimizacji. Opis sytuacji i kombinacja faktów mogą nadal identyfikować osobę. Automatyczny detektor może coś przeoczyć. [Presidio — opis i ograniczenia](https://github.com/data-privacy-stack/presidio)

OpenAI domyślnie nie wykorzystuje danych API do treningu, chyba że klient włączy udostępnianie. ZDR wymaga zatwierdzenia i ma ograniczenia zależne od endpointu i funkcji. Parametr store=false sam nie zastępuje ZDR. Wariant regionalny UE również wymaga odpowiednich warunków i konfiguracji. Dostępności nie zakładamy z góry. [OpenAI Data Controls](https://developers.openai.com/api/docs/guides/your-data)

Produkt można opisywać jako „własny hosting aplikacji, kontrolowany zakres danych przekazywanych do AI”. Nie jako „dane nigdy nie wychodzą”. Przed realnymi sprawami dobór dostawcy, umowy i zakres przetwarzania wymagają przeglądu kancelarii. Demo wykorzystuje fikcyjne materiały.

Dodatkowe podstawy dla wdrożenia: role, izolacja spraw, limity uploadu i kosztów, kopia zapasowa z próbą odtworzenia, usuwanie danych oraz logi techniczne bez treści klientów. Podgląd danych API jest elementem sprawy objętym tymi samymi zasadami dostępu i retencji.

## 8. Model danych

Najważniejsze obiekty: kancelaria, użytkownik, sprawa, wiadomość, dokument, wersja dokumentu, fragment źródłowy, propozycja faktu, wybrana wartość faktu, wierzyciel, zobowiązanie, kandydat powiązania, rozbieżność, pytanie, projekt pisma, zatwierdzenie i zdarzenie audytowe.

Fakt zawiera: nazwę pola, wartość, status, źródło, datę dotyczącą wartości, czas pozyskania, wersję i osobę potwierdzającą. Kilka źródeł może dawać różne wartości; nie kasujemy ich przy wybraniu jednej.

Statusy: brak, deklaracja klienta, odczyt z dokumentu, dane z rejestru, wymaga wyjaśnienia, potwierdzone przez prawnika. Pochodzenie i przegląd są osobnymi cechami; dokument klienta nie jest automatycznie dowodem prawdziwości każdej deklaracji.

Zobowiązanie i wierzyciel są osobne: jedna firma może mieć kilka roszczeń, a jedno roszczenie może zmienić wierzyciela. Kwoty liczymy dokładnie w groszach lub typie decimal; przechowujemy walutę, składniki i datę salda. Nie sumujemy bezwarunkowo wartości z różnych dat i walut.

Zmiana danych użytych w zatwierdzonym projekcie tworzy nową wersję do ponownego przeglądu. Poprzednie zatwierdzenie pozostaje związane z poprzednią wersją.

## 9. Kolejność wykonania

Etap A: schemat sprawy, fikcyjne dokumenty, ręczny przegląd i źródła. Wynik: działający panel, zanim włączymy LLM.

Etap B: ekstrakcja przez API i czat. Wynik: rozmowa i PDF zasilają tę samą kartę sprawy.

Etap C: rozbieżności i możliwe podwójne liczenie długu. Wynik: dokładny scenariusz demonstracji, z kontrolą decyzji użytkownika.

Etap D: dokumenty z szablonu, wersje, zatwierdzenie, eksport JSON/CSV. Wynik: kompletny przepływ do pokazania potencjalnemu zleceniodawcy.

Etap E: integracje MF/KRS i mała zatwierdzona baza wiedzy. Wynik: realna integracja publiczna oraz odpowiedzi wskazujące źródła.

Etap F: wdrożenie demo na serwerze, pomiary i nagranie. Dostęp do serwera, domena i konfiguracja pozostają do ustalenia przed wykonaniem.

OCR trudnych skanów, orzecznictwo i monitoring KRZ to kolejne zakresy. Nie uzależniamy pierwszej demonstracji od ich ukończenia.

## 10. Jak wykazać jakość

Przygotowujemy 20 fikcyjnych spraw i oczekiwane wyniki: rozmowy z korektami, kilka dokumentów tej samej umowy, zmiana wierzyciela, różne daty salda, brak kwoty, mieszane waluty, nieczytelny skan, próba sterowania instrukcjami w PDF i awaria API.

Mierzymy poprawność pól, przypisanie do źródeł, wykryte rozbieżności, fałszywe alarmy, pomyłki w powiązaniu długów, koszt i czas przeglądu. Testy uprawnień, zatwierdzenia i obliczeń są deterministyczne. Ocena jakości ekstrakcji wymaga ręcznie opisanych oczekiwanych danych, nie wyłącznie oceny przez drugi LLM.

Wymagania demonstracji: żadnego cichego nadpisania rozbieżności, żadnego automatycznego scalenia długów, brakująca kwota pozostaje nieznana, każdy fakt ma źródło albo jawne oznaczenie braku źródła, model nie może zatwierdzić dokumentu.

Nie ogłaszamy oszczędności czasu bez pomiaru. Zgłoszenie „70% pewności” generowane przez model nie jest skalibrowaną miarą prawdopodobieństwa.

## 11. Propozycja współpracy freelancerskiej

Pokazujemy krótkie nagranie całej ścieżki, własne repozytorium, opis API, testy i tabelę ograniczeń. Proponujemy wydzielony płatny pilotaż: ekstrakcja i kontrola danych dla uzgodnionych typów dokumentów.

Moduł powinien móc przyjąć dokument i dane rozmowy oraz zwrócić ustrukturyzowane fakty, źródła, rozbieżności i pytania. Konkretnego sposobu podłączenia do Legal Flow nie obiecujemy bez ich dokumentacji i uzgodnienia. Pokazujemy możliwość integracji przez JSON/API, nie wykonujemy integracji z ich systemem bez dostępu.

To daje jasny zakres do zlecenia freelancerowi i możliwość rozwijania modułu bez odtwarzania całego produktu.

Powiązany research: [ZRODLA-DANYCH-BOTA.md](ZRODLA-DANYCH-BOTA.md).
