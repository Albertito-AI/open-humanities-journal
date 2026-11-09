"""Build the journal's public guidance from original journal-specific text.

Requires python-docx. The owner's reference informed the measurements below;
no text, footnotes or document parts from the unpublished manuscript are copied.
Render each output with render_docx.py and inspect every page before publication.
"""
from pathlib import Path
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_BREAK
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.part import Part
from docx.opc.constants import RELATIONSHIP_TYPE as RT
import re

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.publication-build'
OUT.mkdir(parents=True, exist_ok=True)
GREEN, RUST, GREY = '183E35', 'BC4B31', '696969'
FONT, SANS = 'Liberation Serif', 'Liberation Sans'
EMAIL = 'editor@thehumanquestionjournal.com'
SITE = 'https://thehumanquestionjournal.com'
LICENCE = 'https://creativecommons.org/licenses/by-nc-nd/4.0/'
DATE = '8 November 2026'

def el(name, **attrs):
    x = OxmlElement('w:' + name)
    for k,v in attrs.items(): x.set(qn('w:' + k), str(v))
    return x

def border(p, colour=GREEN, size=10, space=3):
    b = el('pBdr'); b.append(el('bottom', val='single', sz=size, space=space, color=colour))
    p._p.get_or_add_pPr().append(b)

def style(d, name, font=FONT, size=9.5, bold=False, italic=False, colour='141414', before=0, after=4, line=10.95, left=0, right=0, first=0, align=WD_ALIGN_PARAGRAPH.JUSTIFY, keep=False, caps=False):
    s = d.styles[name] if name in d.styles else d.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    # Clear template decoration and themed font overrides before defining our style.
    for tag in ('pBdr', 'tabs'):
        for old in s.element.xpath('./w:pPr/w:' + tag): old.getparent().remove(old)
    for old in s.element.xpath('./w:rPr/w:spacing'): old.getparent().remove(old)
    if name != 'Normal': s.base_style = d.styles['Normal']
    s.font.name=font; s.font.size=Pt(size); s.font.bold=bold; s.font.italic=italic
    s.font.color.rgb=RGBColor.from_string(colour); s.font.all_caps=caps
    pf=s.paragraph_format; pf.space_before=Pt(before); pf.space_after=Pt(after)
    pf.line_spacing=Pt(line); pf.line_spacing_rule=WD_LINE_SPACING.EXACTLY
    pf.left_indent=Pt(left); pf.right_indent=Pt(right); pf.first_line_indent=Pt(first)
    pf.alignment=align; pf.keep_with_next=keep; pf.widow_control=True
    s.element.get_or_add_rPr().append(el('lang', val='en-GB'))
    return s

def add(d, text='', kind='First Paragraph'):
    p=d.add_paragraph(style=kind)
    for bit in re.split(r'(https://[^\s]+)',text):
        if bit.startswith('https://'):
            link=OxmlElement('w:hyperlink'); link.set(qn('r:id'),d.part.relate_to(bit,RT.HYPERLINK,is_external=True))
            r=el('r'); rp=el('rPr'); rp.append(el('color',val=GREEN)); rp.append(el('u',val='single')); r.append(rp)
            t=el('t'); t.text=bit; r.append(t); link.append(r); p._p.append(link)
        else: p.add_run(bit)
    return p

NEXT_PAGE = set()
def h(d, text, level=1):
    p=add(d, text, 'Heading ' + str(level))
    if id(d) in NEXT_PAGE:
        p.paragraph_format.page_break_before=True
        NEXT_PAGE.remove(id(d))
    return p
def page(d): NEXT_PAGE.add(id(d))

def table(d, heads, rows, widths):
    t=d.add_table(rows=1, cols=len(heads)); t.autofit=False
    for col,w in zip(t.columns,widths): col.width=Pt(w)
    for c,w,txt in zip(t.rows[0].cells,widths,heads):
        c.width=Pt(w); c.text=txt
        c._tc.get_or_add_tcPr().append(el('shd',fill=GREEN))
        for p in c.paragraphs:
            p.style=d.styles['Table Text']
            for r in p.runs: r.font.color.rgb=RGBColor(255,255,255); r.bold=True
    t.rows[0]._tr.get_or_add_trPr().append(el('tblHeader'))
    for row in rows:
        cells=t.add_row().cells
        for c,w,txt in zip(cells,widths,row):
            c.width=Pt(w); c.text=txt
            for p in c.paragraphs: p.style=d.styles['Table Text']
        cells[0]._tc.get_or_add_tcPr().append(el('shd',fill='F1F3EF'))
        for c in cells:
            c._tc.get_or_add_tcPr().append(el('tcMar'))
        t.rows[-1]._tr.get_or_add_trPr().append(el('cantSplit'))
    add(d,'','Small')
    return t

