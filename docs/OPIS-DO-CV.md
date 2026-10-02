# CaseCheck — opis projektu do CV i profilu

Poniższy fragment opisuje zbudowany projekt. Dane osobowe, doświadczenie i stanowisko należy uzupełnić własnymi informacjami.

## Wersja do CV

**CaseCheck — aplikacja przyjęcia i przeglądu spraw, projekt portfolio, 2026**  
JavaScript / Node.js / SQLite / REST / OpenAI, Anthropic, DeepSeek / PDF.js / PDFKit / GitHub Actions / Linux VPS

Projekt rozwijany z pomocą AI: od wywiadu i dokumentów do kartoteki zobowiązań, kontroli sald i wersjonowanych projektów PDF.

- Kontrola pochodzenia danych: cytaty i źródła, kwoty w groszach, oddzielne waluty/daty, możliwe duplikaty oraz korekty z historią.
- Konta i role, izolacja kancelarii, wygasający link klienta do jednej sprawy, przegląd konkretnej wersji i odrzucanie spóźnionego wyniku AI po korekcie.
- Pięć wzorów dokumentów, OCR przez API, KRS/VAT, zadania i nazwani wykonawcy, prywatny stan i backup z weryfikacją plików.
- Wdrożony panel HTTPS. 48 testów automatycznych, CI na Node 22/24 i próby rzeczywistych API na fikcyjnych materiałach. Pakiet 18 spraw do testów inżynierskich.

Kod: [github.com/krapcys1-maker/casecheck](https://github.com/krapcys1-maker/casecheck). [Portfolio PDF](../output/pdf/casecheck-portfolio.pdf). Demo wymaga konta.

## Krótka wersja do przedstawienia projektu

„CaseCheck to mój projekt portfolio rozwijany z pomocą AI. Zamiast kończyć na samym wywołaniu modelu, przygotowałem cały obieg: źródło, walidacja, przegląd, korekta, wersja dokumentu i wdrożenie. Pokazuję go na przykładzie różnicy 10 tys. zł między deklaracją klienta a dokumentami oraz cesji, która mogłaby zostać policzona dwa razy. Kod, testy i działające demo można sprawdzić.”

## Granice tego opisu

To opis projektu, bez deklaracji kwalifikacji prawniczych, zatrudnienia u LegalFlow lub potwierdzonej oszczędności czasu. Testową rolę prawnika symulował agent AI; niezależny przegląd prawny i pomiar na rzeczywistych sprawach pozostają kolejnym etapem. Na rozmowie warto umieć wyjaśnić kod i decyzje opisane w [architekturze](ARCHITEKTURA.md), w tym rzeczywisty błąd interpretacji i jego korektę.
