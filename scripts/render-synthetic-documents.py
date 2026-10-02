"""Generate visibly synthetic legal-workflow input PDFs using the bundled Python runtime."""
import json
import hashlib
import html
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from PIL import Image
from reportlab.pdfgen import canvas
from pypdf import PdfReader
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies'
FONT = RUNTIME/'native/poppler/Library/share/fonts/DejaVuSans.ttf'
POPPLER = RUNTIME/'native/poppler/Library/bin/pdftoppm.exe'
OUTPUT = ROOT/'tests/full-fixtures'
DATA = json.loads((OUTPUT/'cases.json').read_text(encoding='utf-8'))
pdfmetrics.registerFont(TTFont('CaseCheckSans',str(FONT)))
body = ParagraphStyle('body',fontName='CaseCheckSans',fontSize=10.5,leading=16,spaceAfter=12,alignment=TA_LEFT)
title = ParagraphStyle('title',parent=body,fontSize=15,leading=21,spaceAfter=22)
label = ParagraphStyle('label',parent=body,fontSize=8,leading=12,textColor=HexColor('#7a3737'),spaceAfter=18)

def footer(canv,doc):
    canv.setFont('CaseCheckSans',7)
    canv.setFillColor(HexColor('#777777'))
    canv.drawString(42,30,'CaseCheck - dane fikcyjne do testów - nie do wysyłki')
    canv.drawRightString(A4[0]-42,30,str(doc.page))

manifest=[]
for item in DATA['cases']:
    for document in item['documents']:
        path=OUTPUT/document['pdf_path']
        path.parent.mkdir(parents=True,exist_ok=True)
        story=[Paragraph('MATERIAŁ TESTOWY - WSZYSTKIE DANE SĄ FIKCYJNE',label),Paragraph(html.escape(document['title']),title)]
        for paragraph in document['paragraphs']:
            story.append(Paragraph(html.escape(paragraph),body))
        SimpleDocTemplate(str(path),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=45,bottomMargin=48,title=document['title'],author='CaseCheck synthetic fixtures').build(story,onFirstPage=footer,onLaterPages=footer)
        manifest.append({'case_id':item['id'],'document_id':document['id'],'path':document['pdf_path'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'kind':'text_pdf'})
        if 'scan_path' in document:
            preview=OUTPUT/'qa'/document['id']
            preview.parent.mkdir(parents=True,exist_ok=True)
            scan=OUTPUT/document['scan_path']
            page=canvas.Canvas(str(scan),pagesize=A4)
            for page_number in range(1,len(PdfReader(path).pages)+1):
                page_preview=Path(str(preview)+'-'+str(page_number))
                subprocess.run([str(POPPLER),'-r','120','-f',str(page_number),'-l',str(page_number),'-singlefile','-png',str(path),str(page_preview)],check=True,capture_output=True)
                image=Image.open(str(page_preview)+'.png').convert('L')
                image=image.rotate(0.65,resample=Image.Resampling.BICUBIC,expand=False,fillcolor=245)
                image_path=OUTPUT/document['image_path'] if page_number==1 else Path(str(page_preview)+'-scan.png')
                image.save(image_path)
                page.drawImage(str(image_path),0,0,width=A4[0],height=A4[1])
                page.showPage()
            page.save()
            manifest.append({'case_id':item['id'],'document_id':document['id'],'path':document['scan_path'],'sha256':hashlib.sha256(scan.read_bytes()).hexdigest(),'kind':'scanned_pdf'})
(OUTPUT/'manifest.json').write_text(json.dumps({'synthetic':True,'files':manifest},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'generated_pdfs':len(manifest),'case_count':len(DATA['cases'])}))