def new(title, subtitle, label='Journal guidance', version='1.0', effective_date=DATE):
    d=Document(); s=d.sections[0]
    s.page_width=Pt(595.3); s.page_height=Pt(841.9)
    s.top_margin=Pt(40); s.bottom_margin=Pt(44); s.left_margin=Pt(59.15); s.right_margin=Pt(49.35)
    s.header_distance=Pt(9); s.footer_distance=Pt(18); s.different_first_page_header_footer=True
    style(d,'Normal',first=27.35)
    style(d,'First Paragraph')
    style(d,'Title',SANS,20,True,before=64,after=6,line=24,left=126,align=WD_ALIGN_PARAGRAPH.LEFT,keep=True,caps=True)
    style(d,'Subtitle',SANS,16,True,after=15,line=19,left=126,align=WD_ALIGN_PARAGRAPH.LEFT,keep=True,caps=True)
    style(d,'Author',SANS,10.5,True,after=6,line=12,left=126,align=WD_ALIGN_PARAGRAPH.LEFT,keep=True)
    style(d,'Affiliation',size=9,italic=True,after=4,line=11.5,left=126,align=WD_ALIGN_PARAGRAPH.LEFT,keep=True)
    style(d,'Date',size=8.5,after=12,line=10.5,left=126,align=WD_ALIGN_PARAGRAPH.LEFT,keep=True)
    style(d,'Heading 1',SANS,12,True,colour=GREEN,before=13,after=6,line=14,align=WD_ALIGN_PARAGRAPH.LEFT,keep=True,caps=True)
    style(d,'Heading 2',SANS,10,True,True,GREEN,10,5,12,align=WD_ALIGN_PARAGRAPH.LEFT,keep=True,caps=True)
    style(d,'Abstract Heading',SANS,11,True,colour=GREEN,after=6,line=13,left=126,align=WD_ALIGN_PARAGRAPH.LEFT,keep=True,caps=True)
    style(d,'Abstract',size=9,after=10,line=11.4,left=126)
    style(d,'Keywords',size=9,after=8,line=10.5,left=126,align=WD_ALIGN_PARAGRAPH.LEFT)
    style(d,'Bibliography',size=10,after=3,line=11.55,left=21.6,first=-21.6,align=WD_ALIGN_PARAGRAPH.LEFT)
    style(d,'Block Text',left=14,right=14,line=11.4)
    style(d,'Footnote Text',size=9,after=2,line=10.35,left=11,first=-11,align=WD_ALIGN_PARAGRAPH.LEFT)
    style(d,'Small',size=8.5,after=5,line=10.5,align=WD_ALIGN_PARAGRAPH.LEFT)
    style(d,'Table Text',size=9,after=4,before=3,line=11.3,align=WD_ALIGN_PARAGRAPH.LEFT)
    style(d,'Label',SANS,8,True,colour=RUST,line=10,after=5,align=WD_ALIGN_PARAGRAPH.LEFT)
    style(d,'Check',size=9.5,left=12,first=-12,after=6,line=12,align=WD_ALIGN_PARAGRAPH.LEFT)
    ref=d.styles.add_style('Footnote Reference',WD_STYLE_TYPE.CHARACTER) if 'Footnote Reference' not in d.styles else d.styles['Footnote Reference']
    ref.font.name=FONT; ref.font.size=Pt(9.5); ref.font.superscript=True
    # Preserve the complete supplied logo. Layout adjusts its frame, not its pixels.
    header=s.first_page_header
    p=header.paragraphs[0]; p.style=d.styles['First Paragraph']; p.paragraph_format.space_after=Pt(0); p.paragraph_format.line_spacing=Pt(1); p.add_run().font.size=Pt(1)
    t=header.add_table(rows=1,cols=2,width=Pt(486.8)); t.autofit=False
    t.columns[0].width=Pt(180); t.columns[1].width=Pt(306.8)
    left,right=t.rows[0].cells; left.width=Pt(180); right.width=Pt(306.8)
    p=left.paragraphs[0]; p.style=d.styles['First Paragraph']; p.paragraph_format.space_after=Pt(0); p.paragraph_format.line_spacing=1
    r=p.add_run(); r.add_picture(str(ROOT/'public/brand/The_Human_Question_Logo.png'),width=Pt(148))
    r._r.xpath('.//wp:docPr')[0].set('descr','The Human Question full journal logo')
    p=right.paragraphs[0]; p.style=d.styles['First Paragraph']; p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_before=Pt(9); p.paragraph_format.line_spacing=Pt(12); border(p,GREEN)
    r=p.add_run('A Journal of Humanistic Inquiry'); r.italic=True; r.font.name=FONT; r.font.size=Pt(9)
    p=right.add_paragraph(label); p.style=d.styles['First Paragraph']; p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_after=Pt(0)
    for r in p.runs: r.font.name=FONT; r.font.size=Pt(9); r.italic=True; r.font.color.rgb=RGBColor.from_string(RUST)
    p=header.add_paragraph(); p.style=d.styles['First Paragraph']; p.paragraph_format.space_after=Pt(0); p.paragraph_format.line_spacing=Pt(1); border(p,'141414',4,0)
    p=s.header.paragraphs[0]; p.style=d.styles['First Paragraph']; p.paragraph_format.line_spacing=Pt(4); p.paragraph_format.space_after=Pt(0); border(p,GREEN)
    for footer in (s.footer,s.first_page_footer):
        p=footer.paragraphs[0]; p.style=d.styles['Small']; p.paragraph_format.tab_stops.add_tab_stop(Pt(475),WD_ALIGN_PARAGRAPH.RIGHT)
        p.paragraph_format.line_spacing=Pt(11.5)
        r=p.add_run(title+'\t'); r.font.name=FONT; r.font.size=Pt(8); r.font.color.rgb=RGBColor.from_string(GREY)
        r=p.add_run(); r.font.name=FONT; r.font.size=Pt(9)
        field=el('fldSimple',instr='PAGE'); r._r.addnext(field)
    d.core_properties.title='The Human Question | '+title
    d.core_properties.subject=subtitle
    d.core_properties.author='The Human Question'
    d.core_properties.keywords='journal, author guidance, version '+version
    d.core_properties.comments='Original journal guidance. Version '+version+', '+effective_date+'.'
    add(d,title,'Title'); add(d,subtitle,'Subtitle')
    add(d,'The Human Question','Author')
    add(d,'A Journal of Humanistic Inquiry','Affiliation')
    add(d,'Version '+version+' · '+effective_date,'Date')
    return d

def intro(d,text):
    add(d,'Purpose','Abstract Heading'); add(d,text,'Abstract')
    add(d,'CONTACT: '+EMAIL,'Keywords')
    add(d,'President and Editor-in-Chief: Albert Tan Sin Hon','Keywords')

def save(d,name):
    path=OUT/('The_Human_Question_'+name+'.docx'); d.save(path); print(path.name)

def sources(d,items):
    for name,url in items: add(d,name+'\n'+url,'Small')

def note(d,text): add(d,text,'Small')

