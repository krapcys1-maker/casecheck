"""Build the shareable project brief. Requires ReportLab; no credentials or state DB are read."""
from pathlib import Path
import argparse
import json
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--font-dir', type=Path)
args = parser.parse_args()
font_dirs = [p for p in [args.font_dir, Path('C:/Windows/Fonts'), Path('/usr/share/fonts/truetype/dejavu'), ROOT / 'assets'] if p]

def font(name, fallback='DejaVuSans.ttf'):
    for directory in font_dirs:
        candidate = directory / name
        if candidate.exists():
            return candidate
    return ROOT / 'assets' / fallback

for label, filename in [('Body', 'DejaVuSans.ttf'), ('Bold', 'DejaVuSans-Bold.ttf'), ('Title', 'DejaVuSerif.ttf')]:
    pdfmetrics.registerFont(TTFont(label, str(font(filename))))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Bold', italic='Body', boldItalic='Bold')
INK = colors.HexColor('#233e34')
MUTED = colors.HexColor('#657260')
LINE = colors.HexColor('#d7ddcf')
PALE = colors.HexColor('#eef2e7')
PAPER = colors.HexColor('#fffefb')
styles = {
    'kicker': ParagraphStyle('kicker', fontName='Bold', fontSize=8, leading=12, textColor=MUTED, spaceAfter=13),
    'title': ParagraphStyle('title', fontName='Title', fontSize=31, leading=36, textColor=INK, spaceAfter=16),
    'body': ParagraphStyle('body', fontName='Body', fontSize=10, leading=16, textColor=INK, spaceAfter=10),
    'small': ParagraphStyle('small', fontName='Body', fontSize=8, leading=12, textColor=MUTED, spaceAfter=8),
    'h2': ParagraphStyle('h2', fontName='Title', fontSize=18, leading=24, textColor=INK, spaceBefore=12, spaceAfter=9),
    'cell': ParagraphStyle('cell', fontName='Body', fontSize=8.5, leading=13, textColor=INK),
    'num': ParagraphStyle('num', fontName='Title', fontSize=25, leading=32, textColor=INK),
}
def p(text, style='body'):
    return Paragraph(text, styles[style])
def table(rows, widths, header=False):
    data = [[p(cell, 'cell') for cell in row] for row in rows]
    result = Table(data, colWidths=widths, hAlign='LEFT')
    rules = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 11),
             ('RIGHTPADDING', (0, 0), (-1, -1), 11), ('TOPPADDING', (0, 0), (-1, -1), 10),
             ('BOTTOMPADDING', (0, 0), (-1, -1), 10), ('LINEBELOW', (0, 0), (-1, -1), .4, LINE)]
    if header:
        rules.append(('BACKGROUND', (0, 0), (-1, 0), PALE))
    result.setStyle(TableStyle(rules))
    return result

output = ROOT / 'output/pdf/casecheck-portfolio.pdf'
output.parent.mkdir(parents=True, exist_ok=True)
evidence = json.loads((ROOT / 'docs/test-results-2026-10-03.json').read_text(encoding='utf-8'))
width = A4[0] - 88

def page_frame(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFillColor(INK)
    canvas.setFont('Title', 16)
    canvas.drawString(44, A4[1] - 35, 'CaseCheck')
    canvas.setFillColor(MUTED)
    canvas.setFont('Body', 7)
    canvas.drawRightString(A4[0] - 44, A4[1] - 32, 'PROJEKT PORTFOLIO / 03.10.2026')
    canvas.setStrokeColor(LINE)
    canvas.line(44, A4[1] - 48, A4[0] - 44, A4[1] - 48)
    canvas.line(44, 39, A4[0] - 44, 39)
    canvas.setFont('Body', 7)
    canvas.drawString(44, 25, 'Dane fikcyjne. Projekt rozwijany z pomocą AI. Przegląd testowy: symulacja AI.')
    canvas.drawRightString(A4[0] - 44, 25, f'{doc.page} / 3')
    canvas.restoreState()

story = [p('PROBLEM BIZNESOWY / DZIAŁAJĄCY PRZEPŁYW', 'kicker'),
         p('Od dokumentów<br/>do uporządkowanej sprawy.', 'title'),
         p('CaseCheck łączy wywiad, załączniki i zobowiązania w materiale do przeglądu. Każda wartość prowadzi do źródła; kolejna osoba widzi braki, rozbieżności i zadania.'), Spacer(1, 9)]
metrics = Table([[p('120 000', 'num'), p('110 000', 'num'), p('10 000', 'num')],
                 [p('PLN / deklaracja klienta', 'small'), p('PLN / trzy dokumenty', 'small'), p('PLN / do wyjaśnienia', 'small')]], colWidths=[width / 3] * 3)
metrics.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), PALE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                            ('LEFTPADDING', (0, 0), (-1, -1), 15), ('TOPPADDING', (0, 0), (-1, 0), 14),
                            ('BOTTOMPADDING', (0, 1), (-1, 1), 10)]))
