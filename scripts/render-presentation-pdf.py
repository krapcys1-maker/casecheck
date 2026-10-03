"""Create a visual PDF copy of the inspected PPTX slide renders.

The editable source is the PPTX. This companion PDF embeds the rendered pages.
Use the bundled Python runtime with reportlab and Pillow.
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

root = Path(__file__).resolve().parent.parent
slides = sorted((root / 'reports/local/presentation').glob('slide-*.png'))
assert len(slides) == 22, f'Expected 22 rendered slides, received {len(slides)}'
output = root / 'output/presentation/casecheck-funkcje-porownanie.pdf'
pdf = canvas.Canvas(str(output), pagesize=(960, 540), pageCompression=1)
pdf.setTitle('CaseCheck: funkcje, porównanie z LegalFlow i współpraca freelance')
pdf.setAuthor('CaseCheck')
for slide in slides:
    with Image.open(slide) as image:
        assert image.width / image.height == 16 / 9
        pdf.drawImage(ImageReader(image), 0, 0, width=960, height=540)
    pdf.showPage()
pdf.save()
print(output)
