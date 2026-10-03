// Requires the bundled Presentations runtime. No product or AI credentials are used.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const { RUNTIME_NODE_MODULES, PRESENTATIONS_SKILL_DIR, RUNTIME_PYTHON } = process.env;
if (![RUNTIME_NODE_MODULES, PRESENTATIONS_SKILL_DIR, RUNTIME_PYTHON].every(v => v && path.isAbsolute(v))) throw Error('Set the three absolute presentation runtime paths.');
const runtime = createRequire(path.join(RUNTIME_NODE_MODULES, '__presentation__.cjs'));
const { Presentation, PresentationFile, FileBlob } = await import(pathToFileURL(runtime.resolve('@oai/artifact-tool')).href);
const { resolvePresentationFont, finalizePresentation } = await import(pathToFileURL(path.join(PRESENTATIONS_SKILL_DIR, 'container_tools/artifact_tool_utils.mjs')).href);
const build = path.join(root, 'reports/local/presentation');
const out = path.join(root, 'output/presentation');
await fs.mkdir(build, { recursive: true }); await fs.mkdir(out, { recursive: true });
const font = resolvePresentationFont(), p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const C = { bg: '#F7F6F1', ink: '#183C39', accent: '#BA582F', muted: '#586D68', pale: '#E7ECE8', white: '#FFFFFF' };
const slides = [], tableOwners = [];
const repo = 'https://github.com/krapcys1-maker/casecheck';
function text(s, value, x, y, w, h, size = 28, color = C.ink, bold = false) {
  const box = s.shapes.add({ geometry: 'textbox', position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { fill: 'none', width: 0 } });
  box.text = value; box.text.style = { typeface: font, fontSize: size, color, bold, autoFit: 'none', verticalAlignment: 'top' }; return box;
}
function slide(title, notes = '', dark = false) {
  const s = p.slides.add(); slides.push(s); s.background.fill = dark ? C.ink : C.bg;
  if (title) text(s, title, 66, 45, 1148, 75, 44, dark ? C.white : C.ink, true);
  text(s, 'CaseCheck   /   3 października 2026', 66, 675, 1010, 24, 16, dark ? '#CDDAD5' : C.muted);
  text(s, String(slides.length).padStart(2, '0'), 1160, 675, 54, 24, 16, dark ? '#CDDAD5' : C.muted);
  s.speakerNotes.textFrame.setText(notes); return s;
}
function blocks(s, rows, { x = 66, y = 160, w = 1148, step = 112, size = 27 } = {}) {
  rows.forEach(([head, body], i) => { text(s, head, x, y + i * step, w, 38, size + 2, C.ink, true); text(s, body, x, y + 40 + i * step, w, step - 46, size, C.muted); });
}
async function picture(s, file, x, y, w, h, alt) {
  const blob = await fs.readFile(path.join(root, file));
  s.images.add({ blob, contentType: /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png', alt, fit: 'contain', position: { left: x, top: y, width: w, height: h } });
}
function table(s, values, widths, { y = 155, height = 455, fontSize = 25 } = {}) {
  const t = s.tables.add({ rows: values.length, columns: values[0].length, left: 66, top: y, width: 1148, height, columnWidths: widths, values });
  t.borders.assign({ fill: '#D6DFD9', width: 1, style: 'solid' });
  t.cells.block({ row: 0, column: 0, rowCount: values.length, columnCount: values[0].length }).assign({
    fill: C.bg, textStyle: { typeface: font, fontSize, color: C.ink }, margins: { left: 14, right: 14, top: 12, bottom: 12 }, anchor: 'center' });
  t.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: values[0].length }).assign({ fill: C.ink, textStyle: { typeface: font, fontSize, bold: true, color: C.white } });
  tableOwners.push(slides.length); return t;
}
const local = file => `Źródło: ${repo}/blob/main/${file}. Stan funkcji: 3.10.2026. Wszystkie przykłady i zrzuty dotyczą fikcyjnych danych.`;

let s = slide('', local('docs/STATUS-PROJEKTU.md'), true);
text(s, 'CaseCheck', 66, 170, 1148, 105, 88, C.white, true);
text(s, 'Przyjęcie i przegląd sprawy\nz kontrolą źródeł', 70, 298, 1080, 125, 44, '#CDDAD5');
text(s, 'Działanie produktu, porównanie z LegalFlow\ni propozycja współpracy freelance', 70, 502, 1070, 85, 28, '#CDDAD5');

