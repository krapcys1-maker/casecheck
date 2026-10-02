# Źródła danych dla demonstracji i przyszłego bota

Research z 2 października 2026 r. Źródła publiczne sprawdzone w dokumentacji. Krótkie próby połączenia z KRS, MF VAT i ELI zwróciły HTTP 200; nie jest to pełny test integracji ani gwarancja przyszłej dostępności.

## 1. Podstawowy wybór

W pierwszej wersji bierzemy fakty z fikcyjnej rozmowy i fikcyjnych dokumentów. Przepisy, procedury kancelarii i rejestry są innymi klasami danych. Rejestr firm nie poda pełnej listy prywatnych długów klienta; nie powinien być używany do zgadywania brakujących zobowiązań.

## 2. Źródła i ich granice

| Źródło | Co wnosi | Dostęp i ograniczenia | Priorytet |
|---|---|---|---|
| Rozmowa klienta | Opis sytuacji, dochody, wydatki, zobowiązania, majątek | Dane konkretnej sprawy; status deklaracji, wymagają przeglądu | Pierwsza wersja |
| Dokumenty klienta | Kwoty, daty, wierzyciele, numery umów i spraw | Wezwania, umowy, pisma egzekucyjne itd.; OCR i interpretacja mogą się mylić | Pierwsza wersja |
| Wzory i procedury kancelarii | Pytania, wymagane pola, szablony i kroki procesu | Materiały dostarczone przez uprawnioną kancelarię; do demo własne wzory | Pierwsza wersja |
| ELI / API Sejmu | Teksty i metadane aktów prawnych | Publiczne API, wersje, relacje i daty; sprawdzamy późniejsze nowelizacje | Baza wiedzy |
| API KRS | Dane odpisu aktualnego i pełnego, informacje o zmianach | Otwarte bez logowania, wyszukanie po KRS; dane osób fizycznych w API podlegają anonimizacji według portalu | Ścieżka firmowa |
| MF — wykaz VAT | Dane podmiotu i status VAT na wskazany dzień | API po NIP/REGON, limity i data zapytania; nie jest pełnym rejestrem wszystkich przedsiębiorców | Ścieżka firmowa |
| GUS REGON BIR | Dane rejestrowe firmy, wyszukanie po NIP/REGON/KRS | Bezpłatne, klucz produkcyjny po rejestracji, limity; integracja usługowa | Kolejna integracja |
| CEIDG | Dane działalności gospodarczych objętych rejestrem | Hurtownia z API i autoryzacją tokenem; potwierdzić aktualną wersję i warunki przed wdrożeniem | Kolejna integracja |
| KRZ | Publiczne informacje o określonych postępowaniach i obwieszczeniach | Nie potwierdzono ogólnodostępnego oficjalnego API; publiczne FAQ MS mówi o planowanym API | Po ustaleniu dostępu |
| Formularze MS / instrukcje KRZ | Struktura zbieranych danych i materiał pomocniczy | Publiczne materiały bywają starsze; sprawdzamy aktualność i tryb złożenia | Przegląd z prawnikiem |

## 3. Przepisy: źródła oficjalne