# 1. Publication style guide: fixed page breaks make the specification easy to use.
d=new('Publication style guide','House style and production specification','House style guide · v1.1', version='1.1', effective_date='9 November 2026')
intro(d,'Approved by Albert Tan Sin Hon, President and Editor-in-Chief, on 8 November 2026, this guide establishes the journal’s publication production standard. Its visual structure follows the reference supplied by the founder: an offset opening title and abstract, a single text column, compact serif prose, strong sans-serif headings and page footnotes. The full journal logo replaces the large “Open Access” masthead. Deep green replaces the orange headings and rules; rust is reserved for restrained secondary accents. The accompanying PDF specimen illustrates the finished layout. Authors may submit a clearly formatted manuscript before acceptance; the editorial team applies the publication layout during production.')
h(d,'1. A recognisable journal page')
add(d,'Use the complete approved logo, including the monogram and journal name. Keep its proportions and colours intact. On the first page, place it at the upper left, with the journal subtitle and document or article type at the upper right. A fine dark rule separates the masthead from the page. Subsequent pages carry a deep green top rule and a short running title with the page number below.')
add(d,'Set the article title and subtitle in black. Use deep green for numbered section headings, subheadings and the abstract heading. Use rust sparingly for small labels and the existing question-mark accent. Body text and footnotes remain near black on white. Meaning must remain clear in greyscale.','Normal')
h(d,'1.1 What authors need to prepare',2)
add(d,'Supply an anonymised manuscript and a separate title page for review. After acceptance, supply the editable text, complete citations, declarations, permissions and original figures. The PDF specimen is a production reference; formatting alone does not determine acceptance. The journal charges no submission, review or publication fees.')
note(d,'This is the journal’s own style. Oxford University Press guidance informs its editorial conventions; no affiliation or endorsement is implied. The visual reference does not establish the truth or citation accuracy of any manuscript.')
page(d)
h(d,'2. Page geometry and Word styles')
add(d,'Use A4 portrait (210 × 297 mm), one column. The measurements below preserve the reference’s text geometry. The first-title spacing is adjusted to accommodate the complete logo. Enter measurements in points where Word’s rounding of millimetres changes the layout.')
table(d,['Element','Setting'],[
('Margins','Top 40 pt (14.11 mm); bottom 44 pt (15.52 mm); left 59.15 pt (20.87 mm); right 49.35 pt (17.41 mm).'),
('Header and footer','Header 9 pt from edge; footer 18 pt. Different first-page header and footer enabled.'),
('First-page logo','Full approved PNG, 148 pt wide, original proportions. Do not replace it with the monogram alone.'),
('Title','Liberation Sans, 20 pt, bold, capitals, black; 24 pt exact line spacing; 126 pt left indent; 64 pt before and 6 pt after.'),
('Subtitle','Liberation Sans, 16 pt, bold, capitals; 19 pt exact; 126 pt left indent; 15 pt after.'),
('Author','Liberation Sans, 10.5 pt bold; 12 pt exact; 126 pt left indent; 6 pt after.'),
('Affiliation / date','Liberation Serif, 9 pt italic / 8.5 pt roman; 126 pt left indent; 11.5 / 10.5 pt exact.'),
('Abstract heading','Liberation Sans, 11 pt bold capitals, deep green; 13 pt exact; 126 pt left indent.'),
('Abstract / keywords','Liberation Serif, 9 pt; abstract justified at 11.4 pt exact; keywords left aligned at 10.5 pt; 126 pt left indent.'),
('Normal body','Liberation Serif, 9.5 pt, justified; 10.95 pt exact; 4 pt after; first-line indent 27.35 pt.'),
('First Paragraph','Same as body, with no first-line indent. Use after a heading, table or block quotation.'),
('Heading 1','Liberation Sans, 12 pt bold capitals, deep green; 14 pt exact; 13 pt before, 6 pt after; keep with next.'),
('Heading 2','Liberation Sans, 10 pt bold italic capitals, deep green; 12 pt exact; 10 pt before, 5 pt after; keep with next.'),
('Block Text','Liberation Serif, 9.5 pt; left and right indents 14 pt; no first-line indent; 11.4 pt exact.'),
('Footnote Text','Liberation Serif, 9 pt; 10.35 pt exact; 11 pt left and hanging indent; 2 pt after. Superscript reference markers.'),
('Bibliography','Liberation Serif, 10 pt; left aligned; 21.6 pt hanging indent; 11.55 pt exact; 3 pt after.'),
('Running footer','Short article title, 8 pt grey; page number right aligned. Never type page numbers manually.'),
('Colours','Deep green #183E35; rust #BC4B31; near black #141414; secondary grey #696969. White page background.')
],[104,382])
note(d,'Use the named Word styles. Do not create alignment with repeated spaces or empty paragraphs. Enable widow/orphan control. Keep headings with the following paragraph. In passages with complex mathematics or scripts, increase line spacing locally if glyphs would be clipped, and inspect the exported PDF.')
h(d,'2.1 First-page vertical licence line',2)
add(d,"Every article must carry a vertical copyright and licence notice on its first page only. Place it in the outer left margin of the A4 page, with the baseline 18 pt from the left edge and the text starting 55 pt above the bottom edge. Rotate it 90 degrees anticlockwise so that it reads from bottom to top.")
add(d,"Use Liberation Serif, 6.5 pt, in muted grey #707070. Keep the full line within 720 pt and clear of the logo, article text and footnotes. Link the entire line to https://creativecommons.org/licenses/by-nc-nd/4.0/; the link area should span x = 11–21 pt and the length of the notice. Do not repeat the notice on subsequent pages.")
add(d,"Text: © [year] [author name(s)]. Licensed under the Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International licence. To view a copy, visit https://creativecommons.org/licenses/by-nc-nd/4.0/.")
add(d,"Replace the bracketed fields with the article’s verified year and author names. Inspect the rotated text and test its link in the exported PDF. This layout requirement takes effect on 9 November 2026.")
page(d)
h(d,'3. Language, structure and citation')
h(d,'3.1 Titles, abstracts and prose',2)
add(d,'Use an informative title and an optional explanatory subtitle. An abstract of 150–250 words should state the question, approach, central finding or argument and significance. Avoid abbreviations, citations and footnotes in the abstract. Supply four to six keywords. In final proofs, list author names, affiliations, corresponding email and ORCID identifiers where available. Record only confirmed publication dates and assigned identifiers.')
add(d,'Write in British English. Use a consistent British spelling system throughout; the journal’s default is -ise, -isation and -yse. This is a journal choice within British usage. Prefer clear verbs, precise claims and varied sentences. Explain specialist terms. Avoid em dashes; use commas, brackets, a colon or a full stop as the sense requires. Use a serial comma where it prevents ambiguity. Preserve original spelling in quotations and proper names.','Normal')
add(d,'Number principal sections 1, 2 and 3; number subsections 1.1 and 1.2. Avoid more than two numbered levels. Use descriptive headings. The template displays them in capitals through the style, so authors should type ordinary title or sentence case. Use italics for book and journal titles and occasional emphasis; avoid underlining and decorative bold in prose.','Normal')
h(d,'3.2 Quotations, numbers and dates',2)
add(d,'Use single quotation marks, with double marks for a quotation inside a quotation. Set quotations of 40 words or more as indented blocks without quotation marks. Reproduce the source accurately, show omissions and editorial insertions, and give a pinpoint citation. Place punctuation according to its grammatical relationship to the quotation. Do not silently modernise or correct a source.')
add(d,'Write dates as 8 November 2026. Use numerals for measurements, percentages, tables and precise comparisons; normally spell out one to nine in ordinary prose. Use an en dash for inclusive ranges, such as 12–18. Distinguish the number zero from the letter O and a hyphen from a minus sign. Define units, denominators and statistical measures.','Normal')
h(d,'3.3 Footnotes and references',2)
add(d,'The default final style is footnotes with a bibliography. Use Word’s Insert Footnote function with consecutive Arabic numbering throughout the article. Place the superscript marker after punctuation unless the note relates specifically to a word or phrase. Give full bibliographical details at first mention, then an unambiguous short form. Avoid op. cit.; use ibid only when the preceding note identifies a single source unambiguously. Every quotation and contested factual proposition needs a precise source.')
add(d,'For legal scholarship, follow OSCOLA, fifth edition, with adaptations required by the jurisdiction and this guide’s typography. Preserve official case names, neutral citations, statutory titles and treaty identifiers. Give sections, articles, rules, paragraphs or pages as appropriate. Do not force a non-UK authority into a misleading UK citation. For non-legal humanities work, use the patterns below consistently. An established author-date system may be retained with the handling editor’s agreement where it is necessary for the discipline; one article must not mix systems accidentally.','Normal')
table(d,['Source','Footnote pattern (placeholders, not actual references)'],[
('Book','Author Full Name, Book Title (edition, Publisher year) pinpoint.'),
('Journal article','Author Full Name, ‘Article Title’ (year) volume Journal Title first page, pinpoint. DOI where available.'),
('Book chapter','Author Full Name, ‘Chapter Title’ in Editor Name (ed), Book Title (Publisher year) pinpoint.'),
('Online source','Author or organisation, ‘Page Title’ (publication or update date) stable URL; add an access date when undated or liable to change.'),
('Bibliography','Invert the first author’s name; arrange alphabetically. Omit the specific cited pinpoint. Retain article/chapter page ranges.')
],[92,394])
page(d)
h(d,'4. Production, accessibility and release')
add(d,'Number tables and figures separately, cite each in the text, and provide a concise title, explanatory notes, source and permissions statement where required. Use editable tables rather than images of tables. Supply charts and line drawings in vector form where practical; otherwise use an image resolution appropriate to its final size. Keep labels legible at publication scale. Provide useful alternative text describing what a reader needs to learn from each visual. Colour alone must not carry meaning.')
add(d,'Place acknowledgements, funding, competing interests, author contributions where applicable, research ethics or consent, data availability and substantive artificial-intelligence assistance declarations before the bibliography. State when a category does not apply. These declarations must describe the work actually done. Human authors remain responsible for all analysis, quotations, citations, translations and visual material.','Normal')
h(d,'4.1 Copyright and the publication record',2)
add(d,'The standard article notice is: “© [year] [author name(s)]. Published by The Human Question: A Journal of Humanistic Inquiry. Licensed under Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 International (CC BY-NC-ND 4.0).” Add the licence link below. Replace all brackets with verified details before release. Identify any excluded third-party material separately. A licence notice must reflect the signed author agreement and actual rights held.')
note(d,LICENCE)
add(d,'Display an ISSN, DOI, volume, issue and page range only when assigned and correct. Before the first issue is published, specimen documents must remain clearly labelled as templates. Never invent a publication history, review date, indexing status or institutional endorsement. Policy documents carry a version and effective date; substantive policy changes require a new dated version.')
h(d,'4.2 Release checklist',2)
for x in [
'Verify the author-approved text, author order, affiliations, abstract, keywords and all declarations against the final acceptance record.',
'Check every reference against its source; verify quotation wording, pinpoint locations, DOI destinations and working URLs. Automated link checks do not establish that a source supports a claim.',
'Update fields and footnote numbering. Remove comments, tracked changes, hidden draft text and personal document metadata that should not be public.',
'Inspect every PDF page at normal reading size: logo, heading breaks, footnotes, tables, images, special characters, page numbers and blank pages.',
'Export selectable text, embedded fonts, document language, meaningful headings, bookmarks and working links where supported. Check reading order and visual alternatives. Do not label a PDF PDF/UA-compliant without validation.',
'Obtain final proof approval; confirm the licence, independent editorial decision and any permissions. Create an article landing page and consistent citation metadata.',
'Save the release file and its checksum; retain the prior version when a correction is issued. Publish corrections with an explanation and links to the original record.'
]: add(d,'• '+x,'Check')
h(d,'5. Reference basis')
sources(d,[('Oxford University Press, manuscript preparation guidance','https://academic.oup.com/pages/for-authors/journals/preparing-and-submitting-your-manuscript'),('Oxford University Press, style and references guidance','https://academic.oup.com/pages/for-authors/books/the-book-publishing-process/writing-and-content-preparation/style-and-references'),('University of Oxford, OSCOLA, fifth edition and supporting resources','https://www.law.ox.ac.uk/oscola'),('Creative Commons, CC BY-NC-ND 4.0','https://creativecommons.org/licenses/by-nc-nd/4.0/')])
save(d,'Publication_Style_Guide')