s = slide('Obieg sprawy', local('docs/OBSLUGA.md'));
blocks(s, [
  ['01   Klient i dokumenty', 'Wywiad konsumencki lub firmowy, wiadomości i załączniki.'],
  ['02   Odczyt i przegląd', 'Reguły lokalne oraz API, cytaty, strony, korekty i kontrola sald.'],
  ['03   Pisma i współpraca', 'Wzory, zatwierdzona wersja, PDF/Word oraz portal klienta.'],
  ['04   Dalsza praca', 'Zadania, historia, eksport JSON i zamknięcie sprawy.']
], { step: 116 });

s = slide('Przykład: różnica 10 000 zł', local('docs/DEMO.md'));
text(s, 'Deklaracja klienta: 120 000 zł. Dokumenty: 110 000 zł.', 66, 131, 1148, 46, 28);
await picture(s, 'docs/images/podsumowanie-S01.png', 165, 189, 950, 451, 'Podsumowanie fikcyjnej sprawy S01');

s = slide('Wywiad i kartoteka', local('docs/OBSLUGA.md'));
blocks(s, [
  ['Dwie ścieżki sprawy', 'Konsument i firma mają właściwe pytania oraz pola danych.'],
  ['Rozmowa z kontrolą braków', 'Kolejne pytanie dotyczy brakującej informacji. Zapis może działać bez AI.'],
  ['Przekazanie człowiekowi', 'Klient może poprosić o kontakt. Zespół zachowuje historię rozmowy.'],
  ['Kartoteka zespołu', 'Filtry, etap sprawy, braki, odczyty do przeglądu i otwarte zadania.']
]);

s = slide('Dokument i odczyt OCR', local('docs/PRZEGLAD-OCR.md'));
text(s, 'PDF, TXT i obrazy. Oryginał, transkrypcja oraz korekta każdej strony.', 66, 130, 1148, 44, 27);
await picture(s, 'docs/images/ocr-review-test.png', 138, 187, 1004, 448, 'Ręczny przegląd oryginału i strony OCR');

s = slide('Gdzie pracuje AI i gdzie trafiają dane', local('docs/ARCHITEKTURA.md'));
table(s, [
  ['Czynność', 'Miejsce przetwarzania', 'Kontrola'],
  ['Zapis, tekst PDF/TXT, reguły pól', 'Własny serwer', 'Baza SQLite i oryginały plików'],
  ['Odczyt informacji przez model', 'DeepSeek, Anthropic lub OpenAI API', 'Wybrane źródła i zgoda w sprawie'],
  ['OCR skanu', 'OpenAI API', 'Cały wskazany plik, jawny zakres'],
  ['Przegląd i zatwierdzenie', 'Panel zespołu', 'Cytat, typ pola, wersja danych']
], [320, 400, 428], { fontSize: 24 });
text(s, 'Własny hosting nie oznacza, że treść pozostaje wyłącznie na serwerze.', 66, 622, 1148, 42, 24, C.accent);

s = slide('Roszczenia i kontrola sald', local('docs/OBSLUGA.md'));
blocks(s, [
  ['Dane z dokumentu', 'Wierzyciel, umowa, kwoty, daty, zabezpieczenie i stanowisko o sporze.'],
  ['Porównywalne kwoty', 'Osobne sumy dla waluty i daty salda. Szacunki pozostają szacunkami.'],
  ['Cesja i możliwe duplikaty', 'Zespół porównuje źródła i wiąże dokumenty dotyczące jednego długu.'],
  ['Jawne braki', 'Nieznana informacja nie staje się potwierdzonym faktem. Odrzucone pozycje wypadają z sum.']
]);

s = slide('Korekty zachowują spójność danych', local('docs/RECZNE-TESTY-KOREKT.md'));
blocks(s, [
  ['Nowy wierzyciel', 'Poprzedni adres wymaga ponownego ustalenia.'],
  ['Zmiana sporu lub zabezpieczenia', 'Zależny opis albo data wraca do przeglądu.'],
  ['Wycofanie wartości', 'Ręczne „nieznane” usuwa ją z bieżących danych, zachowując historię.']
], { w: 570, step: 145, size: 26 });
await picture(s, 'docs/images/korekty-zaleznosci-test.png', 682, 146, 532, 492, 'Fikcyjna sprawa po zmianie wierzyciela, sporu i zabezpieczenia');

