# -*- coding: utf-8 -*-
"""Merge cover.pdf (page 0) + body.pdf into the final deliverable."""
import os
from pypdf import PdfReader, PdfWriter

HERE = os.path.dirname(os.path.abspath(__file__))
COVER = os.path.join(HERE, "cover.pdf")
BODY = os.path.join(HERE, "body.pdf")
OUT = "/home/z/my-project/download/AI_Live_Character_Platform_Phase1_Architecture_Report.pdf"

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
cover_page = PdfReader(COVER).pages[0]
writer.add_page(normalize_page_to_a4(cover_page))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))

writer.add_metadata({
    "/Title": "AI Live Character Platform - Phase 1 Audit, Research and Architecture Report",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Phase 1 audit, verified provider research, proposed architecture and implementation plan for approval",
})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "wb") as f:
    writer.write(f)
print("Final PDF:", OUT)
print("Pages:", len(writer.pages))