# 2. Editable specimen; no unpublished manuscript content is included.
d=new('Article title','Optional explanatory subtitle','Publication template · not a published article')
for p in d.paragraphs:
    if p.style.name=='Author': p.text='[Author full name(s)]'
    if p.style.name=='Affiliation': p.text='[Affiliation(s); corresponding email; ORCID where available]'
    if p.style.name=='Date': p.text='[Confirmed publication date, entered after acceptance]'
add(d,'Abstract','Abstract Heading')
add(d,'[Replace this paragraph with an abstract of 150–250 words. State the question, approach, central argument or finding and significance for human life. Avoid abbreviations, citations and footnotes. This specimen contains instructional text only. It is not an accepted or published article.]','Abstract')
add(d,'KEYWORDS: [four to six keywords, separated by semicolons]','Keywords')
h(d,'1. Introduction')
p=add(d,'[Set out the problem, the contribution and its relevance to the journal. Apply First Paragraph to the first paragraph after a heading. This paragraph includes a working footnote for demonstration.]')
r=p.add_run(); r.style=d.styles['Footnote Reference']; r._r.append(el('footnoteReference',id=1))
add(d,'[Apply Normal to later paragraphs. It supplies the first-line indent and compact line spacing. Replace all instructional text. Insert real footnotes with Word’s References menu; do not type footnote numbers or place notes in text boxes.]','Normal')
h(d,'1.1 A focused subsidiary question',2)
add(d,'[Develop the analysis with clear distinctions between evidence and interpretation. Use accurate pinpoint references. The journal’s full logo and green accents appear in the header and section styles.]')
add(d,'[A block quotation of 40 words or more uses Block Text. Remove enclosing quotation marks, preserve the source accurately and place a footnote reference at the end. This is a formatting instruction, not a quotation from a scholarly source.]','Block Text')
note(d,'SPECIMEN ONLY · No ISSN, DOI, issue number, acceptance date or peer-review history is assigned by this template.')
page(d)
h(d,'2. Analysis')
add(d,'[Continue the argument. Add sections and subsections as needed. This page demonstrates the subsequent-page header and footer.]')
table(d,['Table 1. [Descriptive title]','[Column heading]'],[('[Row label]','[Verified value or explanation]'),('[Row label]','[Verified value or explanation]')],[225,261])
note(d,'Source: [source and permission or licence where required]. Notes: [definitions, units and qualifications].')
h(d,'3. Conclusion')
add(d,'[Explain what follows from the analysis, including its limits. Do not introduce unsupported claims.]')
h(d,'Declarations')
for title,text in [('Funding','[Name the funder and grant, or state that no specific funding supported the work.]'),('Competing interests','[Disclose relevant interests, or state “None declared”.]'),('Author contributions','[Describe contributions where there is more than one author.]'),('Ethics and consent','[Approval or exemption and consent arrangements, or explain why not applicable.]'),('Data and materials','[Repository and access terms, a justified restriction, or “No new dataset was created”.]'),('Artificial-intelligence assistance','[Identify tools and their material uses, verification and responsibility, or state that no substantive generative assistance was used.]')]:
    p=add(d); p.add_run(title+': ').bold=True; p.add_run(text)
h(d,'Bibliography')
add(d,'[Surname, Given Name], [Book Title] ([Publisher] [year])','Bibliography')
add(d,'[Surname, Given Name], ‘[Article Title]’ ([year]) [volume] [Journal] [page range]','Bibliography')
h(d,'Publication notice')
note(d,'© [year] [author name(s)]. Published by The Human Question: A Journal of Humanistic Inquiry. Licensed under Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 International (CC BY-NC-ND 4.0). '+LICENCE)
note(d,'[Production editor: remove every bracketed instruction, confirm all rights and identifiers, and secure author approval before publication.]')
footnotes=el('footnotes')
for fid,kind in [(-1,'separator'),(0,'continuationSeparator')]:
    f=el('footnote',id=fid,type=kind); p=el('p'); r=el('r'); r.append(el(kind)); p.append(r); f.append(p); footnotes.append(f)
f=el('footnote',id=1); p=el('p'); pp=el('pPr'); pp.append(el('pStyle',val='FootnoteText')); p.append(pp)
r=el('r'); rp=el('rPr'); rp.append(el('rStyle',val='FootnoteReference')); r.append(rp); r.append(el('footnoteRef')); p.append(r)
r=el('r'); txt=el('t'); txt.set(qn('xml:space'),'preserve'); txt.text=' This working footnote is a formatting example. Replace it with a verified reference and pinpoint.'; r.append(txt); p.append(r); f.append(p); footnotes.append(f)
from lxml import etree
from docx.opc.packuri import PackURI
part=Part(PackURI('/word/footnotes.xml'),'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',etree.tostring(footnotes,xml_declaration=True,encoding='UTF-8',standalone=True),d.part.package)
d.part.relate_to(part,RT.FOOTNOTES)
save(d,'House_Style_Template')

