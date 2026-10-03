# Pakiet danych po przeglądzie — kontrakt v1

Cel: przekazać wynik kontroli źródeł do kolejnego systemu bez importowania surowego stanu aplikacji lub przyjmowania odczytów AI jako zatwierdzonych danych.

W podsumowaniu sprawy konto prawnika wybiera **Pobierz pakiet JSON**. Odpowiada temu `GET /casecheck/api/cases/{id}/review-package` z bieżącym tokenem sesji w nagłówku `Authorization: Bearer …`. Klient, pracownik i administrator nie otrzymują pakietu; rola prawnika nie otwiera spraw cudzej kancelarii. Operacja niczego nie zmienia i nie uruchamia AI.

| Pole | Znaczenie |
|---|---|
| `schema` | `casecheck-reviewed-data-v1` |
| `case_id`, `data_revision`, `state_revision` | Identyfikator i wersje migawki; odbiorca musi sprawdzić aktualność przed dalszym użyciem |
| `synthetic` | Rozróżnienie danych testowych |
| `review_status` | `blocked` albo `reviewed_partial`; żaden status nie oznacza gotowości prawnej |
| `blockers` | Odczyty oczekujące, duplikaty, brak dowodu, niedoczytane pliki, trwające zadania AI, brak potwierdzonych wartości |
| `missing_fields` | Nadal brakujące obszary wywiadu i pytania |
| `case_facts`, `claims` | Wyłącznie potwierdzone znane wartości; odrzucone i oczekujące wartości są pomijane |
| `quote`, `source_id` w fakcie | Dosłowny fragment i powiązanie z ewidencją źródeł |
| `sources` | Tytuł, rodzaj odczytu, strona, hash tekstu; dla pliku jego id, nazwa i SHA-256 |
| `totals`, `difference`, `comparison_reasons` | Kontrolowane grupy sald i powód odmowy porównania; brak dowodu blokuje eksport sum |
| `approved_drafts` | Tylko zatwierdzenia dotyczące bieżącej wersji danych; hash treści i osoba przeglądająca |
| `payload_sha256` | SHA-256 UTF-8 `JSON.stringify(payload)` bez tego pola; kontrola zmiany treści, **nie podpis kryptograficzny** |

Pakiet może zawierać dane osobowe i finansowe. Dostępne pobranie nie uprawnia do przekazania go dowolnemu odbiorcy. W repozytorium są tylko syntetyczne przykłady; nie publikować eksportów rzeczywistych spraw.

Przegląd OCR dodaje do `sources` opcjonalne `page_review`: status, konto, czas i hashe tekstu oraz oryginału. Blokady `ocr_page_requires_review`, `ocr_page_rejected`, `superseded_source` i `claim_source_requires_review` oznaczają konieczność ponownego sprawdzenia źródła. Zależne wartości, sumy i zatwierdzenia są pomijane. Korekta strony nie zmienia historycznego cytatu; tworzy nowe źródło. [Obsługa przeglądu](PRZEGLAD-OCR.md).

Przykładowy importer powinien wymagać właściwego schematu, zachować `synthetic`, blokady i braki, sprawdzić wersję sprawy oraz hash i stosować klucz idempotencji `(case_id, data_revision, payload_sha256)`. Przy blokadach można importować zgłoszenie do kolejki przeglądu, ale nie zmieniać go w kompletny spis wierzytelności ani gotowe pismo. Potwierdzenie w CaseCheck dotyczy odczytu; nie oznacza uznania długu.

Nie wdrożono odbiornika, webhooka ani bezpośredniego połączenia do LegalFlow. Po wyborze docelowego CRM trzeba uzgodnić mapowanie pól, uwierzytelnienie, odbiorcę, retencję, obsługę błędów i audyt transmisji. Format JSON jest punktem startowym dla takiej integracji.
