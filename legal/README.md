# Podstawy wzorów i zakres dokumentów

Źródła sprawdzono 2 października 2026 r. Rejestr adresów, dat stanu prawnego, hashy pobranych ustaw i późniejszych zmian znajduje się w [sources.json](sources.json). Pełne kopie ustaw pozostają w lokalnym katalogu researchu. Sam tekst jednolity nie dowodzi uwzględnienia późniejszych zmian; sprawdzono także powiązania bazowych ustaw w API ELI. Zmiany z datą wejścia w życie w 2027 lub 2028 r. nie są traktowane jako obowiązujące dziś.

## Konsument

Zakres wywiadu oparto na art. 491² ust. 4 Prawa upadłościowego, tekst jednolity Dz.U. 2026 poz. 913: dane identyfikacyjne, NIP posiadany w ostatnich 10 latach, miejsca i wykaz majątku z wyceną, okoliczności zgłoszenia, wierzyciele z adresami i terminami, zakres sporu, zabezpieczenia z datami, przychody i utrzymanie za 6 miesięcy oraz określone czynności z 12 miesięcy. Aktualny miesięczny dochód nie zastępuje historii sześciu miesięcy. Oświadczenia klienta nie składa model.

[Ustawa i aktualny tekst jednolity](https://api.sejm.gov.pl/eli/acts/DU/2026/913/text.pdf). [Formularz MS i poradnik](https://www.gov.pl/web/sprawiedliwosc/formularze-konsumenci-od-24-marca-2020) pozostają źródłami urzędowymi. Nasza karta i wykaz są materiałami pomocniczymi, nie urzędowym formularzem. Art. 491² ust. 3 i 216aa wymagają odrębnego ustalenia właściwego sposobu wniesienia; aplikacja nie wybiera automatycznie trybu papierowego i nie wysyła pisma do KRZ.

## Firma

Materiały przyjęcia sprawy obejmują dane przedsiębiorstwa, reprezentację, finanse, pracowników, majątek, zabezpieczenia, sporne roszczenia, przyczyny trudności i propozycje naprawcze. Szkic wstępnego planu odnosi się do art. 9 Prawa restrukturyzacyjnego; pełny plan wymaga szerszych elementów art. 10. Wykaz przyjęcia sprawy nie jest proceduralnym spisem wierzytelności z art. 76 i nast. ani testem zaspokojenia. Model nie kwalifikuje dłużnika do konkretnego postępowania.

[Prawo restrukturyzacyjne Dz.U. 2026 poz. 533](https://api.sejm.gov.pl/eli/acts/DU/2026/533/text.pdf).

## Pisma wejściowe

Fikcyjne wezwania zawierają strony, datę, umowę, saldo i jego składniki. Nie dopisano nieudokumentowanych opłat ani odsetek przyszłych. Zawiadomienie o cesji ma właściwie oznaczonego zbywcę i nabywcę; nie zakładamy nowego długu, ważności przelewu ani bezspornej wysokości salda. Podstawa rozróżnienia: art. 509 i 512 [Kodeksu cywilnego Dz.U. 2026 poz. 795](https://api.sejm.gov.pl/eli/acts/DU/2026/795/text.pdf).

## Projekty wyjściowe

Szablony `case_card`, `creditor_list`, `missing_documents`, `claim_clarification` i `preliminary_plan` są własnymi wzorami administracyjnymi. Uzupełniają je zapisane fakty z pochodzeniem; brak ma widoczne oznaczenie. Listy roszczeń rozróżniają spór, datę salda i walutę. Nie łączą walut bez kursu ani dokumentów bez rozstrzygnięcia powiązania.

Sprawdzenie źródeł i poprawny układ nie są opinią o zasadności konkretnego roszczenia. Wzory wymagają zatwierdzenia merytorycznego przez kancelarię przed użyciem w rzeczywistych sprawach. Każde zatwierdzenie w aplikacji dotyczy konkretnej wersji danych i dokumentu; zmiana danych wymaga ponownego przeglądu.