# 3. Author instructions.
d=new('Author instructions','Preparing and submitting your manuscript')
intro(d,'The Human Question welcomes work that connects serious scholarship with the conditions of human life. Across law, science, politics, technology and culture, the journal asks what ideas, institutions and discoveries mean for the person and for humanity. Submissions and editorial correspondence take place by email. Readers and authors pay no journal fees. Research articles undergo independent external peer review before acceptance.')
h(d,'1. Scope and article types')
table(d,['Type','Normal length and review'],[
('Research article','6,000–10,000 words; original argument or research; two independent external reviews.'),
('Review essay / critical essay','3,000–6,000 words; sustained scholarly analysis; two independent external reviews.'),
('Book review / editorial / commentary','1,000–2,500 words; editorial assessment; labelled by type. External review, if used, is disclosed on the article.')
],[145,341])
add(d,'Word limits include footnotes and exclude the abstract and bibliography. Explain any justified departure in the covering email. Interdisciplinary submissions should make their methods and contribution intelligible to readers outside the author’s field. Submissions are considered on a rolling basis; acceptance is never guaranteed. The first issue is in preparation, and no fixed publication frequency is promised at this stage.')
h(d,'2. Submit three items by email')
for title,text in [('An anonymised manuscript','Send an editable Word document; include a PDF where complex layout or scripts need comparison. Remove names, affiliations, acknowledgements and identifying document properties from the review copy. Refer to your own published work in the third person without concealing sources needed to assess the argument.'),('A separate title page','Give the title, article type, word count, all author names and affiliations, corresponding author’s email and ORCID identifiers where available. Include funding, competing interests, contributions, ethics/consent, data availability and substantive artificial-intelligence assistance declarations.'),('A covering email','Explain the contribution and fit; confirm all authors approve submission, the work is not under consideration by another journal, and any preprint, thesis, related paper or earlier version is disclosed. Mention permissions and any confidential concern relevant to review.')]:
    p=add(d); p.add_run(title+'. ').bold=True; p.add_run(text)
note(d,'Send to '+EMAIL+'. Suggested subject: “Submission | [article type] | [short title]”. Do not send passwords, identity documents or raw identifiable research-participant data.')
page(d)
h(d,'3. Manuscript preparation')
add(d,'Initial submissions may use any clear and consistent scholarly format. Provide a title, a 150–250-word abstract without abbreviations, citations or footnotes, four to six keywords, informative headings and complete references. Use British English. Number pages. Figures and tables need captions, sources, necessary permissions and descriptive alternative text. Identify the relevant legal or evidential cut-off date where it affects the analysis.')
add(d,'The final default is footnotes and bibliography. Legal papers follow OSCOLA, fifth edition; other humanities papers follow the journal’s notes-and-bibliography patterns. Discuss any discipline-specific author-date requirement with the editor. The Publication Style Guide and PDF house-style specimen set the final typography. Do not insert a journal logo into the anonymised review copy.','Normal')
h(d,'4. Editorial assessment and review')
add(d,'The editor checks scope, scholarly contribution, completeness, integrity and readiness for review. A desk rejection includes a brief reason. Suitable research and review essays receive double-anonymous review by two independent specialists. Author and reviewer identities are withheld from each other where practicable; public preprints or distinctive research may make identification possible. The handling editor knows the identities and manages conflicts.')
add(d,'The journal aims to acknowledge a submission within seven days, provide an initial assessment within four weeks and seek external reports within six to eight weeks of reviewer acceptance. These are service targets, not guarantees. The editor will explain material delays. Decisions may request minor or major revision, invite a fresh submission, accept or reject. Reviewer recommendations inform an independent editorial decision.','Normal')
add(d,'If a founder, editor or board member is an author, a qualified independent handling editor must control reviewer selection and the decision. The author-editor has no access to confidential deliberations. Where independence cannot be secured, the paper will be held or the author invited to submit elsewhere. The published article will disclose the independent handling arrangement.','Normal')
h(d,'5. Revision, acceptance and publication')
add(d,'Return a clean revised manuscript, a version showing changes and a response addressing every material reviewer point with page or paragraph locations. Explain disagreements with evidence and courtesy. If more time is needed, contact the editor. An acceptance decision is confirmed in writing only after the required scholarly and integrity checks.')
add(d,'Accepted authors complete the publication agreement, resolve permissions, check declarations and approve the final PDF proof. Proof corrections should address accuracy and production errors; substantial new argument may require further review. The journal publishes the approved PDF with an article landing page, citation details and the applicable licence. Only assigned identifiers are displayed.','Normal')
h(d,'6. Fees, rights and queries')
add(d,'There are no submission, peer-review, publication, page, colour or withdrawal fees. Authors retain copyright. The standard published article licence is CC BY-NC-ND 4.0: readers may share the unadapted work noncommercially with attribution and the licence link. Permission for uses beyond the licence must be obtained from the relevant rights holder unless a legal exception applies. See the rights policy for detail.')
add(d,'Disclose substantive generative assistance, including drafting, rewriting, translation, coding or image generation. Identify the tool and version where available, the purpose and the human checks. Routine non-generative spelling and reference-format checks need no separate declaration. Artificial-intelligence systems cannot be authors. Do not upload confidential third-party material without authority.')
note(d,'For submissions, accessibility needs, conflicts, complaints or correction requests: '+EMAIL+'. The accompanying editorial, ethics, rights and privacy policies form part of these instructions. Version 1.0 takes effect on '+DATE+'.')
save(d,'Author_Instructions')

# 4. Editorial and peer-review policy.
d=new('Editorial and peer-review policy','Independent judgement and accountable decisions')
intro(d,'Albert Tan Sin Hon is the journal’s President and Editor-in-Chief, founder and publisher, based in Singapore. The editorial contact is '+EMAIL+'. The journal is independently operated; an author’s university affiliation does not imply institutional sponsorship. Scholarly decisions rest on contribution, rigour, evidence, clarity and relevance to humanistic inquiry. Payment, friendship, seniority, nationality and agreement with an editor’s views do not determine acceptance.')
h(d,'1. Governance and editorial independence')
add(d,'The public website will identify appointed editors and board members with their consent, roles and affiliations. No person is represented as an editor without agreeing to serve. A handling editor must have appropriate expertise and sufficient independence from the authors. The publisher supports the process and may not overturn a scholarly decision to secure publication for a preferred author. Sponsorship, if introduced, must be disclosed and cannot purchase editorial influence.')
add(d,'Editors disclose financial, professional, institutional and personal interests. Close collaboration, supervision, family relationships, shared current employment, direct financial interests or active personal disputes normally require recusal. When uncertain, the editor discloses the circumstances and seeks independent handling. Editorial appointments and processes are reviewed as the journal develops.','Normal')
h(d,'2. What is peer reviewed')
add(d,'Research articles and scholarly review or critical essays require two independent external reports before acceptance. Book reviews, editorials and shorter commentaries ordinarily receive editorial assessment and are labelled accordingly. If external review is used for another content type, that fact is stated. The journal does not describe an entire issue as externally peer reviewed when it contains editorially assessed material.')
add(d,'For externally reviewed work, the normal model is double-anonymous: author names are withheld from reviewers, and reviewer names from authors. The editor retains identity records. Anonymity cannot be assured where preprints, distinctive subject matter or prior public discussion reveal authorship. Reviewers who recognise an author must disclose this and any resulting conflict. Reports are confidential and are not published without the necessary consent.','Normal')
h(d,'3. Authors who also hold editorial roles')
add(d,'A founder, editor, board member or their close collaborator may submit work only through an independent handling arrangement. A suitably qualified editor with no relevant conflict selects reviewers, controls correspondence and makes the decision. The author-editor is excluded from reviewer selection, confidential reports addressed to the editor and decision deliberations. The journal retains a record and publishes an article-level disclosure. If independence cannot be established, acceptance cannot proceed.')
page(d)
h(d,'4. Workflow and reviewer selection')
add(d,'A desk assessment considers scope, originality, method, evidential support, ethical declarations and readiness. Clearly unsuitable or incomplete work may be declined or returned without external review. The reasons should be communicated respectfully. Reviewers are selected for subject expertise and independence, with attention to relevant disciplinary and regional perspectives. Names, affiliations and contact routes are checked rather than accepted solely on author recommendation.')
add(d,'Authors may suggest reviewers or identify a reasoned conflict; the editor retains discretion. An author-suggested reviewer is never treated as independent solely because the author says so. Reviewers declare conflicts, maintain confidentiality and accept only if they can provide a timely, competent assessment. They must not contact authors directly about a confidential review or seek citation of their own work without scholarly justification.','Normal')
add(d,'Reports should address contribution, reasoning, methods, sources, clarity, limits and human significance. The editor considers the substance of the reports, not a simple vote. Material disagreement may require a further reviewer or a reasoned editorial assessment. Necessary additional expertise must be obtained before acceptance. Decisions explain the principal reasons and distinguish essential revisions from optional suggestions.','Normal')
h(d,'5. Timing, revision and withdrawal')
add(d,'Targets are acknowledgement within seven days, desk assessment within four weeks and reviewer reports within six to eight weeks of accepting an invitation. Availability and complexity can extend these periods. Editors should inform authors about material delays. A revision invitation specifies the requested changes and a reasonable return date; extensions may be agreed by email.')
add(d,'Authors may withdraw before publication by written request, with all co-authors informed. The journal confirms the withdrawal and stops the review or production process. No withdrawal fee applies. A published article forms part of the scholarly record; post-publication requests are handled through the correction and retraction policy, with exceptional removal only where justified.','Normal')
h(d,'6. Appeals and complaints')
add(d,'An author may appeal within 30 days of a decision by explaining a material factual error, procedural irregularity or overlooked evidence, with concise supporting details. Disagreement alone does not establish an error. Send the appeal to the editorial address with “Appeal” in the subject. The journal aims to acknowledge it within seven days and provide an outcome or progress update within 30 days.')
add(d,'A person uninvolved in the original decision, and without a conflict, reviews the appeal. A complaint about the founder or handling editor requires a suitably qualified external person to review it independently. The complainant is told who is handling it, subject to necessary confidentiality. If such a person cannot yet be secured, the journal explains the delay and does not present an internal self-review as independent. The written outcome states the reasons and any corrective action.','Normal')
h(d,'7. Accountability and sources')
add(d,'Maintain a private audit trail of invitations, conflicts, reports, decisions and author approvals. Publish material corrections to these policies with a new version and date. The first issue remains in preparation; the journal makes no claim here to an assigned ISSN, indexing, impact factor, COPE membership or preservation-service membership.')
sources(d,[('COPE, Ethical Guidelines for Peer Reviewers','https://doi.org/10.24318/cope.2019.1.9'),('OASPA and partners, Principles of Transparency and Best Practice in Scholarly Publishing, version 5','https://www.oaspa.org/resources/principles-of-transparency-and-best-practice-in-scholarly-publishing-version-5/')])
save(d,'Editorial_and_Peer_Review_Policy')

