"""Классификация/валидация/хранение вложений (services/attachment_storage.py)."""
import io
import zipfile
from pathlib import Path

import pytest

from app.services import attachment_storage as st
from app.services.attachment_storage import (
    AttachmentRejected, MAX_ATTACHMENT_SIZE, MAX_INLINE_TEXT_BYTES,
    classify_attachment, resolve_attachment_path, sanitize_filename, save_attachment_file,
)


def _zip(names: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for n in names:
            z.writestr(n, "x")
    return buf.getvalue()


def test_code_is_classified_by_extension_case_insensitive():
    f = classify_attachment("Main.PY", "print('привет')\n".encode())
    assert (f.kind, f.language, f.mime_type, f.ext) == ("code", "python", "text/plain", "py")
    assert f.text_content == "print('привет')\n" and f.filename == "Main.PY"


@pytest.mark.parametrize("name,mime", [("n.txt", "text/plain"), ("n.md", "text/markdown"), ("n.csv", "text/csv")])
def test_text_documents_keep_inline_text(name, mime):
    f = classify_attachment(name, b"a,b\n1,2\n")
    assert (f.kind, f.mime_type, f.language) == ("document", mime, None)
    assert f.text_content == "a,b\n1,2\n"


def test_pdf_requires_magic_bytes():
    ok = classify_attachment("a.pdf", b"%PDF-1.7\n...")
    assert (ok.kind, ok.mime_type, ok.text_content) == ("document", "application/pdf", None)
    with pytest.raises(AttachmentRejected):
        classify_attachment("a.pdf", b"just text")


def test_docx_and_xlsx_require_matching_zip_structure():
    assert classify_attachment("a.docx", _zip(["word/document.xml"])).kind == "document"
    assert classify_attachment("a.xlsx", _zip(["xl/workbook.xml"])).kind == "document"
    with pytest.raises(AttachmentRejected):
        classify_attachment("a.docx", _zip(["x.txt"]))
    with pytest.raises(AttachmentRejected):
        classify_attachment("a.xlsx", _zip(["word/document.xml"]))
    with pytest.raises(AttachmentRejected):
        classify_attachment("a.docx", b"not a zip")


def test_plain_zip_is_other():
    f = classify_attachment("a.zip", _zip(["a.txt"]))
    assert (f.kind, f.mime_type, f.text_content) == ("other", "application/zip", None)
    with pytest.raises(AttachmentRejected):
        classify_attachment("a.zip", b"not a zip")


@pytest.mark.parametrize("name", ["a.html", "a.htm", "a.svg", "a.xml", "a.exe", "a.js.exe", "noext", ".."])
def test_unsupported_types_are_rejected(name):
    with pytest.raises(AttachmentRejected):
        classify_attachment(name, b"hello")


@pytest.mark.parametrize("name", ["a.png", "a.JPG", "a.webp", "a.heic"])
def test_images_are_rejected_with_pointer_to_images(name):
    with pytest.raises(AttachmentRejected, match="зображени"):
        classify_attachment(name, b"\x89PNG....")


def test_dockerfile_without_extension_is_code():
    f = classify_attachment("Dockerfile", b"FROM python:3.12\n")
    assert (f.kind, f.language) == ("code", "dockerfile")


def test_nul_bytes_and_non_utf8_are_rejected_for_text():
    with pytest.raises(AttachmentRejected):
        classify_attachment("a.py", b"print(1)\x00")
    with pytest.raises(AttachmentRejected):
        classify_attachment("a.txt", "привет".encode("cp1251"))


def test_size_limits():
    with pytest.raises(AttachmentRejected):
        classify_attachment("a.py", b"")
    with pytest.raises(AttachmentRejected):
        classify_attachment("a.py", b"x" * (MAX_ATTACHMENT_SIZE + 1))


def test_large_text_is_accepted_but_not_inlined():
    raw = b"x = 1\n" * (MAX_INLINE_TEXT_BYTES // 6 + 10)
    assert len(raw) > MAX_INLINE_TEXT_BYTES
    f = classify_attachment("big.py", raw)
    assert f.kind == "code" and f.text_content is None and f.size_bytes == len(raw)


def test_bom_is_stripped_from_inline_text():
    assert classify_attachment("a.py", b"\xef\xbb\xbfprint(1)").text_content == "print(1)"


@pytest.mark.parametrize("raw,expected", [
    ("../../etc/passwd", "passwd"),
    ("C:\\Users\\x\\a.py", "a.py"),
    ("a\x00b\n.py", "ab.py"),
    (None, "file"),
    ("", "file"),
])
def test_sanitize_filename(raw, expected):
    assert sanitize_filename(raw) == expected


def test_sanitize_filename_truncates_but_keeps_extension():
    out = sanitize_filename("a" * 400 + ".py")
    assert len(out) <= 255 and out.endswith(".py")


def test_save_uses_server_generated_name_and_resolve_rejects_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "ATTACHMENTS_DIR", str(tmp_path / "att"))
    name = save_attachment_file(b"data", "py")
    assert name.endswith(".py") and "/" not in name and len(name) == 32 + 3
    assert Path(resolve_attachment_path(name)).read_bytes() == b"data"
    for bad in ["../x", "a/b", "", "..", "."]:
        with pytest.raises(ValueError):
            resolve_attachment_path(bad)
