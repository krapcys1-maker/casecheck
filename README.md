# CaseCheck — wywiad, dokumenty i przegląd sprawy

[![Tests](https://github.com/krapcys1-maker/casecheck/actions/workflows/tests.yml/badge.svg)](https://github.com/krapcys1-maker/casecheck/actions/workflows/tests.yml)

Otwarty projekt przyjmowania spraw konsumenckich i firmowych. Wersja pilotażowa prowadzi od rozmowy i załączników do kartoteki wierzycieli, przeglądu danych oraz projektów dokumentów. Dane mają źródła; zatwierdzanie należy do konta prawnika.

## Działające moduły

- Konta administratora, prawnika i pracownika, hasła scrypt, wygasające sesje i link klienta do jednej sprawy. Dostęp sprawdzany według kancelarii oraz zakresu linku.
- Trwała kartoteka SQLite, rozmowa po polsku, wywiad konsumencki lub firmowy, poprawki i prośba o kontakt z człowiekiem.
- Ekstrakcja przez OpenAI, Anthropic lub DeepSeek; typy, kwoty w groszach, daty i dosłowne cytaty walidowane na serwerze. Zapis wersji promptu i wejścia oraz zużycia tokenów.
- Prywatny upload PDF, TXT, PNG i JPEG. Lokalny odczyt PDF.js w ograniczonym procesie roboczym. OCR przez OpenAI po osobnym uruchomieniu i potwierdzeniu przekazania całego wskazanego pliku.
- Ręczne korekty i przegląd, wcześniejsze wartości, wykrywanie zgodnych numerów umów oraz ręczne powiązanie dokumentów jednego długu. Sumy według waluty i daty.
- Pięć edytowalnych wzorów: karta sprawy, pomocniczy wykaz wierzycieli, prośba o uzupełnienie, prośba o wyjaśnienie roszczenia i szkic wstępnego planu restrukturyzacyjnego. Eksport PDF; zmiana danych unieważnia poprzedni projekt.
- Etapy, zadania, przypisanie do konta, dziennik wersji i eksport JSON. Termin prawny wymaga prawnika, podstawy i daty rozpoczynającej bieg.
- Aktualny odpis KRS i wykaz VAT MF, z adresem źródła, datą i identyfikatorem zapytania. Dla fikcyjnych spraw VAT korzysta ze środowiska testowego.
- Kopia bazy wraz z plikami, hashe, kontrola integralności i test odtworzenia. Usuwanie aktywnej sprawy wraz z historią i linkami.

## Uruchomienie

Node.js 22.18+ i npm. Modele działają przez zewnętrzne API.

```powershell
git clone https://github.com/krapcys1-maker/casecheck.git
cd casecheck
npm ci
Copy-Item .env.example .env
# Uzupełnij wybrane klucze API i własne długie hasło administratora.
npm test
npm start
```

Aplikacja nasłuchuje na `127.0.0.1:8861`, ścieżka `/casecheck/`. Konto początkowe: `admin@casecheck.local`; hasło z `CASECHECK_ADMIN_PASSWORD`. Administrator tworzy konta. Przycisk „Wczytaj 18 testowych spraw” importuje fikcyjne źródła i pliki; nie przedstawia ich jako wyników AI. Odczyt uruchamia się osobno.

Publiczne wdrożenie wymaga wybranej domeny i HTTPS. [Instrukcja VPS](deploy/APP.md) opisuje usługę użytkownika, prywatny stan, kopie i wycofanie. `.env`, hasła, baza, pliki klientów i lokalne raporty są wykluczone z Git.

## Dane i pisma

[18 pełnych spraw testowych](tests/full-fixtures/README.md) zawiera 48 PDF-ów, dwa skany PNG, rozmowy i oczekiwania: cesję, spór, kilka umów jednego banku, różne waluty, brak daty, hipotekę, leasing, zerowy dochód, nieczytelność oraz instrukcję w niezaufanym materiale. Cztery przypadki mają oznaczenie holdout; zestaw nie jest niezależnym badaniem skuteczności.

Wzory i pytania oparto na [oficjalnych źródłach](legal/README.md), sprawdzonych 2 października 2026 r. Są materiałami przygotowawczymi. Karta i wykaz nie zastępują urzędowego formularza lub proceduralnego spisu wierzytelności. Model nie kwalifikuje do postępowania i nie składa pism. Baza pytań oraz wzorów wymaga zatwierdzenia przez kancelarię przed analizą rzeczywistych danych.

Wybrane źródła trafiają do wskazanego API. OCR przekazuje cały wskazany plik do OpenAI. `store:false` nie zapewnia braku retencji u dostawcy. Nie wdrożono pełnego KRZ, CEIDG, BIR ani automatycznej wysyłki. KRS/VAT nie podają prywatnych długów klienta. Obsługiwane pliki nie obejmują DOCX i ZIP.

## Testy i limity

`npm test` działa bez kluczy i płatnych wywołań. GitHub Actions sprawdza Node 22 i 24. Testy obejmują izolację, role, linki, wyścig wersji, awarię AI, PDF/skany, kopię i odtworzenie, integralność danych, waluty i duplikaty.

Trwały limit: 20 żądań AI na dzień UTC i jedno wywołanie naraz. Błędy także zużywają rezerwację; brak automatycznych powtórek. To limit liczby żądań, nie rachunku w walucie. Wynik starej wersji jest odrzucany. Przerwane zadanie wymaga jawnego ponowienia. Jeden proces aplikacji może posiadać dany katalog stanu.

`node scripts/smoke-workflow.mjs --prepare` przygotowuje fikcyjny stan bez API. `--run` wykonuje do ośmiu płatnych żądań OpenAI i eksportuje pięć PDF-ów do kontroli. Nie uruchamiaj go równolegle z aplikacją na tym samym stanie. Lokalne hasła i raporty są ignorowane przez Git.

Poprzedni panel pojedynczych scenariuszy: `npm run start:lab`, port 8860. Jego [instrukcja](deploy/README.md) i [pierwsze wyniki API](WYNIKI-TESTU-API.md) opisują wcześniejszy etap. Runner `ai:smoke` jest osobną płatną próbą na maksymalnie dziewięciu zadaniach.

## Research i licencje

[Research GitHub](RESEARCH-I-REKOMENDACJE.md), [źródła danych](ZRODLA-DANYCH-BOTA.md) i [zakres procesu](PLAN-PELNEGO-BOTA.md). Użyto PDF.js (Apache-2.0), PDFKit (MIT), SQLite z Node i fontu DejaVu z [odrębną licencją](assets/DejaVu-LICENSE.txt). Własny kod i dokumentacja: [MIT](LICENSE). [Zasady współpracy](CONTRIBUTING.md).

Projekt nie jest produktem ani oficjalną integracją Legal Flow. Research nie daje podstaw do deklarowania równej skuteczności, bezpieczeństwa lub kompletności funkcji komercyjnego systemu.
