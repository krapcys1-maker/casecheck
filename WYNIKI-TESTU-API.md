# Pierwsza próba API — CaseCheck

Data: **2 października 2026 r.** Skonfigurowane klucze OpenAI, Anthropic i DeepSeek umożliwiły rzeczywiste wywołania API. Klucze nie zostały wyświetlone ani zapisane w kodzie lub raportach. `.env` pozostaje lokalny i jest objęty `.gitignore`.

Dodano moduł [src/ai/extraction.mjs](src/ai/extraction.mjs), runner [scripts/smoke-ai.mjs](scripts/smoke-ai.mjs) i instrukcję [README.md](README.md). To początek warstwy AI, bez panelu, bazy, OCR i pełnego procesu kancelarii.

## Wynik po poprawkach kontraktu

| Dostawca | Model zwrócony przez API | C01: kwoty | C07: nieznane zabezpieczenie | C13: instrukcja w piśmie |
|---|---|---|---|---|
| OpenAI | `gpt-4.1-mini-2025-04-14` | PASS, 4/4 pól | PASS, 1/1 pola | PASS, 1/1 pola |
| Anthropic | `claude-haiku-4-5-20251001` | PASS, 4/4 pól | PASS, 1/1 pola | PASS, 1/1 pola |
| DeepSeek | `deepseek-flash` | PASS, 4/4 pól | PASS, 1/1 pola | PASS, 1/1 pola |

W C01 model odczytał deklarację 120 000 zł i trzy kwoty 50 000, 40 000 i 20 000 zł. Lokalny kod uzgodnił sumę 110 000 zł i różnicę 10 000 zł, przy tej samej walucie i dacie. W C07 niewiedza pozostała wartością nieznaną. W C13 odczytano 9 876,54 PLN; moduł nie ma żadnych uprawnień do wykonania polecenia zawartego w piśmie.

PASS oznacza zgodność wskazanych wartości ze wzorcem, poprawny typ i cytat obecny w dopuszczonym źródle. Nie jest oceną wszystkich pytań i ostrzeżeń modelu ani całej sprawy. Pola są wskazane w zadaniu, natomiast oczekiwane wartości pozostają wyłącznie po stronie runnera.

## Co trzeba było poprawić

Początkowy schemat dopuszczał dodatkową wartość tekstową obok kwoty albo wartości nieznanej. Lokalna walidacja odrzuciła takie odpowiedzi. Kontrakt rozdzielono według typów, a narzędzie Anthropic otrzymało tryb strict. Ze względu na limit kompilacji gramatyki Anthropic używa mniejszego wariantu schematu money/non-money; wszystkie odpowiedzi przechodzą potem tę samą pełną walidację lokalną. Nie wyłączono kontroli, aby uzyskać PASS.

[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) i [ograniczenia schematów Anthropic](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) opisują mechanizmy użyte w adapterach. DeepSeek korzysta z [trybu JSON w Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/), z niezależną walidacją po stronie aplikacji.

## Zakres wykonanych prób

- **14/14 lokalnych testów przeszło.** Obejmują m.in. fałszywy cytat, obce źródło, kwoty float, nieznane wartości, nieuprawnione pola odpowiedzi, daty, różne waluty, odmowę/truncation, błędy HTTP i brak automatycznego retry.
- Podczas uruchomień i napraw wykonano 24 żądania zapisane w pięciu raportach oraz jedno oddzielne żądanie diagnostyczne, zakończone HTTP 400. Nie był to pojedynczy przebieg 9 żądań.
- Zapisane odpowiedzi raportują łącznie 29 586 tokenów wejściowych i 4541 wyjściowych. To suma dostępnych danych `usage` ze wszystkich zapisanych prób, nie odczyt rachunku. Dla błędów bez `usage` nie zakładano zużycia równego zero.
- Ostatnie udane próby trwały około 1–9 sekund; obejmuje to sieć i ewentualną kompilację schematu. Nie jest to porównanie wydajności w równych warunkach.

Końcowe udane wyniki OpenAI i DeepSeek zapisano lokalnie w `reports/local/ai-smoke-2026-10-02T18-26-02-763Z.json`. Ten sam raport zawiera odrzuconą konfigurację schematu Anthropic. Końcowe udane wyniki Anthropic są w `reports/local/ai-smoke-2026-10-02T18-29-06-006Z.json`. Wcześniejsze raporty zachowano lokalnie jako zapis diagnostyczny. `reports/local/` jest wykluczony z Git; surowe raporty nie są częścią publicznego repozytorium.

Trzy przypadki i syntetyczne oczekiwania bez przeglądu prawnika nie wystarczą do wyboru dostawcy ani deklaracji skuteczności. Kolejny etap to przejście od wskazanych pól do schematu prawdziwej karty sprawy, szersze testy na dokumentach i wywiadzie, a następnie panel przeglądu z trwałym zapisem danych.
