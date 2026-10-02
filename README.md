# CaseCheck — moduł AI i panel testów

[![Tests](https://github.com/krapcys1-maker/casecheck/actions/workflows/tests.yml/badge.svg)](https://github.com/krapcys1-maker/casecheck/actions/workflows/tests.yml)

Publiczny projekt przyjmowania i kontroli danych spraw upadłościowych oraz restrukturyzacyjnych. Fakty mają wskazane źródła, a decyzje i zatwierdzanie pozostają po stronie prawnika. Repozytorium: [krapcys1-maker/casecheck](https://github.com/krapcys1-maker/casecheck). Kod i własna dokumentacja są dostępne na [licencji MIT](LICENSE); zasady współpracy opisuje [CONTRIBUTING.md](CONTRIBUTING.md).

Cel pełnej aplikacji opisuje [PLAN-PELNEGO-BOTA.md](PLAN-PELNEGO-BOTA.md), a wybór bibliotek i danych [RESEARCH-I-REKOMENDACJE.md](RESEARCH-I-REKOMENDACJE.md).

Aktualny kod to **moduł ekstrakcji danych przez API, runner krótkich prób i chroniony panel testów syntetycznych**. Pełny bot z wywiadem, kontami kancelarii, bazą spraw i OCR jest kolejnym etapem. Działa na Node.js 22.12+ bez dodatkowych zależności. Klucze ładowane są z lokalnego `.env` albo środowiska usługi; plik jest wykluczony z Git. `.env.example` zawiera wyłącznie nazwy konfiguracji.

Pierwsze rzeczywiste próby i ich ograniczenia: [WYNIKI-TESTU-API.md](WYNIKI-TESTU-API.md). Po dopracowaniu kontraktu trzej dostawcy przeszli trzy wskazane scenariusze; lokalne testy: 14/14.

## Uruchomienie

Pobierz projekt i utwórz własną konfigurację dla prób API. Uzupełnij tylko klucze dostawców, których chcesz użyć. Do testów lokalnych `.env` nie jest potrzebny. Projekt nie ma dodatkowych zależności npm.

```powershell
git clone https://github.com/krapcys1-maker/casecheck.git
cd casecheck
Copy-Item .env.example .env
npm test
npm run ai:check
npm run ai:smoke
```

GitHub Actions uruchamia `npm test` na Node.js 22 i 24 dla zmian w `main` i pull requestów. Nie korzysta z kluczy AI ani z runnera płatnych prób.

## Panel przeglądarkowy i serwer

Panel pokazuje 14 scenariuszy ekstrakcji, fikcyjne źródła, odczytane fakty i cytaty oraz zgodność wybranych pól ze wzorcem. Jedno kliknięcie wywołuje jednego dostawcę. Nie przyjmuje dokumentów ani tekstów rzeczywistych klientów.

Po ustawieniu osobnego `CASECHECK_ACCESS_TOKEN` (minimum 32 znaki) w lokalnym `.env` można uruchomić `npm start` i otworzyć `http://127.0.0.1:8860/casecheck/`. Hasło panelu nie jest kluczem dostawcy AI. Usługa nasłuchuje tylko na loopback; publiczny dostęp wymaga reverse proxy z HTTPS.

Wdrożenie na VPS z istniejącym Node.js i nginx opisuje [deploy/README.md](deploy/README.md). Dodano jednostkę systemd użytkownika i fragment konfiguracji nginx. Panel ma domyślnie limit 20 prób na dzień UTC, trwały licznik poza kodem i jedno wywołanie jednocześnie. Jest to limit prób, nie wydatków w walucie. Lokalne testy modułu i serwera: 22/22.

`npm test` wykonuje testy lokalne, bez wywołań API. `ai:check` sprawdza obecność konfiguracji i plan próby, również bez połączeń. `ai:smoke` wywołuje skonfigurowanych dostawców na trzech fikcyjnych przypadkach C01/C07/C13. Domyślnie to maksymalnie 9 żądań, limit 1200 tokenów wyjściowych na żądanie, timeout 45 sekund i brak automatycznego retry. Wywołania modeli API są płatne zgodnie z kontem dostawcy.

Można ograniczyć dostawcę i przypadek:

```powershell
node scripts/smoke-ai.mjs --providers openai --cases C01
node scripts/smoke-ai.mjs --providers anthropic,deepseek --cases C05,C07
```

Jeden przebieg nie może przekroczyć 9 planowanych żądań. Błąd HTTP zatrzymuje kolejne próby tego dostawcy. Kod wyjścia 1 oznacza błąd API, niezgodność danych albo niewykonanie całego planu; szczegóły są w raporcie.

## Zakres modułu

- OpenAI Responses API ze Structured Outputs, Anthropic Messages API z narzędziem zwracającym dane i DeepSeek Chat Completions w trybie JSON.
- Jeden kontrakt danych, kwoty w groszach/centach, jawne wartości nieznane, waluta, data salda, źródło i cytat.
- Walidacja formatu, typu wartości, źródeł, cytatów, dat i wymaganych pól po stronie lokalnego kodu.
- Dokładne uzgodnienie kwot tylko dla tej samej waluty, daty i wartości nieprzybliżonych. Funkcja nie wykrywa samodzielnie, czy roszczenia są duplikatami; do sumowania trzeba przekazać już wybraną listę.
- Zapis modelu, wersji promptu, hasha wejścia, czasu i zużycia tokenów. Klucze ani całe `.env` nie wchodzą do promptu i raportu.

Nazwy `requested_fields` tworzą kontrakt pojedynczego zadania. Runner bierze je z fixture, ale nie przekazuje oczekiwanych wartości, obliczeń ani kryteriów zaliczenia do modelu. Test sprawdza wskazane pola, a nie swobodną ekstrakcję wszystkich informacji.

Wyniki znajdują się w `reports/local/`, również wykluczonym z Git. Raport zawiera odpowiedzi modeli na fikcyjne teksty. Obecny runner jest przeznaczony wyłącznie do dołączonego zestawu syntetycznego. Przed przetwarzaniem rzeczywistych spraw potrzebna będzie autoryzacja, izolacja kancelarii, reguły przepływu danych i retencji opisane w planie.

## Jak interpretować wynik

PASS oznacza poprawne wskazane wartości i odwołania do źródeł, po przejściu lokalnej walidacji. Cytat obecny w tekście nie potwierdza automatycznie poprawności każdej interpretacji. Pytania i ostrzeżenia wymagają osobnej oceny jakości. Trzy scenariusze nie wystarczają do wyboru najlepszego modelu ani deklarowania skuteczności produkcyjnej.

Przypadek z instrukcją w PDF mierzy ekstrakcję w obecności niezaufanej treści oraz kontrakt odpowiedzi. Nie jest pełnym testem odporności systemu na prompt injection. Nie ma w tym module możliwości zatwierdzania, wysyłania pism ani czytania innych spraw. Sześć scenariuszy workflow z fixture trzeba później wykonać na backendzie i bazie.

## Dokumentacja dostawców sprawdzona przy implementacji

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) i [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
- [Anthropic API primer](https://platform.claude.com/docs/en/claude_api_primer).
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/).

Domyślne modele to ograniczony kosztowo punkt startowy do sprawdzenia połączeń, nie wybór docelowego dostawcy. Można ustawić `OPENAI_MODEL`, `ANTHROPIC_MODEL` i `DEEPSEEK_MODEL`. Adapter Anthropic używa wymuszonego narzędzia zgodnego z wybranym Haiku 4.5; zmiana na model bez obsługi tego trybu wymaga dostosowania adaptera.

Pobrane na potrzeby researchu kopie strony Legal Flow pozostają lokalne. Repozytorium zawiera własne opracowania z odnośnikami do źródeł oraz syntetyczne scenariusze. Projekt nie jest oficjalną integracją ani produktem Legal Flow/Booster.
