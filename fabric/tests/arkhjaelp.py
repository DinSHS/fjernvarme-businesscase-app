"""Et lille .xlsx til testene — kun standardbiblioteket (zip + XML), som et regneark gemmer det.

``skriv_xlsx(sti, {"Anlaeg": {"A4": "navn", "C5": 12.5, "D5": True}})`` skriver tekst som delte strenge (som Excel)
eller inline (``inline=True``, som appens eksport), tal som tal og sand/falsk som boolske celler. ``skjulte`` er
arknavne med ``state="hidden"`` (appens markering ``_app``).
"""
from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

_HOVED = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
_NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
_NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


def _raekke(ref: str) -> int:
    return int(re.sub(r"^[A-Z]+", "", ref))


def _kol(ref: str) -> int:
    n = 0
    for c in re.match(r"^[A-Z]+", ref).group(0):
        n = n * 26 + ord(c) - 64
    return n


def skriv_xlsx(sti: Path, ark: dict, *, inline: bool = False, skjulte: tuple = ()) -> Path:
    delte: list[str] = []

    def celle(ref: str, v) -> str:
        if isinstance(v, bool):
            return f'<c r="{ref}" t="b"><v>{int(v)}</v></c>'
        if isinstance(v, (int, float)):
            return f'<c r="{ref}"><v>{v!r}</v></c>'
        if inline:
            return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>'
        if v not in delte:
            delte.append(v)
        return f'<c r="{ref}" t="s"><v>{delte.index(v)}</v></c>'

    filer = {}
    for i, (navn, celler) in enumerate(ark.items(), start=1):
        raekker: dict[int, list] = {}
        for ref, v in celler.items():
            if v is not None:
                raekker.setdefault(_raekke(ref), []).append((_kol(ref), ref, v))
        data = "".join(f'<row r="{r}">' + "".join(celle(ref, v) for _k, ref, v in sorted(cs)) + "</row>"
                       for r, cs in sorted(raekker.items()))
        filer[f"xl/worksheets/sheet{i}.xml"] = f"{_HOVED}<worksheet {_NS}><sheetData>{data}</sheetData></worksheet>"
    filer["xl/workbook.xml"] = (
        f"{_HOVED}<workbook {_NS} {_NS_R}><sheets>"
        + "".join(f'<sheet name="{escape(n)}" sheetId="{i}" state="{"hidden" if n in skjulte else "visible"}" r:id="rId{i}"/>'
                  for i, n in enumerate(ark, start=1))
        + "</sheets></workbook>")
    filer["xl/_rels/workbook.xml.rels"] = (
        f'{_HOVED}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
                  f'relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(ark) + 1))
        + (f'<Relationship Id="rId{len(ark) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
           'relationships/sharedStrings" Target="sharedStrings.xml"/>' if delte else "")
        + "</Relationships>")
    if delte:
        filer["xl/sharedStrings.xml"] = (f'{_HOVED}<sst {_NS} count="{len(delte)}" uniqueCount="{len(delte)}">'
                                         + "".join(f'<si><t xml:space="preserve">{escape(t)}</t></si>' for t in delte)
                                         + "</sst>")
    filer["[Content_Types].xml"] = (
        f'{_HOVED}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.'
        'spreadsheetml.sheet.main+xml"/>'
        + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-'
                  'officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, len(ark) + 1))
        + "</Types>")
    filer["_rels/.rels"] = (
        f'{_HOVED}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
        'officeDocument" Target="xl/workbook.xml"/></Relationships>')
    sti.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(sti, "w", zipfile.ZIP_DEFLATED) as z:
        for navn, tekst in filer.items():
            z.writestr(navn, tekst)
    return sti