# 5. Ethics.
d=new('Publication ethics','Integrity, transparency and the scholarly record')
intro(d,'Authors, reviewers and editors share responsibility for an accurate and trustworthy scholarly record. These policies apply to submissions, reviews, editorial decisions and published work. The journal assesses concerns on evidence, gives affected people a fair opportunity to respond and records the reasons for its decisions. Concerns may be raised confidentially at '+EMAIL+'.')
h(d,'1. Authorship and contributions')
add(d,'Authorship requires a substantial intellectual contribution to the work, participation in drafting or substantive revision, approval of the final version and responsibility for the contribution and integrity of the paper. Agree author order before submission. Name other assistance in acknowledgements with the person’s consent. Funding, status or routine supervision alone does not justify authorship. Gift, guest and ghost authorship are unacceptable.')
add(d,'All authors must agree to submission, revisions and publication. Changes to authorship require a reason and written agreement from all affected authors. If an authorship dispute cannot be resolved reliably, review or publication may pause while the relevant institution investigates. The journal does not invent a resolution to disputes beyond its evidence.','Normal')
h(d,'2. Originality, related work and evidence')
add(d,'Submit original work that is not simultaneously under review by another journal. Disclose related manuscripts, prior publication and substantial overlap. A disclosed preprint, thesis or conference presentation does not automatically bar submission, provided rights permit publication and the relationship is explained. Cite reused material, including your own. Translation of an earlier publication requires disclosure, permission where necessary and editorial agreement.')
add(d,'Fabricated or falsified sources, data, quotations, results and images are prohibited. Preserve evidence sufficient to support the analysis, subject to consent, confidentiality and lawful restrictions. Acknowledge uncertainty and limits. Corrections to images may clarify presentation only if they do not misrepresent the underlying evidence and are disclosed where material. Do not manipulate citations to inflate metrics.','Normal')
h(d,'3. Research ethics, consent and permissions')
add(d,'Authors must identify applicable ethics approval or exemption for research involving people and explain consent, confidentiality and risk management. Where formal review is unavailable or unnecessary, give a reasoned account of the relevant safeguards. Protect vulnerable participants and avoid publishing identifying details without a lawful basis and appropriate consent. For archival, cultural, Indigenous and community materials, consider restrictions, provenance, community interests and relevant permissions.')
add(d,'Secure rights to reproduce third-party material and to publish it on the intended open-access terms. Identify material excluded from the article licence with a clear credit line. Public availability alone does not establish a right to reproduce. Supply permission evidence to the editor privately where required.','Normal')
page(d)
h(d,'4. Funding, interests and artificial intelligence')
add(d,'Declare funding and the funder’s role, and any financial, professional, institutional or personal interest that a reasonable reader could consider relevant. A declared interest does not itself prevent publication. Editors and reviewers disclose conflicts and recuse themselves where independence is compromised. Corrections to incomplete declarations may be published.')
add(d,'Artificial-intelligence systems cannot be authors. Authors must disclose substantive generative assistance in drafting, rewriting, translation, analysis, coding or images, naming the tool, version where available, purpose and extent, and the checks performed. Routine non-generative spelling or reference-format checks do not need separate disclosure. Human authors must verify the sources, accuracy, originality, permissions and fitness of all output. Generated material must never be represented as observed primary evidence.','Normal')
add(d,'Reviewers and editors must not upload confidential manuscripts, reports, identities or unpublished data to external artificial-intelligence services without appropriate authority and safeguards. They remain responsible for their judgement. Automated detection scores, similarity percentages and stylistic impressions are not by themselves proof of misconduct. Concerns require examination of the actual evidence and an opportunity to respond.','Normal')
h(d,'5. Handling integrity concerns')
add(d,'A report should identify the article or submission, the specific concern and supporting material. Anonymous reports are considered on their evidence. The editor assesses credibility, secures relevant records, manages conflicts and seeks a response from the affected author or reviewer. Information is shared only as needed for fair assessment, institutional investigation or the protection of the scholarly record.')
add(d,'Possible outcomes include clarification, revision, rejection, correction, referral to an institution, an expression of concern or retraction. Responses must be proportionate to the findings. The journal does not promise absolute confidentiality where disclosure is necessary or legally required. Allegations about the founder or an editor require independent handling under the editorial policy.','Normal')
h(d,'6. Corrections, expressions of concern and retractions')
add(d,'Correct material errors promptly through a dated notice linked to the article. Preserve the original record and identify the changed version. A minor typographical correction may be recorded in a version note; a change affecting interpretation requires a substantive correction notice. An expression of concern may alert readers to a serious unresolved issue while a fair inquiry proceeds.')
add(d,'Retraction is appropriate where findings are unreliable, substantial plagiarism or redundant publication is established, or a serious ethical breach compromises the work. A notice identifies the affected article, who is retracting it, the reason and date. It remains freely accessible and linked to the marked article. Retraction is not used merely to punish disagreement. Removal of the underlying text is exceptional, for example where required by law or necessary to prevent serious harm; a bibliographic record and explanatory notice should remain where lawful.','Normal')
add(d,'Authors and readers may appeal or complain through '+EMAIL+'. An uninvolved person assesses procedural concerns independently. A correction request need not establish misconduct: an honest error still requires an accurate record.','Normal')
h(d,'7. Reference basis')
sources(d,[('Oxford University Press, publication ethics','https://academic.oup.com/pages/for-authors/journals/preparing-and-submitting-your-manuscript/ethics'),('Oxford University Press, author policy on AI use and disclosure','https://academic.oup.com/pages/for-authors/journals/preparing-and-submitting-your-manuscript/ai-principles-for-oxford-journals/policy-on-ai-use-and-disclosure-for-oxford-journals-authors'),('COPE, Ethical Guidelines for Peer Reviewers','https://doi.org/10.24318/cope.2019.1.9')])
save(d,'Publication_Ethics_Policy')

