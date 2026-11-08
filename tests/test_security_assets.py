import importlib.util
from pathlib import Path
import tempfile
import unittest
from pypdf import PdfWriter
from pypdf.generic import NameObject, DictionaryObject, TextStringObject

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
