#!/usr/bin/env python3
# scripts/generate-presentation.py — Convert V2.0 Presentation Markdown to PPTX
#
# Usage: python scripts/generate-presentation.py --output docs/Presentation-V2.0-R31-R34.pptx

import sys
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RgbColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

def load_markdown(filepath):
    """Load markdown file and return list of slide tuples (title, content_lines)"""
    slides = []
    current_title = None
    current_content = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    for line in lines:
        line = line.rstrip('\n')
        
        # Slide separator
        if line.startswith('# ') and not line.startswith('# 📊'):
            if current_title:
                slides.append((current_title, current_content))
            current_title = line[2:].strip()
            current_content = []
            continue
            
        # Table headers (ignore for now)
        if line.startswith('|') and line.endswith('|'):
            continue
            
        # Content bullet
        if line.startswith('- **') or line.startswith('### '):
            clean = line.replace('**', '').replace('### ', '').strip()
            if clean:
                current_content.append(clean)
                
    if current_title:
        slides.append((current_title, current_content))
        
    return slides

def add_slide(prs, title, content_items):
    """Add a single slide with title and bullet points"""
    layout = prs.slide_layouts[6]  # Blank layout
    slide = prs.slides.add_slide(layout)
    
    # Title
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(1))
    tf = title_box.text_frame
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(32)
    p.font.bold = True
    p.alignment = PP_ALIGN.LEFT
    
    # Set title color (gold theme)
    run = p.runs[0]
    run.font.color.rgb = RgbColor(0xC4, 0xAD, 0x29)  # Gold accent
    
    # Content bullets
    left = Inches(0.5)
    top = Inches(1.5)
    width = Inches(9)
    height = Inches(7)
    
    content_box = slide.shapes.add_textbox(left, top, width, height)
    ctf = content_box.text_frame
    ctf.word_wrap = True
    
    for i, item in enumerate(content_items):
        p = ctf.add_paragraph() if i > 0 else ctf.paragraphs[0]
        p.text = f"• {item}"
        p.font.size = Pt(18)
        p.space_before = Pt(6)
        p.alignment = PP_ALIGN.LEFT
        
        # Add emoji/icon indicators if present in text
        if '⭐' in item:
            icon_run = p.insert_paragraph_before(0, '⭐')
            icon_run.font.size = Pt(20)
            
    return slide

def main():
    input_md = Path(__file__).parent.parent / 'docs' / 'Presentation-V2.0-Demo-R31-R34.md'
    output_pptx = Path(__file__).parent.parent / 'docs' / 'Presentation-V2.0-R31-R34.pptx'
    
    print(f"📝 Loading markdown from {input_md}")
    slides = load_markdown(input_md)
    print(f"✅ Extracted {len(slides)} slides")
    
    prs = Presentation()
    
    # Custom title slide
    first_slide = prs.slides.add_slide(prs.slide_layouts[0])  # Blank
    title_shape = first_slide.shapes.title
    subtitle_shape = first_slide.placeholders[1]
    
    title_shape.text = "V2.0 核心功能演示"
    subtitle_shape.text = "R31–R34 | 入谱必审 / GEDCOM / 根脉专区 / RBAC\n族史委汇报材料 · 2026-09-XX"
    
    title_shape.text_frame.paragraphs[0].font.size = Pt(44)
    title_shape.text_frame.paragraphs[0].font.bold = True
    title_shape.text_frame.paragraphs[0].font.color.rgb = RgbColor(0x2B, 0x23, 0x20)  # Dark brown
    
    subtitle_shape.text_frame.paragraphs[0].font.size = Pt(20)
    subtitle_shape.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
    
    # Remove default bullets from first slide
    for shape in first_slide.shapes:
        if hasattr(shape, "has_table") and shape.has_table:
            first_slide.shapes.remove(shape)
    
    # Add remaining slides
    for i, (title, content) in enumerate(slides[1:], start=1):  # Skip first slide
        print(f"🖼️  Adding slide {i}: {title[:50]}...")
        add_slide(prs, title, content)
    
    prs.save(output_pptx)
    print(f"\n✨ Saved presentation to: {output_pptx}")
    print(f"Total slides: {len(slides)+1} (incl. title)")

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