s = slide('Pięć wzorów i wzory kancelarii', local('legal/templates.json') + '\n' + local('src/app/firm-templates.mjs'));
text(s, 'Wzory pomocnicze', 66, 150, 610, 42, 30, C.ink, true);
text(s, 'Karta przyjęcia sprawy\nWykaz wierzycieli i zobowiązań\nProśba o uzupełnienie materiałów\nProśba o wyjaśnienie roszczenia\nSzkic wstępnego planu firmy', 66, 216, 635, 344, 30);
text(s, 'Własny wzór', 760, 150, 454, 42, 30, C.ink, true);
text(s, 'Edytor sekcji i pól\nHistoria wersji\nAkceptacja konkretnej wersji\nPotwierdzone dane i źródła\nBlokada wymaganych braków', 760, 216, 454, 344, 29);
text(s, 'Import dowolnego pliku Word jako wzoru pozostaje do zbudowania.', 66, 614, 1148, 40, 24, C.accent);

s = slide('Pismo, PDF i edytowalny Word', local('docs/RECZNE-TESTY-KOREKT.md'));
blocks(s, [
  ['Przeczytanie i edycja', 'Zmiana treści cofa zatwierdzenie i oznacza ręczny wkład.'],
  ['Akceptacja wersji', 'Zatwierdzenie dotyczy określonych danych oraz treści.'],
  ['Eksport', 'PDF zachowuje zatwierdzoną wersję. Word można dalej edytować.']
], { w: 650, step: 143, size: 27 });
await picture(s, 'docs/images/pismo-po-korekcie.png', 790, 144, 424, 502, 'Zatwierdzony PDF fikcyjnego pisma po korekcie adresata');

s = slide('Portal klienta', local('docs/RECZNY-PRZEGLAD-PORTALU.md'));
blocks(s, [
  ['Jedna sprawa pod linkiem', 'Status, rozmowa i dostępne pliki klienta.'],
  ['Prośby o uzupełnienie', 'Odpowiedź z dokumentem, ponowienie lub przyjęcie przez zespół.'],
  ['Zatwierdzone pisma', 'Klient pobiera aktualną wersję PDF. Odczyt ma potwierdzenie.']
], { w: 596, step: 141, size: 27 });
await picture(s, 'docs/images/portal-klienta-test.png', 706, 138, 508, 508, 'Portal klienta na fikcyjnej sprawie S01');

s = slide('Role i uprawnienia', local('src/app/store.mjs') + '\n' + local('docs/OBSLUGA.md'));
table(s, [
  ['Rola', 'Dostęp i odpowiedzialność'],
  ['Klient', 'Własna sprawa, wiadomości, udostępnione materiały i odpowiedzi.'],
  ['Pracownik', 'Przygotowanie sprawy, korekty, zadania i projekty.'],
  ['Prawnik', 'Przegląd, akceptacja pism, eksport sprawdzonych danych i terminy prawne.'],
  ['Administrator', 'Konta, aktywność użytkowników i wersja wiedzy. Sama rola nie zatwierdza pism.']
], [250, 898], { fontSize: 26 });
text(s, 'Sprawy kancelarii są rozdzielone. Zespół może wycofać link klienta.', 66, 625, 1148, 36, 24, C.muted);

s = slide('Zadania, rejestry i przekazanie danych', local('docs/INTEGRACJA.md') + '\n' + local('docs/OBSLUGA.md'));
blocks(s, [
  ['Zadania i odpowiedzialność', 'Osoba prowadząca, data i wykonanie. Termin prawny wymaga podstawy oraz potwierdzenia.'],
  ['Zapytania do KRS i wykazu VAT', 'Adaptery odczytu danych rejestrowych. Dostępność zależy od usługi publicznej.'],
  ['Pakiet JSON po przeglądzie', 'Potwierdzone wartości, cytaty, hashe plików, braki i blokady.'],
  ['Przygotowanie do integracji', 'Eksport można podłączyć do systemu kancelarii. Gotowy adapter CRM pozostaje do wykonania.']
], { size: 26 });

