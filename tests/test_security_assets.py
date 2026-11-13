import importlib.util
from pathlib import Path
import tempfile
import unittest
from pypdf import PdfWriter
from pypdf.generic import (NameObject, DictionaryObject, TextStringObject,
                           DecodedStreamObject, ArrayObject, NumberObject)

spec = importlib.util.spec_from_file_location('asset_audit', Path(__file__).resolve().parents[1] / 'scripts/audit_public_assets.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class PublicAssetSecurity(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def pdf(self, modify=lambda w: None):
        writer = PdfWriter()
        writer.add_blank_page(width=595, height=842)
        modify(writer)
        path = self.root / 'paper.pdf'
        writer.write(path)
        return path

    def test_normal_pdf_is_accepted(self):
        audit.audit_file(self.pdf())

    def content_pdf(self, data, nested_form=False):
        def modify(w):
            stream = DecodedStreamObject()
            stream.set_data(data)
            if nested_form:
                for name in ['/Inner', '/Outer']:
                    stream.update({
                        NameObject('/Type'): NameObject('/XObject'),
                        NameObject('/Subtype'): NameObject('/Form'),
                        NameObject('/BBox'): ArrayObject([NumberObject(n) for n in [0, 0, 595, 842]]),
                    })
                    resources = DictionaryObject({NameObject('/XObject'): DictionaryObject({NameObject(name): w._add_object(stream)})})
                    stream = DecodedStreamObject()
                    stream.set_data((name + ' Do').encode())
                    stream[NameObject('/Resources')] = resources
                w.pages[0][NameObject('/Resources')] = resources
            w.pages[0][NameObject('/Contents')] = w._add_object(stream)
        return self.pdf(modify)

    def test_unescaped_tag_parentheses_in_nested_form_rejected(self):
        data = b'/Abstract#20Heading#20(WW)<</MCID 5>>BDC EMC'
        with self.assertRaisesRegex(ValueError, 'BDC'):
            audit.audit_file(self.content_pdf(data, nested_form=True))

    def test_escaped_tag_parentheses_in_nested_form_accepted(self):
        data = b'/Abstract#20Heading#20#28WW#29<</MCID 5>>BDC EMC'
        audit.audit_file(self.content_pdf(data, nested_form=True))

    def test_page_marked_content_operand_types_and_balance(self):
        for data in [b'(Span) BMC EMC', b'/Span 7 BDC EMC', b'EMC',
                     b'/Span BMC', b'/Span BMC 1 EMC']:
            with self.subTest(data=data), self.assertRaises(ValueError):
                audit.audit_file(self.content_pdf(data))
        audit.audit_file(self.content_pdf(b'/Span BMC /Span <</MCID 0>> BDC EMC EMC'))

    def test_marked_content_may_span_page_content_streams(self):
        def modify(w):
            streams = ArrayObject()
            for data in [b'/Span BMC', b'EMC']:
                stream = DecodedStreamObject()
                stream.set_data(data)
                streams.append(w._add_object(stream))
            w.pages[0][NameObject('/Contents')] = streams
        audit.audit_file(self.pdf(modify))

    def test_image_and_font_streams_are_not_parsed_as_drawing_operators(self):
        def modify(w):
            for name, subtype in [('/ImageData', '/Image'), ('/FontData', '/Type1C')]:
                stream = DecodedStreamObject()
                stream.set_data(b'(binary data) BMC')
                stream[NameObject('/Subtype')] = NameObject(subtype)
                w.root_object[NameObject(name)] = w._add_object(stream)
        audit.audit_file(self.pdf(modify))

    def test_javascript_is_rejected(self):
        with self.assertRaises(ValueError):
            audit.audit_file(self.pdf(lambda w: w.root_object.update({NameObject('/OpenAction'): DictionaryObject({NameObject('/S'): NameObject('/JavaScript'), NameObject('/JS'): TextStringObject('fixture')})})))

    def test_embedded_attachment_is_rejected(self):
        with self.assertRaises(ValueError):
            audit.audit_file(self.pdf(lambda w: w.add_attachment('fixture.txt', b'benign test fixture')))

    def test_encrypted_pdf_is_rejected(self):
        with self.assertRaises(ValueError):
            audit.audit_file(self.pdf(lambda w: w.encrypt('test-fixture-only')))

    def test_nested_launch_action_is_rejected(self):
        def modify(w):
            w.root_object[NameObject('/TestNested')] = w._add_object(DictionaryObject({NameObject('/S'): NameObject('/Launch')}))
        with self.assertRaises(ValueError):
            audit.audit_file(self.pdf(modify))

    def test_hyperlinks_preserved_and_unsafe_protocols_rejected(self):
        for value in ['https://doi.org/10.1234/example', 'https://thehumanquestionjournal.com/', 'mailto:editor@thehumanquestionjournal.com']:
            audit.safe_link(value)
        for value in ['javascript:alert(1)', 'file:///tmp/file', 'data:text/html,test', 'https://example.org/\n', 'https://user:password@example.org']:
            with self.assertRaises(ValueError): audit.safe_link(value)

    def test_svg_script_event_and_external_content_rejected(self):
        path = self.root / 'logo.svg'
        for body in ['<script>fixture</script>', '<rect onclick="fixture"/>', '<use href="https://example.org/logo.svg"/>', '<foreignObject/>']:
            path.write_text('<svg xmlns="http://www.w3.org/2000/svg">'+body+'</svg>')
            with self.assertRaises(ValueError): audit.audit_file(path)
        path.write_text('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="10"/></svg>')
        audit.audit_file(path)

    def test_editable_downloads_rejected(self):
        path = self.root / 'guide.docx'; path.write_bytes(b'fixture')
        with self.assertRaises(ValueError): audit.audit_file(path)