story += [metrics, Spacer(1, 10), p('Scenariusz S01. Wszystkie kwoty w PLN, saldo 30.09.2026. Różnica nie rozstrzyga, która informacja jest prawdziwa.', 'small'), Spacer(1, 7)]
image = Image(str(ROOT / 'docs/images/podsumowanie-S01.png'))
image.drawHeight *= width / image.drawWidth
image.drawWidth = width
story += [image, Spacer(1, 8), p('Rzeczywisty widok wdrożonego panelu na fikcyjnych danych: źródła, stan przeglądu i następne kroki. Dostęp do demo wymaga konta.', 'small'),
          p('Wartość do sprawdzenia w pilotażu', 'h2'),
          p('Mniej przepisywania i prostsze przekazanie sprawy między osobami. Czas przygotowania, czas przeglądu i odsetek korekt trzeba zmierzyć na porównywalnych sprawach; projekt nie deklaruje uzyskanego procentu oszczędności.')]

story += [PageBreak(), p('ARCHITEKTURA / WERYFIKOWALNE DECYZJE', 'kicker'),
          p('Jeden proces.<br/>Kontrola na każdym etapie.', 'title')]
story.append(table([['<b>01 / Źródło</b>', '<b>02 / Odczyt</b>', '<b>03 / Przegląd</b>', '<b>04 / Projekt</b>'],
                    ['Wiadomość, PDF lub skan. Strona i oryginał.', 'Wybrane API. Cytat, typ, kwota i data.', 'Korekta ze źródłem. Role i historia.', 'Wzór, wersja danych, zatwierdzenie i PDF.']], [width / 4] * 4, True))
story += [Spacer(1, 11), p('Dlaczego to działa przewidywalnie', 'h2'),
          p('<b>Wersje danych i pracy są osobne.</b> Nowa informacja unieważnia pismo. Dodanie zadania zachowuje jego przegląd. Spóźniony wynik AI po korekcie zostaje odrzucony.'),
          p('<b>Kwota ma walutę i datę.</b> Grosze są liczbą całkowitą. Dokumenty tej samej umowy pozostają poza sumą, aż przeglądający wybierze właściwe saldo. Nieznane zabezpieczenie pozostaje nieznane.'),
          p('<b>Źródło jest sprawdzalne.</b> Serwer odrzuca obcy lub zmyślony cytat. Poprawny cytat nie dowodzi poprawnej interpretacji: w próbie S04 potrzebna była korekta poprzedniego wierzyciela.'),
          p(f'{evidence["offline"]["tests"]} testów automatycznych + 3 nowe odczyty API', 'h2')]
story.append(table([['<b>Próba</b>', '<b>Sprawdzony rezultat</b>'],
                    ['Rozbieżność', '120 000 - 110 000 = 10 000 PLN.'],
                    ['Cesja', 'Dwa źródła i jedno saldo po ręcznym powiązaniu.'],
                    ['Spór', 'Kwota 19 000 PLN i spór jako osobne informacje.'],
                    ['Waluty, daty i braki', 'Oddzielne grupy sald; unknown nie zmienia się w „nie”.']], [140, width - 140], True))
