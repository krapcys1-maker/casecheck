# Ręczne porównanie 200 materiałów — 3 października 2026

Agent przeczytał treść każdego z materiałów E001–E200 i porównał z siedmioma znormalizowanymi polami uzyskanymi z zapisanych odpowiedzi. To **200 krótkich, fikcyjnych tekstów, 40 szablonów po pięć wariantów**, nie 200 pełnych akt kancelarii. Przegląd nie jest opinią ani niezależną oceną prawnika.

Wartości kwot, walut, dat, numerów umów i nazw odpowiadały źródłom. Nie znaleziono dodatkowej błędnej znanej wartości poza wcześniej wykazanymi ograniczeniami. Zgodność z anotacjami: **1397/1400**, trzy braki w polu sporu. Bez nowych wywołań API.

| Zakres | Wniosek z przeczytanej treści |
|---|---|
| E001–E025 | Salda i grosze zgodne. Milczenie nie staje się brakiem sporu. Cesja rozdziela poprzednika od obecnego wierzyciela. E014 i E018 wymagają poprawienia pola sporu. |
| E026–E050 | Pełnomocnik nie został wierzycielem. Data pisma nie zastępuje daty salda; brak waluty blokuje kwotę. Przybliżenie i zero zachowane. |
| E051–E075 | Nie obliczono niepodanej sumy. Termin zapłaty nie został datą salda. Nieczytelne i sprzeczne kwoty pozostają nieznane; instrukcje osadzone w treści nie zmieniły wartości. |
| E076–E100 | Tabele i twarde spacje odczytane poprawnie. Nie odjęto drugi raz wpłaty. Jawne poręczenie zachowane; nie wymyślono poprzedniego wierzyciela. |
| E101–E125 | Odróżniono sprzedawcę od dłużnika, spór o odsetki od braku sporu i planowaną cesję od dokonanej. W łańcuchu cesji `original_creditor` oznacza bezpośredniego poprzednika, zgodnie z polem „Poprzedni wierzyciel”, nie pierwszego wierzyciela w historii. |
| E126–E150 | Serwiser i rachunek do wpłaty nie zastąpiły wierzyciela. Rozróżniono daty pisma, doręczenia, zapłaty i salda. Zachowano EUR/CHF/USD/GBP oraz znak nadpłaty. |
| E151–E175 | Przedział nie został jedną kwotą, opłata nie stała się całym długiem. Dwie umowy lub dwie waluty w jednym źródle nie zostały arbitralnie scalone. Wybrano jawnie aktualne saldo zamiast historycznego. |
| E176–E200 | Uwzględniono jawną korektę kwoty. Instrukcja w JSON nie zmieniła odczytu. Warunkowy przyszły spór pozostał nieustalony. Podwójna negacja wymaga poprawienia E193. „Brak zabezpieczeń” zachowano jako informację inną niż „brak danych”. |

## Trzy wyniki wymagające korekty

Surowe odpowiedzi E014, E018 i E193 zawierają dwa klucze `boolean_value` w tym samym obiekcie: najpierw `true`, następnie `null`. Po standardowym parsowaniu JSON ostatnia wartość daje niepoprawny wariant pola. Walidator pozostawia `unknown`, zachowuje cytat i ostrzeżenie. Nie wybrano arbitralnie jednej sprzecznej wartości ani nie zmieniono oczekiwań, żeby uzyskać 100%.

- **E014:** „Nie uznaję tego długu. Kwestionuję żądanie w całości.” Treść wskazuje spór w całości.
- **E018:** „Uznaję kapitał, ale kwestionuję odsetki oraz koszty.” Treść wskazuje spór częściowy; zakres musi pozostać osobno.
- **E193:** „Nie jest prawdą, że nie kwestionuję roszczenia. Kwestionuję całość.” Treść wskazuje spór w całości.

W aplikacji te wyniki wymagają ręcznej korekty lub ponownego odczytu, a nie uznania za bezsporne. Odtworzenie zachowuje te braki jako regresje. [Maszynowy rejestr źródeł i wyników](manual-review-200-2026-10-03.json) wiąże każde porównanie z hashami.

## Ograniczenia próby

Reguły rozwijano na tych danych, dlatego 1397/1400 nie jest prognozą skuteczności na nowych aktach. Materiały są krótkie i powtarzalne; nie badają długich umów, pisma ręcznego, wielostronicowych skanów ani poprawności kwalifikacji prawnej. Zestaw siedmiu pól nie obejmuje wszystkich pól aplikacji. Przypadki dwóch umów/walut pokazują zachowawcze pozostawienie braków, nie automatyczne rozdzielenie wielu roszczeń.

Odtworzenie można przygotować bez sieci poleceniem `node scripts/prepare-manual-review.mjs`. Skrypt zapisuje źródła, wyniki i porównania do `reports/local/manual-review`; **nie oznacza automatycznie, że ktoś je przeczytał**. Ten dokument opisuje wykonany osobno przegląd agenta.
