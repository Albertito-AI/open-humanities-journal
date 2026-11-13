"""Reject active PDF/SVG content and malformed PDF marked-content syntax.

This is not a malware scanner. Parse locally without rendering or fetching links.
Run each file in a bounded
child process so a malformed document cannot indefinitely block CI.
"""
from pathlib import Path
import argparse
import subprocess
import sys
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit
from pypdf import PdfReader
from pypdf.generic import (IndirectObject, DictionaryObject, ArrayObject,
                           ContentStream, NameObject, StreamObject)

MAX_BYTES = 100 * 1024 * 1024
FORBIDDEN_KEYS = {'/JS', '/JavaScript', '/AA', '/OpenAction', '/AcroForm', '/XFA',
                  '/EmbeddedFiles', '/EF', '/RichMediaContent', '/RichMediaSettings',
                  '/Collection', '/3DD', '/RichMedia', '/Launch'}
FORBIDDEN_TYPES = {'/EmbeddedFile', '/RichMedia', '/3D', '/Movie', '/Sound', '/Screen', '/FileAttachment'}
SAFE_SVG = {'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
            'polygon', 'text', 'tspan', 'title', 'desc', 'defs', 'linearGradient',
            'radialGradient', 'stop', 'clipPath', 'mask', 'symbol', 'use'}

def safe_link(value):
    value = str(value)
    if any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError('control character in a link')
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {'https', 'http', 'mailto'}:
        raise ValueError('unsafe link protocol')
    if parsed.scheme.lower() in {'https', 'http'} and (not parsed.hostname or parsed.username or parsed.password):
        raise ValueError('invalid or credential-bearing link')

def audit_marked_content(stream, reader):
    """Check tagged drawing syntax without interpreting image or font bytes."""
    nesting = 0
    for operands, operator in ContentStream(stream, reader).operations:
        if operator == b'BMC':
            if len(operands) != 1 or not isinstance(operands[0], NameObject):
                raise ValueError('invalid PDF BMC tag operands')
            nesting += 1
        elif operator == b'BDC':
            if (len(operands) != 2 or not isinstance(operands[0], NameObject)
                    or not isinstance(operands[1], (NameObject, DictionaryObject))):
                raise ValueError('invalid PDF BDC tag/property operands')
            nesting += 1
        elif operator == b'EMC':
            if operands or nesting == 0:
                raise ValueError('unbalanced PDF marked content or invalid EMC operands')
            nesting -= 1
    if nesting:
        raise ValueError('unclosed PDF marked content')

def audit_pdf(path):
    reader = PdfReader(path, strict=True)
    if reader.is_encrypted:
        raise ValueError('encrypted PDFs cannot be inspected')
    seen, stack, count = set(), [(reader.trailer, 0)], 0
    while stack:
        obj, depth = stack.pop()
        count += 1
        if count > 200000 or depth > 150:
            raise ValueError('PDF inspection complexity limit exceeded')
        if isinstance(obj, IndirectObject):
            key = (obj.idnum, obj.generation)
            if key in seen:
                continue
            seen.add(key)
            stack.append((obj.get_object(), depth + 1))
        elif isinstance(obj, DictionaryObject):
            if FORBIDDEN_KEYS.intersection(obj.keys()):
                raise ValueError('active content, embedded files or interactive forms in PDF')
            if str(obj.get('/Type', '')) in FORBIDDEN_TYPES or str(obj.get('/Subtype', '')) in FORBIDDEN_TYPES:
                raise ValueError('unsupported interactive PDF object')
            # /S also occurs in structural dictionaries; treat it as an action
            # only when its value names an action, or /Type explicitly says so.
            action = str(obj.get('/S', ''))
            if action in {'/JavaScript', '/Launch', '/GoToR', '/GoToE', '/SubmitForm', '/ImportData',
                          '/Rendition', '/Movie', '/Sound', '/Named', '/SetOCGState', '/Hide', '/ResetForm'}:
                raise ValueError('unsafe PDF action')
            if str(obj.get('/Type', '')) == '/Action' and action not in {'/URI', '/GoTo'}:
                raise ValueError('unrecognised PDF action')
            if '/URI' in obj:
                safe_link(obj['/URI'])
            if isinstance(obj, StreamObject) and obj.get('/Subtype') == '/Form':
                audit_marked_content(obj, reader)
            stack.extend((value, depth + 1) for value in obj.values())
        elif isinstance(obj, ArrayObject):
            stack.extend((value, depth + 1) for value in obj)
    if not reader.pages:
        raise ValueError('PDF has no pages')
    for page in reader.pages:
        if '/Contents' in page:
            # A page's stream array is one logical stream; tags may span entries.
            audit_marked_content(page['/Contents'], reader)

def audit_svg(path):
    data = path.read_bytes()
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('SVG document types/entities are prohibited')
    root = ET.fromstring(data)
    for node in root.iter():
        if node.tag.rsplit('}', 1)[-1] not in SAFE_SVG:
            raise ValueError('unsupported or active SVG element')
        for name, value in node.attrib.items():
            name = name.rsplit('}', 1)[-1].lower()
            if name.startswith('on') or name == 'style':
                raise ValueError('SVG event handlers and inline CSS are prohibited')
            if name in {'href', 'src'} and not value.startswith('#'):
                raise ValueError('SVG external references are prohibited')
            if 'url(' in value.lower() and not value.startswith('url(#'):
                raise ValueError('SVG external paint reference is prohibited')

def audit_file(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('asset must be a regular non-symlink file')
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('asset exceeds 100 MB')
    suffix = path.suffix.lower()
    if suffix == '.pdf':
        audit_pdf(path)
    elif suffix == '.svg':
        audit_svg(path)
    elif suffix in {'.docx', '.doc', '.docm', '.zip', '.html', '.js', '.css'}:
        raise ValueError('editable, archived or executable public asset prohibited')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    parser.add_argument('--single', action='store_true')
    args = parser.parse_args()
    if args.single:
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
            resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
        except ImportError:
            pass  # CI uses Linux; other platforms retain the parent timeout.
        audit_file(args.path)
        return
    count = 0
    for path in sorted(args.path.rglob('*')):
        if path.is_symlink():
            raise ValueError('symbolic links are prohibited')
        if path.is_file():
            # No shell, no network, 20 seconds per file, 100 MB file-size ceiling.
            subprocess.run([sys.executable, __file__, '--single', str(path)], check=True, timeout=20,
                           stdout=subprocess.DEVNULL)
            count += 1
    print(f'Inspected {count} public files; PDF/SVG active-content checks passed.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Public asset security check failed: {error}', file=sys.stderr)
        sys.exit(1)
