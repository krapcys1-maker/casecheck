# CaseCheck: projekt na rozmowę biznesową i techniczną

CaseCheck porządkuje przyjęcie sprawy: rozmowę, dokumenty, salda i materiał przekazywany do przeglądu. Pokazuje, jak zbudować i wdrożyć cały przepływ z AI, zachowując kontrolę źródeł, wersji oraz dostępu.

- [Działający panel HTTPS](https://astrologiapoludzku.com/casecheck/) — wymaga konta. Tymczasowa ścieżka na istniejącej domenie; strona główna działa osobno.
- [Kod i CI](https://github.com/krapcys1-maker/casecheck) — publiczne repozytorium, licencja MIT.
- [Scenariusz pokazu](DEMO.md), [architektura](ARCHITEKTURA.md), [obsługa](OBSLUGA.md), [testy i dowody](TESTY.md).
- [Materiały testowe](../tests/full-fixtures/README.md) — 18 fikcyjnych spraw i dokumenty. Wyniki API oraz testowe przeglądy są opisane oddzielnie.

## Problem, który można pokazać w minutę

Klient deklaruje 120 000 zł. Trzy dokumenty zawierają 50 000, 40 000 i 20 000 zł. CaseCheck pokazuje 110 000 zł i różnicę 10 000 zł, z zachowaniem daty salda. Osoba prowadząca widzi cytat, dokument i zadanie wyjaśnienia. Kolejna osoba może przejąć sprawę bez odtwarzania całej korespondencji.

Wartość projektu wynika z jakości przekazania danych do przeglądu. Skrócenie czasu pracy jest hipotezą do zmierzenia w pilotażu; nie zostało zmierzone na rzeczywistych sprawach kancelarii.

## Co faktycznie jest zbudowane

| Obszar | Działanie do pokazania | Dowód |
|---|---|---|
| Przyjęcie sprawy | Wywiad konsumencki lub firmowy, kolejne brakujące pytanie, załączniki, link klienta | S01; testy HTTP wywiadu i zakresu linku |
| AI | Odczyt wybranych źródeł przez trzy API; osobny OCR OpenAI | Walidacja cytatu i typów; zapis modelu, wejścia, wyniku i zużycia |
| Kontrola danych | Kwoty w groszach, osobne waluty/daty, różnice salda, możliwe duplikaty | S01 i S02; testy S06 i powiązania cesji |
| Przegląd | Role, korekty ze źródłem, zachowana historia, zatwierdzanie konkretnej wersji | Test unieważnienia pisma po zmianie danych |
| Dokumenty | Pięć edytowalnych wzorów pomocniczych, polskie znaki, eksport PDF | Eksporty i test zawartości źródłowej pisma |
| Praca zespołu | Podsumowanie sprawy, filtry kartoteki, zadania i wybór osoby po nazwie | Testy prywatności katalogu zespołu; kontrola UI |
| Wdrożenie | HTTPS, systemd użytkownika, prywatny stan, backup i odtworzenie | Wdrożony VPS, kontrola integralności kopii |

Projekt rozwijany jest z pomocą agenta AI. Testowa symulacja roli prawnika również została wykonana przez agenta AI. Jest to materiał inżynierski na fikcyjnych danych; przegląd niezależnego prawnika pozostaje osobnym etapem.

## Jak opowiedzieć o nim na rozmowie

> Zbudowałem z pomocą AI działający projekt pokazujący przyjęcie i przegląd sprawy. Najważniejszy problem to wiarygodność danych przekazywanych prawnikowi. Każda wartość ma źródło, nieznana informacja pozostaje brakująca, a zmiana danych wymaga ponownego przeglądu dokumentu. Mogę pokazać działający proces, jego testy i decyzje architektoniczne, a następnie uzgodnić zakres pilotażu na procesie Państwa zespołu.

To propozycja opisu własnego projektu, do uzupełnienia w CV własnymi danymi i doświadczeniem. Nie przypisuje użytkownikowi kwalifikacji prawniczych ani historii zatrudnienia.

Na rozmowie technicznej warto przejść przez trzy decyzje: rozdzielenie wersji danych od zmian administracyjnych; odrzucenie spóźnionego wyniku AI po ręcznej korekcie; sumowanie wyłącznie porównywalnych kwot po przeglądzie duplikatów. Każda ma działający test i konkretny skutek dla użytkownika.

## Dopasowanie rozmowy do LegalFlow / Booster

Publiczna strona LegalFlow akcentuje komunikację z klientem, dokumenty na wzorach i audytowalny proces. CaseCheck daje konkretny materiał do rozmowy o jakości danych na początku tego procesu. Jest samodzielnym projektem portfolio, bez deklaracji współpracy lub znajomości wewnętrznej architektury LegalFlow. Publiczne funkcje ich produktu nie były przez nas audytowane. Źródło sprawdzono 3 października 2026 czasu lokalnego: [aktualna strona LegalFlow](https://restrukturyzacja.boosterai.pl/).

Wcześniejsza [analiza firmy](../ANALIZA-LEGALFLOW.md) dokumentuje punkt wyjścia. Zakres strony marketingowej może się zmieniać; aktualny opis tego projektu znajduje się w niniejszym katalogu.

## Propozycja następnego pilotażu

1. Wspólnie wybrać jedną ścieżkę przyjęcia sprawy i zatwierdzić pytania, wzory, zakres dostępu oraz przekazywania danych do API.
2. Zbudować odrębny, legalnie pozyskany zestaw walidacyjny. Prawnik opisuje oczekiwane dane i spory; oczekiwania pozostają poza wejściem modelu.
3. Zmierzyć czas przygotowania i przeglądu tej samej klasy spraw, poprawność kwot/dat/wierzycieli, zgodność cytatów, odsetek korekt, koszt API i zachowanie po błędzie.
4. Dopiero na tej podstawie wybrać integrację CRM lub kolejne dokumenty. Dla większej instalacji zaprojektować migrację do Postgresa, magazynu plików oraz kolejki zadań.

Kryteria powodzenia należy uzgodnić z zespołem przed testem. Aktualne dane syntetyczne pozwalają sprawdzić mechanikę i regresje; nie dowodzą oszczędności czasu ani jakości modelu na rzeczywistych aktach.