# 6. Access, rights, privacy and continuity.
d=new('Access, rights and privacy','Open access, fees, data and preservation')
intro(d,'The Human Question is free to read and charges authors no submission, review or publication fees. Authors retain copyright. The standard published article licence is Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 International (CC BY-NC-ND 4.0). This policy explains the resulting permissions, the journal’s email-based editorial records and the distinction between current website storage and planned long-term preservation.')
h(d,'1. Fees and funding transparency')
add(d,'There are no submission, peer-review, publication, page, colour or withdrawal fees. No purchase or donation is required for consideration or acceptance. No waiver application is necessary. Any future fee proposal must be announced clearly before it applies to new submissions; it will not be imposed retrospectively on manuscripts already submitted under this policy. Funding or sponsorship arrangements, if introduced, will be disclosed without giving sponsors control over scholarly decisions.')
h(d,'2. Copyright, licensing and permitted reuse')
add(d,'Authors retain copyright and grant the journal a non-exclusive right to publish, distribute, identify, preserve and maintain the agreed final work. The publication agreement records the rights granted. Each article states its licence and identifies third-party material that is excluded. The website’s code licence does not replace the article licence, and the article licence does not grant rights to use the journal logo as an endorsement.')
add(d,'CC BY-NC-ND 4.0 permits copying and redistribution of the licensed work in any medium for noncommercial purposes, with appropriate credit, a licence link and an indication of permitted changes. Adapted material may be made for noncommercial purposes but may not be shared under this licence. Changing file format alone is not an adaptation. Do not imply endorsement or add legal or technological restrictions that prevent uses permitted by the licence.','Normal')
add(d,'Translations and other distributed adaptations, or uses outside the noncommercial licence permission, require separate permission from the relevant rights holder unless a legal exception applies. Statutory exceptions, public-domain material and rights not covered by the licence remain unaffected. Existing licence permissions are irrevocable for compliant users; later withdrawal from the website does not cancel them. The legal code governs if this summary is incomplete.','Normal')
note(d,LICENCE)
h(d,'3. Repositories and sharing')
add(d,'Authors may share the published, unadapted article noncommercially under its licence and deposit it in an appropriate institutional or subject repository with attribution and a link to the journal record. Authors may share their own preprints and accepted manuscripts where they hold the necessary rights, with version and publication status clearly stated. The journal imposes no embargo. Do not present a preprint as the final version of record.')
page(d)
h(d,'4. Personal information and editorial confidentiality')
add(d,'The journal is operated by Albert Tan Sin Hon, President and Editor-in-Chief, in Singapore. The privacy contact is '+EMAIL+'. The journal receives names, affiliations, professional contact details, manuscripts, declarations and editorial correspondence to manage submissions, peer review, publication, integrity concerns and rights. Supply only information needed for those purposes. The journal does not sell editorial contact lists or treat a submission as consent to unrelated marketing.')
add(d,'Access to confidential submissions and reviews is limited to people who need it for the editorial process and appropriate service providers. Reviewers receive an anonymised manuscript where practicable. The public website and repository hold publication materials, not private review correspondence. Published author details, accepted articles and public notices are intentionally accessible worldwide. A correspondent’s email address is published only as agreed for the article.','Normal')
add(d,'The website uses Cloudflare hosting, and the editorial email route forwards messages to the editor’s designated mailbox. These services may process information outside Singapore. The journal must use appropriate contractual, organisational and access safeguards for service providers and any overseas transfer; provider use does not itself prove compliance. The browser-based covering-email helper processes entries locally and does not submit them to a journal server. Hosting providers may process technical logs for security and delivery.','Normal')
add(d,'The journal’s retention schedule is: unsuccessful or withdrawn submissions and routine correspondence are normally deleted or anonymised within two years after the final decision; accepted-paper decision records and publication agreements are retained while reasonably necessary to maintain the publication record and respond to rights or integrity questions. Records needed for an active dispute or legal duty may be kept longer. Review access and retention annually. Remove unnecessary personal data and restrict backup access. These are journal policy periods, not claims about a universal statutory period.','Normal')
add(d,'People may request access to or correction of their personal information, ask about use or retention, or raise a privacy concern through the editorial address. The journal will assess requests subject to applicable law, third-party confidentiality and the integrity of the publication record. Withdrawal of consent may affect the ability to process a submission. A substantiated breach will be contained, investigated and notified to relevant people or authorities where required by law.','Normal')
h(d,'5. Preservation and continuity')
add(d,'Current public files are deployed through Cloudflare Pages from the journal’s GitHub repository. Repository history and website copies support recovery but are not an independent preservation service. The journal does not currently claim participation in CLOCKSS, LOCKSS, Portico or a certified preservation programme.')
add(d,'Before releasing the first issue, the publisher should secure an additional lawful repository or preservation deposit for the final PDFs and public metadata, record its location and recovery procedure, and publish the implemented arrangement. Keep release checksums, version history and a separate recoverable copy. Check published links and backup recovery periodically. This is a preservation plan until deposits and recovery checks are actually completed.','Normal')
add(d,'If the journal ceases publication, the publisher should retain a public cessation notice, keep existing article links working where possible and transfer or deposit the publication record in a suitable repository. Any successor arrangement must respect author rights, licences and confidential editorial records. Policy changes are dated and recorded; existing article licences are not silently replaced.','Normal')
h(d,'6. Reference basis')
sources(d,[('Creative Commons, licence summary and linked legal code',LICENCE),('OASPA and partners, transparency principles, version 5','https://www.oaspa.org/resources/principles-of-transparency-and-best-practice-in-scholarly-publishing-version-5/'),('Singapore Personal Data Protection Commission, guidance and obligations','https://www.pdpc.gov.sg/')])
save(d,'Access_Rights_and_Privacy_Policy')

