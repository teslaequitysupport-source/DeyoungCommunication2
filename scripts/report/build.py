# -*- coding: utf-8 -*-
"""Build the Phase-1 body PDF (ReportLab, TocDocTemplate + multiBuild).
Cover is rendered separately via html2poster.js and merged afterwards.
"""
import os
import sys
import hashlib

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
_scripts = os.path.join(PDF_SKILL_DIR, "scripts")
if _scripts not in sys.path:
    sys.path.insert(0, _scripts)

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, CondPageBreak, Image, HRFlowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage

from pdf import install_font_fallback

# ----------------------------------------------------------------------------
# Fonts (English document: FreeSerif family)
# ----------------------------------------------------------------------------
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
install_font_fallback()

# ----------------------------------------------------------------------------
# Palette — Template 07 Crystal Blue fixed body palette (skill-sanctioned)
# ----------------------------------------------------------------------------
PAGE_BG      = colors.HexColor("#f5f8fc")   # XL
SECTION_BG   = colors.HexColor("#edf2f9")  # XL
CARD_BG      = colors.HexColor("#e4ecf5")  # L
TABLE_STRIPE = colors.HexColor("#eef3fa")  # L
HEADER_FILL  = colors.HexColor("#1a4a7a")   # M
BORDER       = colors.HexColor("#c0d0e2")  # S
ACCENT       = colors.HexColor("#2d7ab3")  # XS
TEXT_PRIMARY = colors.HexColor("#142840")
TEXT_MUTED   = colors.HexColor("#5a7a96")

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ----------------------------------------------------------------------------
# Page geometry (symmetric margins)
# ----------------------------------------------------------------------------
MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25

DOC_TITLE = "AI Live Character Platform - Phase 1 Audit, Research and Architecture Report"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "body.pdf")
DIAGRAM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "diagram.png")

# ----------------------------------------------------------------------------
# Styles
# ----------------------------------------------------------------------------
S_H1 = ParagraphStyle("H1", fontName="FreeSerif", fontSize=19, leading=24,
                      textColor=HEADER_FILL, spaceBefore=18, spaceAfter=4)
S_H2 = ParagraphStyle("H2", fontName="FreeSerif", fontSize=13.5, leading=18,
                      textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=6)
S_BODY = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=17,
                        textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=10)
S_BULLET = ParagraphStyle("Bullet", fontName="FreeSerif", fontSize=10.5, leading=16,
                          textColor=TEXT_PRIMARY, alignment=TA_LEFT,
                          leftIndent=16, bulletIndent=4, spaceAfter=5)
S_CAPTION = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5, leading=12,
                          textColor=TEXT_MUTED, alignment=TA_CENTER,
                          spaceBefore=3, spaceAfter=6)
S_TH = ParagraphStyle("TH", fontName="FreeSerif", fontSize=9.5, leading=12.5,
                      textColor=colors.white, alignment=TA_LEFT)
S_TD = ParagraphStyle("TD", fontName="FreeSerif", fontSize=9, leading=12,
                      textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S_STAT = ParagraphStyle("Stat", fontName="FreeSerif", fontSize=20, leading=24,
                        textColor=ACCENT, alignment=TA_CENTER)
S_STAT_LBL = ParagraphStyle("StatLbl", fontName="FreeSerif", fontSize=9, leading=12,
                            textColor=TEXT_MUTED, alignment=TA_CENTER)
S_TOC_TITLE = ParagraphStyle("TocTitle", fontName="FreeSerif", fontSize=19, leading=24,
                             textColor=HEADER_FILL, spaceAfter=14)
TOC_L0 = ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=10.5, leading=17,
                        leftIndent=6, textColor=TEXT_PRIMARY)
TOC_L1 = ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=9.5, leading=14,
                        leftIndent=26, textColor=TEXT_MUTED)

# ----------------------------------------------------------------------------
# Doc template with TOC support
# ----------------------------------------------------------------------------
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            self.notify("TOCEntry", (level, text, self.page, key))


def on_page(canvas, doc):
    canvas.saveState()
    # Full-page background (Template 07 body tone)
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    # Header: title left + accent rule
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, "AI Live Character Platform")
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.55 * inch, "Phase 1 - Approval Gate")
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    # Footer: author left + page number right, light rule above
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, "Architecture and Engineering Review")
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, "Page %d" % doc.page)
    canvas.restoreState()


# ----------------------------------------------------------------------------
# Block builders
# ----------------------------------------------------------------------------
MAX_KEEP_HEIGHT = A4[1] * 0.4