[ELI API — dokumentacja](https://api.sejm.gov.pl/eli_pl.html) udostępnia teksty PDF, wybrane teksty HTML, metadane, odwołania oraz listę zmian. Przykładowe ścieżki:

```text
GET https://api.sejm.gov.pl/eli/acts/DU/2026/913
GET https://api.sejm.gov.pl/eli/acts/DU/2026/913/text.pdf
GET https://api.sejm.gov.pl/eli/changes/acts?since=2026-10-01T00%3A00%3A00
```

Wyszukane punkty startowe:

- [Prawo upadłościowe — tekst jednolity, Dz.U. 2026 poz. 913](https://eli.gov.pl/eli/DU/2026/913/ogl), stan prawny tekstu podany w metadanych: 10 czerwca 2026 r.
- [Prawo restrukturyzacyjne — tekst jednolity, Dz.U. 2026 poz. 533](https://eli.gov.pl/eli/DU/2026/533/ogl), stan prawny tekstu: 25 marca 2026 r.

To znalezione teksty jednolite, nie zapewnienie kompletnego stanu prawnego na dzień demonstracji. Trzeba uwzględnić późniejsze zmiany i przepisy przejściowe. Zmiana metadanych albo nowy dokument powinny tworzyć zadanie aktualizacji, a nie automatycznie zastępować zatwierdzone instrukcje kancelarii.

RAG na początek ograniczamy do starannie wybranego materiału, z numerem artykułu i źródłem. Bez źródła bot zgłasza brak podstawy. Cytowanie dokumentu nie oznacza, że wniosek prawny modelu jest poprawny.

## 4. KRS: możliwa realna integracja

[Portal KRS — sekcja Otwarte API](https://prs.ms.gov.pl/krs) opisuje odpis aktualny, pełny oraz listy podmiotów ze zmianami. Informuje też o anonimizacji imion, nazwisk i PESEL osób fizycznych w danych pobranych przez API.

Przykład odpisu podmiotu publicznie wskazanego w polityce Legal Flow; sprawdzony HTTP 200:

```text
GET https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/0001068572?rejestr=P&format=json
```

Nie zakładamy, że KRS można odnaleźć bezpośrednio tym endpointem po NIP. Numer KRS pozyskujemy od klienta lub z odpowiedzi innego uprawnionego źródła, a tożsamość podmiotu potwierdzamy po identyfikatorach. Spółki i jednoosobowe działalności wymagają innych ścieżek źródeł.

Przy wartości zapisujemy adres źródła, czas pobrania i identyfikator odpowiedzi albo migawkę. Aktualny odpis nie jest automatycznie opisem stanu firmy sprzed kilku lat.

## 5. Ministerstwo Finansów — VAT

[Dokumentacja API wykazu podatników VAT](https://wl-api.mf.gov.pl/) opisuje wyszukiwanie po NIP i REGON, a także sprawdzanie rachunków. Przykład sprawdzony HTTP 200:

```text
GET https://wl-api.mf.gov.pl/api/search/nip/8992976718?date=2026-10-02
```

Wynik zapisujemy wraz z datą sprawdzenia i identyfikatorem zapytania. Brak wyniku w wykazie VAT nie oznacza, że firma nie istnieje. Źródło służy identyfikacji/statusowi VAT, nie ocenie wypłacalności.

[FAQ MF](https://www.podatki.gov.pl/vat/bezpieczna-transakcja/wykaz-podatnikow-vat/q-a-wykaz-podatnikow-vat/?altTemplate=ArticlePdf&download=True) opisuje limity; adapter powinien mieć bufor wyników, ograniczenie liczby żądań i obsługę błędów. Nie zakładamy nieograniczonego dostępu.

## 6. GUS REGON

[Oficjalna strona BIR / API REGON](https://api.stat.gov.pl/Home/RegonApi) opisuje bezpłatny dostęp, wyszukiwanie po NIP, REGON i KRS oraz sposób uzyskania klucza produkcyjnego. To dobry dodatkowy sposób znalezienia identyfikatorów firmy. Dokumentacja i klucz są potrzebne do wykonania integracji; w tym researchu nie uzyskiwano klucza ani nie testowano zapytań produkcyjnych.

## 7. CEIDG

[Oficjalna dokumentacja API v3 Hurtowni danych CEIDG](https://pliki.biznes.gov.pl/akademia/20250117/HD%20CEIDG%20-%20API%20v3%20HD%20-%20Dokumentacja%20dla%20integrator%C3%B3w%20v1.1.pdf) pokazuje wyszukiwanie firmy m.in. po NIP i nagłówek Authorization z tokenem JWT.

Jest użyteczna dla działalności wpisanych do CEIDG. Przed implementacją sprawdzamy bieżącą dokumentację, rejestrację oraz dostępne środowisko testowe; samego API nie testowano. Nie kodujemy na stałe znalezionej starszej wersji dokumentacji jako gwarantowanie aktualnej.

## 8. KRZ — istotna niepewność

[Oficjalna odpowiedź MS o API KRZ](https://www.gov.pl/web/sprawiedliwosc/8-czy-planuja-panstwo-realizacje-api-w-systemie-krz) nadal wskazuje zaplanowanie rozwiązania w fazie rozwoju. [Opis rejestru](https://www.gov.pl/web/sprawiedliwosc/krajowy-rejestr-zadluzonych) przedstawia jego zakres. Nie potwierdzono publicznej dokumentacji umożliwiającej wykonanie stabilnej oficjalnej integracji.

Nie twierdzimy, że żaden dostęp integracyjny nie istnieje. Przed obiecaniem monitoringu trzeba uzyskać potwierdzenie aktualnego sposobu dostępu od operatora albo dokumentację dostawcy z warunkami korzystania.

Pierwszy wariant: użytkownik importuje pobrany dokument lub wskazuje informację z rejestru, a moduł analizuje treść. Jawność portalu nie jest dowodem dostępności nieograniczonego automatycznego pobierania.

## 9. Formularze i orzecznictwo

[Materiały Ministerstwa Sprawiedliwości](https://www.gov.pl/web/sprawiedliwosc/formularze-konsumenci-od-24-marca-2020) zawierają wzory i poradnik, ale strona odwołuje się do 2020 r., a poradnik do 2021 r. Są materiałem do przeglądu, nie gotową aktualną specyfikacją bota w 2026 r. Pierwszym dokumentem wynikowym powinno być własne podsumowanie dla prawnika, a nie obiecywany kompletny wniosek do złożenia.

Publiczne orzecznictwo można później dobierać z [bazy Sądu Najwyższego](https://www.sn.pl/pl/wyszukiwarka-orzeczen) i portali sądów. Do pierwszej wersji nie jest niezbędne. Nie zweryfikowano API ani warunków masowego pobierania tych baz. Włączamy tylko wybrane, sprawdzone dokumenty z sygnaturą, datą, sądem i źródłem. Nie zastępują one analizy konkretnej sprawy.

Treści komercyjnych komentarzy, LEX/Legalis i szablonów innych firm nie traktujemy jako własnej bazy do kopiowania; do takiego wykorzystania potrzebny jest odpowiedni zakres praw lub licencji. Najprostsza baza demonstracyjna to źródła urzędowe i własne materiały.

## 10. Skąd dane do testów

Tworzymy 20 fikcyjnych spraw oraz fikcyjne wezwania i umowy wyraźnie oznaczone jako demonstracyjne. Każda ma ręcznie opisaną prawidłową listę faktów, powiązań i braków. W scenariuszach wykorzystujemy literówki, korekty, zmiany wierzyciela, różne daty salda, kilka dokumentów jednej umowy, brak danych i sprzeczne odpowiedzi.

Nie potrzebujemy trenować własnego modelu. Dane są potrzebne do testowania ekstrakcji, kontroli i procesu. Realne materiały kancelarii mogą wejść dopiero w uzgodnionym pilotażu, z określonym dostępem i zasadami przetwarzania.

## 11. Narzędzia techniczne z publicznym kodem

- [Tesseract](https://github.com/tesseract-ocr/tesseract): OCR bez lokalnego generatywnego LLM; jakość polskich skanów trzeba zmierzyć.
- [Docling](https://github.com/docling-project/docling): rozbudowany parser dokumentów i OCR, opcjonalny kolejny krok. Nie wszystkie jego tryby pasują do wymagania bez lokalnego modelu generatywnego.
- [pgvector](https://github.com/pgvector/pgvector): wyszukiwanie wektorowe w Postgresie; opcjonalne po sprawdzeniu, że proste wyszukiwanie nie wystarcza.
- [Presidio](https://github.com/data-privacy-stack/presidio): wykrywanie i maskowanie identyfikatorów, z własnymi regułami dla danych polskich. Dokumentacja zastrzega, że automatyczne wykrywanie nie znajduje koniecznie wszystkich danych wrażliwych.
- [Docassemble](https://github.com/jhpyle/docassemble): inspiracja do logiki wywiadu i generowania dokumentów.

Przed użyciem dobieramy konkretne wersje, sprawdzamy licencje zależności i uruchamiamy projekty na materiałach demonstracyjnych. W tym researchu kodu tych narzędzi nie uruchamiano.

## 12. Uzupełnienie researchu: środowiska testowe i GitHub

Rozszerzona analiza i dobór bibliotek: [RESEARCH-I-REKOMENDACJE.md](RESEARCH-I-REKOMENDACJE.md). Sprawdzono metadane 20 repozytoriów, wybrane README, licencje i fragmenty kodu; nie uruchamiano projektów.

[Oficjalna strona MF](https://www.gov.pl/web/kas/api-wykazu-podatnikow-vat) wskazuje środowisko `https://wl-test.mf.gov.pl` oraz [plik danych testowych](https://www.gov.pl/attachment/5e7f6a61-d6de-4841-891b-ef8122353445). Odczyt dla NIP 3245174504 z tego pliku i daty 2026-10-02 zwrócił HTTP 200 oraz podmiot. Plik opisano jako dane z 2019 r.; poszczególnych przypadków nie traktujemy jako gwarantowanego zestawu na każdą datę.

Indeksowana dokumentacja CEIDG v3 wskazuje środowisko `https://test-dane.biznes.gov.pl/api/ceidg/v3/firmy`. Pobranie dokumentacji PDF przez narzędzie zwróciło 403; nie testowano zapytań z tokenem. Oficjalna strona GUS udostępnia dokumentację BIR 1.2; zgodność starszych klientów trzeba zweryfikować.

KRZ posiada także wyspecjalizowane integracje: [opis wydania 1.13.001](https://krz-info-prod.apps.ocp.prod.ms.gov.pl/krz-help/KRZ_Opis_zmian_wydanie_1.13.001.pdf) wymienia API dla organów administracji publicznej do zamieszczania danych egzekucyjnych i alimentacyjnych. Nie jest to potwierdzenie ogólnodostępnego API odczytu dla kancelarii.

Dodano [20 własnych scenariuszy syntetycznych](tests/fixtures/cases.json) z [opisem użycia](tests/fixtures/README.md): wybrane fakty, cytaty, kontrola kwot i kryteria procesu. Są punktem startowym do przeglądu człowieka i przyszłego runnera, bez rzeczywistych PDF-ów i skanów. Sprawdzono spójność danych, nie jakość bota.