s = slide('Odzyskanie opłaconego wyniku', local('docs/ODZYSKIWANIE-WYNIKOW.md'));
text(s, 'Po awarii zapisu zespół odzyskuje wynik bez ponownego wywołania API.', 66, 128, 1148, 46, 27);
await picture(s, 'docs/images/odzyskany-wynik-test.jpg', 280, 192, 720, 432, 'Odzyskany wynik w Historii fikcyjnej sprawy');
text(s, 'Historia, ochrona nowszych korekt, kopia i odtworzenie stanu.', 66, 630, 1148, 38, 24, C.muted);

s = slide('Błędy znalezione i naprawione', local('docs/RECZNE-TESTY-KOREKT.md'));
table(s, [
  ['Próba', 'Błąd przed poprawką', 'Wynik ponowienia'],
  ['Wycofanie adresu', 'Stara wartość nadal aktywna', 'Jawny brak, historia zachowana'],
  ['Zmiana wierzyciela', 'Nowa nazwa i stary adres', 'Adres do ponownego ustalenia'],
  ['Pusta edycja pisma', 'Możliwe zatwierdzenie', 'Odrzucenie, zachowana treść'],
  ['Błąd formularza', 'Komunikat poza widokiem', 'Widoczny błąd bez utraty wpisu']
], [275, 422, 451], { fontSize: 25 });
text(s, 'Powtórzenia w interfejsie, po restarcie oraz w końcowych PDF i DOCX.', 66, 625, 1148, 40, 24, C.muted);

s = slide('Co potwierdzają próby', local('docs/TESTY.md') + '\n' + local('docs/correction-review-2026-10-03.json'));
blocks(s, [
  ['121 / 121 testów kodu', 'Granice danych, uprawnienia, awarie, wersje i regresje. Bez płatnych wywołań.'],
  ['6 / 6 scenariuszy HTTP', 'Ostatnie powtórzenie wykorzystało zapisane wyniki API, bez nowych wywołań.'],
  ['200 krótkich tekstów syntetycznych', 'Historyczne porównanie 1 400 pól. Trzy braki po błędnym JSON. Zestaw służył także rozwojowi reguł.'],
  ['Ręczny przegląd wyników', 'Agent przeczytał wskazane wyniki i eksporty. Ocena niezależnego prawnika pozostaje do wykonania.']
], { size: 26 });

const competitor = 'LegalFlow: deklaracje z oficjalnej strony https://restrukturyzacja.boosterai.pl/ odczytanej 3.10.2026. Bez dostępu do panelu i pomiaru skuteczności. CaseCheck: ' + repo + '/blob/main/docs/POROWNANIE-LEGALFLOW.md';
s = slide('Porównanie zakresu obsługi', competitor);
table(s, [
  ['Obszar', 'LegalFlow: oferta producenta', 'CaseCheck: stan aplikacji'],
  ['Sprawa', 'Cykl od leada do archiwizacji', 'Przyjęcie, przegląd, pisma, zadania'],
  ['Portal', 'Współpraca, pliki, powiadomienia', 'Współpraca i pliki, bez powiadomień zewnętrznych'],
  ['Dokumenty', 'Własne wzory, Word/PDF, akceptacja', 'Pięć wzorów, własny edytor, Word/PDF'],
  ['Podpis', 'Podpis elektroniczny', 'Potwierdzenie odczytu, bez podpisu']
], [220, 445, 483], { fontSize: 24 });
text(s, 'Szersza oferta nie jest porównywalnym pomiarem jakości odczytu AI.', 66, 625, 1148, 36, 24, C.accent);

s = slide('Integracje i nieznane mechanizmy', competitor + '\nAudio: https://boosterai.pl/pl, 3.10.2026.');
table(s, [
  ['Obszar', 'LegalFlow: deklaracja', 'CaseCheck'],
  ['CRM i obieg', 'CRM, SharePoint, KSeF, poczta, SMS', 'KRS/VAT i JSON, reszta do budowy'],
  ['Należności kancelarii', 'Monitoring i monity', 'Brak modułu'],
  ['Audio', 'Wywiad do projektu', 'Tekst, PDF, obrazy'],
  ['KRZ', 'W przygotowaniu', 'Brak integracji'],
  ['Jakość i infrastruktura', 'Szczegóły testów i modeli nieznane', 'Jawne próby i błędy, zewnętrzne API']
], [255, 426, 467], { fontSize: 23, height: 478 });