# 7. Reviewer instructions and reusable report.
d=new('Reviewer guide','Confidential assessment and report form')
intro(d,'Peer review helps the editor assess whether a contribution is sound, original, clear and useful to the journal’s readers. A report should explain its reasoning with enough detail for authors to respond. The editor makes the final decision. Reviews are confidential, normally double-anonymous, and should be returned by the date agreed in the invitation. Contact '+EMAIL+' if expertise, independence or timing is a concern.')
h(d,'1. Before accepting')
add(d,'Accept only if you have the necessary expertise and time. Declare any relationship, financial interest, recent collaboration, supervision, institutional connection or dispute that may affect independence. If you recognise an author, tell the editor. Do not assume that knowing a name automatically creates a conflict, or that anonymity removes a real conflict. Decline where impartiality cannot reasonably be maintained.')
add(d,'Do not delegate the review, involve a student or colleague, contact the author or share manuscript material without the editor’s prior agreement and any required confidentiality arrangements. Do not upload the paper, reports or identities to an external artificial-intelligence system. Keep unpublished ideas confidential and do not use them for personal advantage.','Normal')
h(d,'2. What to assess')
add(d,'Identify the paper’s contribution and its humanistic significance. Assess whether the argument follows, the method suits the question, sources support the claims and contrary evidence is treated fairly. Check key quotations and references within your expertise, giving precise locations for problems. Distinguish a fundamental flaw from a remediable omission and a matter of preference. A reviewer need not agree with the conclusion to judge the scholarship favourably.')
add(d,'Consider disciplinary context, clarity for a wider readership, research ethics, permissions, declarations and limits. Recommend additional references only when needed to support or test the argument. Avoid personal criticism and demands for the author to adopt your own project. Report suspected plagiarism, fabricated evidence or confidentiality problems privately to the editor with evidence; do not conduct an accusatory exchange with the author.','Normal')
h(d,'3. Write a useful report')
add(d,'Begin with a short account of the contribution and overall assessment. Organise essential changes by issue, referring to pages, paragraphs or notes. Explain why each change matters and what would address it. Put optional suggestions separately. The confidential recommendation to the editor may be accept, minor revision, major revision or reject; explain the basis. Do not promise acceptance to the author.')
note(d,'The report form on the next page may be copied into an email or editable document. Remove instructions before sending. Retain or securely dispose of review files in accordance with the editor’s instructions; do not publish the review without consent.')
page(d)
h(d,'Confidential reviewer report form')
table(d,['Record','Complete privately'],[('Manuscript reference / title','[Insert]'),('Reviewer name and affiliation','[For the editor only]'),('Relevant expertise','[Brief description]'),('Conflicts or recognised authorship','[Describe, or state none; seek advice before proceeding if necessary]'),('Date and agreed deadline','[Insert]')],[155,331])
h(d,'Report for the author')
for title,desc in [('Contribution and overall assessment','[What does this paper add, and why does it matter?]'),('Essential revisions','[Identify each substantive issue, its location, why it matters and a feasible response.]'),('Evidence and method','[Assess sources, reasoning, methods, counterarguments and limits.]'),('Presentation and optional suggestions','[Offer proportionate improvements in structure, clarity, tables or references.]')]:
    h(d,title,2); add(d,desc); add(d,'________________________________________________________________________','Small'); add(d,'________________________________________________________________________','Small')
h(d,'For the editor only')
add(d,'Recommendation: [accept / minor revision / major revision / reject]. Explain the reasons and any need for further specialist review. Flag sensitive integrity or conflict concerns here, with evidence. Comments that materially affect the decision should ordinarily be conveyed to the author in an appropriate form so that the author can respond.')
add(d,'Reviewer declaration: I have disclosed relevant interests, maintained confidentiality, and based this report on my own accountable assessment. I have not uploaded confidential review material to an external artificial-intelligence service or involved another person without authority.')
sources(d,[('Reference: COPE, Ethical Guidelines for Peer Reviewers','https://doi.org/10.24318/cope.2019.1.9')])
save(d,'Reviewer_Guide_and_Report_Form')

# 8. Agreement template: it is not executed by publication of this blank form.
d=new('Author declaration','Publication agreement and rights schedule','Agreement template · complete after acceptance')
intro(d,'This form records the author declarations and non-exclusive publication permission for an accepted contribution to The Human Question: A Journal of Humanistic Inquiry, published by Albert Tan Sin Hon, Singapore. It is completed after acceptance and before publication. Downloading this blank form does not execute an agreement. The editor and all authors must confirm the completed terms and any exceptions in writing.')
table(d,['Article record','Details to complete'],[('Article title','[Insert final title]'),('All authors, in order','[Insert names]'),('Corresponding author and email','[Insert]'),('Acceptance date / manuscript reference','[Insert confirmed details]'),('Rights holder, if not the author(s)','[Identify and attach authority]'),('Excluded third-party material','[Identify material and its separate licence or permission, or state none]')],[155,331])
h(d,'1. Author declarations')
add(d,'Each author confirms that they meet the journal’s authorship criteria, approve the final text and author order, and accept responsibility for their contribution. The work is original except for material properly acknowledged, is not simultaneously under consideration elsewhere, and any prior publication, preprint, thesis or substantial overlap has been disclosed to the editor.')
add(d,'The authors have identified funding, relevant interests, assistance, ethics approval or exemption, consent arrangements, data access restrictions and substantive artificial-intelligence use. They have checked citations, quotations and claims and obtained the rights necessary for publication. They have disclosed any material uncertainty about permissions rather than guaranteeing rights they do not hold.','Normal')
h(d,'2. Copyright and non-exclusive grant')
add(d,'Copyright remains with the author(s) or the identified rights holder. The rights holder grants the journal a non-exclusive permission to publish and distribute the agreed final article, create its publication metadata and accessible formats, deposit and preserve it, and maintain its scholarly record. Copy-editing and substantive textual changes require author approval before publication. The journal may publish corrections, expressions of concern and retraction notices in accordance with its ethics policy after a fair assessment.')
page(d)
h(d,'3. Licence for the published article')
add(d,'The agreed final article will be published under Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 International (CC BY-NC-ND 4.0), except for clearly identified third-party material. The authors authorise the journal to attach that licence notice on behalf of the rights holder. Readers may share unadapted copies noncommercially under the licence conditions. Distributed adaptations and other uses outside the licence require separate permission unless a legal exception applies.')
note(d,LICENCE)
add(d,'The authors understand that the licence is irrevocable for users who comply with its terms. Copyright is not transferred to the journal, and the non-exclusive grant does not prevent the rights holder from separately licensing their work. The journal does not acquire ownership of research data or unrelated future work. Any alternative arrangement must be recorded expressly before publication.','Normal')
h(d,'4. Fees, proof and publication metadata')
add(d,'No submission, review, publication, page, colour or withdrawal fee is payable. The corresponding author coordinates final proof approval and confirms agreement from the co-authors. The final publication record may include the authors’ names, agreed affiliations, ORCID identifiers, corresponding email, abstract, keywords, declarations and citation metadata. Confidential review correspondence is not published as part of this grant.')
add(d,'The journal will publish only assigned identifiers and confirmed dates. Acceptance and this agreement do not guarantee a particular publication date or indexing outcome. Authors should notify the editor promptly of a material error or rights concern before or after publication.','Normal')
h(d,'5. Confirmations and any agreed exceptions')
table(d,['Confirmation','Complete and return to the editor'],[('All author / rights-holder names','[Insert; attach an additional sheet if necessary]'),('Signature or explicit written confirmation','[Each author signs or provides a recorded email confirmation. The corresponding author may confirm for others only with documented authority.]'),('Date','[Insert]'),('Exceptions or additional permissions','[Record exact terms, or state none]'),('Journal acceptance of completed agreement','[Editor name, role, written confirmation and date]')],[155,331])
add(d,'Return the completed form and any permission evidence to '+EMAIL+'. Keep a copy. A disputed or incomplete permission must be resolved before release; the editor must not sign for the author. No general indemnity, copyright transfer or fee obligation is created by this template.')
note(d,'Related documents: Author Instructions; Editorial and Peer-Review Policy; Publication Ethics Policy; Access, Rights and Privacy Policy; Publication Style Guide. Version 1.0, '+DATE+'.')
save(d,'Author_Declaration_and_Publication_Agreement')
