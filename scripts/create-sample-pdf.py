from pathlib import Path
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Preformatted
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
out = root / 'output' / 'pdf' / 'stacks-and-queues.pdf'
out.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleCustom', fontName='Helvetica-Bold', fontSize=27, leading=32, textColor=colors.HexColor('#17233c'), spaceAfter=10))
styles.add(ParagraphStyle(name='LabelCustom', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=colors.HexColor('#586bd6'), spaceAfter=9))
styles.add(ParagraphStyle(name='BodyCustom', fontName='Helvetica', fontSize=10.5, leading=15, textColor=colors.HexColor('#34425b'), spaceAfter=9))
styles.add(ParagraphStyle(name='HeadingCustom', fontName='Helvetica-Bold', fontSize=13, leading=18, textColor=colors.HexColor('#17233c'), spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name='CellCustom', fontName='Helvetica', fontSize=9.5, leading=14, textColor=colors.HexColor('#34425b')))
styles.add(ParagraphStyle(name='CodeCustom', fontName='Courier', fontSize=9, leading=13, textColor=colors.HexColor('#23395b'), backColor=colors.HexColor('#f0f3fa'), borderPadding=10, spaceAfter=8))
P=lambda text: Paragraph(text, styles['BodyCustom'])
story=[Paragraph('COMPUTER SCIENCE / QUICK STUDY 01',styles['LabelCustom']), Paragraph('Stacks &amp; Queues',styles['TitleCustom']), P('Two linear data structures that differ in the order in which they remove elements. Both appear in algorithms, operating systems, and everyday software.')]
story += [Paragraph('1. Stack: last in, first out (LIFO)',styles['HeadingCustom']), P('A stack adds and removes elements at the <b>top</b>. <b>Push</b> adds an element, <b>pop</b> removes the most recently added element, and <b>peek</b> reads the top without removing it. Think of a pile of plates: the last plate placed on top is the first one removed.'), P('<b>Example:</b> Push A, then B, then C. Three pops return <b>C, B, A</b>.<br/><b>Uses:</b> function calls, undo operations, balanced-parenthesis checking, and depth-first search.')]
story += [Paragraph('2. Queue: first in, first out (FIFO)',styles['HeadingCustom']), P('A queue adds elements at the <b>rear</b> and removes them from the <b>front</b>. <b>Enqueue</b> adds an element; <b>dequeue</b> removes the oldest element. Think of a line at a ticket counter: the first person to join is served first.'), P('<b>Example:</b> Enqueue A, then B, then C. Three dequeues return <b>A, B, C</b>.<br/><b>Uses:</b> breadth-first search, print-job queues, and first-come-first-served task processing.')]
rows=[['Operation / property','Stack','Queue'],['Removal order','Newest element first','Oldest element first'],['Python implementation','list: append(), pop()','deque: append(), popleft()'],['Typical operation cost','O(1)*','O(1) with deque']]
table=Table([[Paragraph(c,styles['CellCustom']) for c in row] for row in rows],colWidths=[151,151,197])
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8edfb')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f7f9fd'),colors.white]),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,0),.5,colors.HexColor('#cbd5ed')),('VALIGN',(0,0),(-1,-1),'TOP')]))
story += [Spacer(1,5),table,Spacer(1,7),Paragraph('*For a Python list stack, append is amortized O(1); removing the last item is O(1). Removing the first item with list.pop(0) is O(n), so use collections.deque for a queue.',styles['CellCustom'])]
story += [Paragraph('3. Try it in Python',styles['HeadingCustom']),Preformatted('from collections import deque\n\nstack = [10, 20, 30]\nprint(stack.pop())       # 30: newest item\n\nqueue = deque([10, 20, 30])\nprint(queue.popleft())   # 10: oldest item',styles['CodeCustom']),P('<b>Check your understanding:</b> Which structure suits an undo button? Which suits breadth-first search? Why is list.pop(0) a poor choice for a large queue?')]
def footer(canvas,doc):
    canvas.setStrokeColor(colors.HexColor('#dbe1ed')); canvas.line(48,39,A4[0]-48,39)
    canvas.setFont('Helvetica',8); canvas.setFillColor(colors.HexColor('#77839a'))
    canvas.drawString(48,25,'MARGIN / DATA STRUCTURES'); canvas.drawRightString(A4[0]-48,25,'1')
doc=SimpleDocTemplate(str(out),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=43,bottomMargin=49,title='Stacks and Queues - Computer Science Study Notes',author='Margin Study Tutor')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(str(out))
assert len(reader.pages)==1, f'Expected one page, got {len(reader.pages)}'
assert 'popleft' in reader.pages[0].extract_text()
print(f'Created one-page text-based PDF: {out}')