s = slide('Gdzie warto poprawić CaseCheck', local('docs/AUDYT.md'));
blocks(s, [
  ['Najpierw jakość na nowych aktach', 'Osobny zestaw z kancelarią, ocena źródeł i znaczenia, pomiar czasu korekt.'],
  ['Następnie jedna integracja', 'Wybrany CRM, potwierdzenie dostarczenia i odporność na duplikaty.'],
  ['Rozszerzenie wejścia i dokumentów', 'Audio, import wzorów Word i dłuższy wywiad z potwierdzanym podsumowaniem.'],
  ['Warunki obsługi rzeczywistych spraw', 'Niezależny przegląd, MFA/SSO, procedury danych i test docelowego wdrożenia.']
], { size: 26 });

s = slide('Propozycja współpracy freelance', local('docs/ROZMOWA-BOOSTER.md'));
text(s, 'Moduł przeglądu dokumentów\ni kontroli jakości danych', 66, 155, 1148, 127, 46, C.ink, true);
blocks(s, [
  ['Zakres pierwszego zlecenia', 'Jeden typ dokumentu, pola uzgodnione z zespołem i przekazanie wyniku do ich systemu.'],
  ['Warunek odbioru', 'Wspólny zestaw przypadków, lista błędów, czas przeglądu oraz koszt API.'],
  ['Materiał do rozmowy', 'Działający kod, pokaz źródeł i korekt, raport napraw oraz powtarzalny scenariusz.']
], { y: 325, step: 102, size: 25 });

s = slide('Utrzymanie i granice produktu', local('docs/STATUS-PROJEKTU.md') + '\n' + local('deploy/APP.md'));
table(s, [
  ['Dostępne', 'Do dalszego rozwoju lub weryfikacji'],
  ['Własny serwer, SQLite, prywatne klucze', 'Warunki dostawców API i procedury kancelarii'],
  ['Kopie, odtworzenie, audyt zmian, hashe', 'Niezależne badanie bezpieczeństwa i obciążenia'],
  ['Zgoda na API i trwały limit liczby wywołań', 'Limit kosztu w pieniądzu i monitoring produkcyjny'],
  ['GitHub i testy na Node 22/24', 'Aktualizacja najnowszej wersji na VPS'],
  ['Wzory pomocnicze i dane ze źródeł sprawy', 'Wyszukiwarka prawa, pełne postępowanie, e-podpis']
], [558, 590], { fontSize: 24, height: 480 });

s = slide('Kod, instrukcja i dowody', 'Źródła z datą dostępu 3.10.2026. Oficjalna oferta konkurenta nie zastępuje audytu produktu. ' + repo);
blocks(s, [
  ['GitHub', 'github.com/krapcys1-maker/casecheck'],
  ['Instrukcja i ręczne wyniki', 'docs/OBSLUGA.md   oraz   docs/RECZNE-TESTY-KOREKT.md'],
  ['Zakres porównania', 'docs/POROWNANIE-LEGALFLOW.md\nŹródła: restrukturyzacja.boosterai.pl, boosterai.pl/pl'],
  ['Stan prezentacji', '3 października 2026. Przykłady fikcyjne. Projekt rozwijany z pomocą AI.']
], { step: 113, size: 27 });

const candidate = path.join(build, 'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
const finalPath = path.join(out, process.env.DECK_FILENAME || 'casecheck-funkcje-porownanie.pptx');
await finalizePresentation({ workspaceDir: root, candidatePath: candidate, finalPath,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(PRESENTATIONS_SKILL_DIR, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(PRESENTATIONS_SKILL_DIR, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit', ...tableOwners.flatMap(n => ['--require-native-table-slide', String(n)])],
  requiredNativeTableOwnerSlides: tableOwners, fontPolicy: { basis: 'design', families: [font] },
  verifyArtifactToolImport: true, receiptPath: path.join(build, path.basename(finalPath) + '.validation.json') });
const imported = await PresentationFile.importPptx(await FileBlob.load(finalPath));
for (let i = 0; i < slides.length; i++) {
  const preview = await imported.export({ slide: imported.slides.getItem(i), format: 'png', scale: 1.25 });
  await fs.writeFile(path.join(build, `slide-${String(i + 1).padStart(2, '0')}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({ finalPath, slides: slides.length, font, tableOwners }));