story += [Spacer(1, 8), p('Pięć pełnych scenariuszy HTTP korzysta z deterministycznego adaptera, bez płatnego API. Osobno wykonano trzy nowe odczyty rzeczywistego OpenAI na fikcyjnych dokumentach S02/S04. To dowód przepływu i wybranych kontroli, bez certyfikacji trafności modeli.', 'small'),
          p('Stos i wdrożenie', 'h2'), p('Node.js / JavaScript ESM / SQLite / HTML-CSS-JS / PDF.js / PDFKit. VPS, HTTPS i systemd użytkownika. Role i izolacja kancelarii, link do jednej sprawy, prywatne pliki oraz spójna kopia z kontrolą 46 załączników.', 'small')]

story += [PageBreak(), p('ROZMOWA / DEMONSTRACJA / NASTĘPNY KROK', 'kicker'),
          p('Gotowe demo.<br/>Konkretny następny krok.', 'title'),
          p('Projekt pokazuje przejście od problemu biznesowego przez model danych i integrację AI do testów oraz wdrożenia. Rozmowę można oprzeć na działającym przepływie i decyzjach w kodzie.')]
story.append(table([['<b>Pokaz w 8 minut</b>', '<b>Co warto ocenić</b>'],
                    ['S01 / źródła i różnica', 'Porównanie deklaracji z dokumentami, zadanie, aktualne pismo.'],
                    ['S02 / cesja', 'Ochrona przed podwójną sumą. Decyzja o właściwym saldzie.'],
                    ['S04 / spór', 'Rozdzielenie odczytu, stanowiska klienta i korekty interpretacji.'],
                    ['Kod / testy / pilotaż', 'Wersje, wyścig korekty z AI, dostęp i plan mierzenia wartości.']], [160, width - 160], True))
story += [p('Propozycja pilotażu z zespołem', 'h2'),
          p('<b>1.</b> Wybrać jeden etap i zatwierdzić pytania, wzory oraz zakres danych.<br/><b>2.</b> Przygotować odrębny zestaw walidacyjny z opisem oczekiwań przez prawnika.<br/><b>3.</b> Zmierzyć czas, błędy kwot/dat, korekty i koszt API.<br/><b>4.</b> Rozwijać integracje CRM i dokumentów według wykazanego efektu.'),
          p('Zakres projektu', 'h2'),
          p('Działający pilotaż przyjęcia i przeglądu. Pięć wzorów pomocniczych, trzy API ekstrakcji, OCR oraz KRS/VAT. Kolejny etap to niezależny przegląd prawny, zasady przetwarzania i retencji oraz próba na legalnie pozyskanym zestawie.', 'small'),
          p('Automatyczne wysyłki, KRZ, składanie wniosków i kalkulator terminów procesowych pozostają poza obecną implementacją. Symulacja roli prawnika została wykonana przez agenta AI. CaseCheck jest samodzielnym projektem portfolio; nie deklaruje współpracy z LegalFlow.', 'small'),
          p('Otwórz kod i działający panel', 'h2'),
          p('<link href="https://github.com/krapcys1-maker/casecheck" color="#233e34"><b>github.com/krapcys1-maker/casecheck</b></link><br/><link href="https://astrologiapoludzku.com/casecheck/" color="#233e34">astrologiapoludzku.com/casecheck/</link>', 'body'),
          p('Repozytorium zawiera instrukcję, faktyczną architekturę, scenariusz prezentacji i wyniki testów. Panel na tymczasowej ścieżce HTTPS wymaga konta; strona główna pozostaje dostępna.', 'small'),
          p('Kontekst rozmowy: <link href="https://restrukturyzacja.boosterai.pl/">publiczna strona LegalFlow</link> (sprawdzona 03.10.2026 czasu lokalnego). Odniesienie dotyczy opisanego procesu komunikacji, dokumentów i audytu; produktu produkcyjnego nie audytowano.', 'small')]

doc = SimpleDocTemplate(str(output), pagesize=A4, rightMargin=44, leftMargin=44, topMargin=69, bottomMargin=56,
                        title='CaseCheck - projekt portfolio', author='CaseCheck project', subject='Przyjęcie i przegląd sprawy; działający pilotaż na fikcyjnych danych')
doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
print(output)