def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        try:
            _, h = el.wrap(AVAIL_W, AVAIL_H)
        except Exception:
            h = 0
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def heading(text, level):
    key = "h_%s" % hashlib.md5(text.encode()).hexdigest()[:8]
    style = S_H1 if level == 0 else S_H2
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    if level == 0:
        p.bookmark_name = key
        p.bookmark_level = 0
        p.bookmark_text = text
        p.bookmark_key = key
    else:
        p.bookmark_name = key
        p.bookmark_level = 1
        p.bookmark_text = text
        p.bookmark_key = key
    return p


def build_table(spec):
    headers = spec["headers"]
    rows = spec["rows"]
    ratios = spec["ratios"]
    assert abs(sum(ratios) - 1.0) < 0.01, "ratios must sum to 1"
    col_widths = [r * AVAIL_W for r in ratios]
    assert sum(col_widths) <= AVAIL_W + 0.5

    data = [[Paragraph("<b>%s</b>" % h, S_TH) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), S_TD) for c in row])

    t = Table(data, colWidths=col_widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        style.append(("BACKGROUND", (0, i), (-1, i),
                      TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD))
    t.setStyle(TableStyle(style))

    out = [Spacer(1, 8), t]
    if spec.get("caption"):
        out += [Spacer(1, 4), Paragraph(spec["caption"], S_CAPTION)]
    out.append(Spacer(1, 8))
    return out


def build_callout(spec):
    inner = Table(
        [[Paragraph("<b>%s</b>" % spec["stat"], S_STAT)],
         [Paragraph(spec["label"], S_STAT_LBL)]],
        colWidths=[300],
    )
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
        ("TOPPADDING", (0, -1), (-1, -1), 2),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    inner.hAlign = "CENTER"
    return [Spacer(1, 6), KeepTogether(inner), Spacer(1, 8)]


def embed_image(path, max_width, max_height):
    pil = PILImage.open(path)
    ow, oh = pil.size
    # PNG saved at 2x device scale; logical size is half
    ow, oh = ow / 2.0, oh / 2.0
    ratio = min(max_width / ow if ow > max_width else 1.0,
                max_height / oh if oh > max_height else 1.0)
    img = Image(path, width=ow * ratio, height=oh * ratio)
    img.hAlign = "CENTER"
    return img


def build_blocks(blocks, chapter_counter):
    story = []
    pending_heading = None  # keep heading with first following element

    def flush(first_elem_group):
        nonlocal pending_heading
        if pending_heading is not None:
            group = pending_heading + first_elem_group[:1]
            story.extend(safe_keep_together(group))
            story.extend(first_elem_group[1:])
            pending_heading = None
        else:
            story.extend(first_elem_group)

    for kind, payload in blocks:
        if kind == "h1":
            chapter_counter[0] += 1
            text = "%d.  %s" % (chapter_counter[0], payload)
            story.append(CondPageBreak(H1_ORPHAN))
            pending_heading = [heading(text, 0),
                               HRFlowable(width="100%", color=ACCENT, thickness=1.2,
                                          spaceBefore=0, spaceAfter=10)]
        elif kind == "h2":
            pending_heading = [heading(payload, 1)]
        elif kind == "body":
            flush([Paragraph(payload, S_BODY)])
        elif kind == "bullet":
            items = [Paragraph(item, S_BULLET, bulletText="\u2022") for item in payload]
            flush(items[:1])
            story.extend(items[1:])
            story.append(Spacer(1, 5))
        elif kind == "table":
            flush(build_table(payload))
        elif kind == "callout":
            flush(build_callout(payload))
        elif kind == "img":
            img = embed_image(payload["path"], AVAIL_W, 340)
            cap = Paragraph(payload["caption"], S_CAPTION)
            flush([Spacer(1, 8)])
            story.extend(safe_keep_together([img, cap]))
            story.append(Spacer(1, 8))
    if pending_heading is not None:
        story.extend(pending_heading)
    return story


# ----------------------------------------------------------------------------
# Assemble document
# ----------------------------------------------------------------------------
from content1 import C1, C2, C3, C4, C5, C6
from content2 import C7, C8, C9, C10, C11, C12
from content3 import C13, C14, C15, C16, C17, C18

CHAPTERS = [C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17, C18]

doc = TocDocTemplate(
    OUT, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=MARGIN, bottomMargin=MARGIN,
    title=DOC_TITLE, author="Z.ai", creator="Z.ai",
    subject="Phase 1 audit, verified provider research, proposed architecture and implementation plan",
)

story = []

# TOC page
story.append(Paragraph("<b>Table of Contents</b>", S_TOC_TITLE))
toc = TableOfContents()
toc.levelStyles = [TOC_L0, TOC_L1]
story.append(toc)
story.append(PageBreak())

chapter_counter = [0]
for ch in CHAPTERS:
    story.extend(build_blocks(ch, chapter_counter))

doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print("Body PDF built:", OUT)
print("Chapters:", chapter_counter[0])
