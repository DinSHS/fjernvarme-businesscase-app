"""``logik`` skal kunne køre på Python 3.11 (brief 21 pkt. 3: 3.11–3.13, samme som modellen).

Her findes kun 3.13, og den accepterer PEP 701-f-strenge (3.12+), som er SYNTAKSFEJL i 3.11: samme anførselstegn
genbrugt inde i et udtryk (``f"{d["x"]}"``) og en backslash i et udtryk (``f"{'\\n'.join(x)}"``). Tokenizeren i
3.12+ viser f-strengens indre (``FSTRING_START`` … ``FSTRING_END``), så de to former kan findes statisk.
"""

from __future__ import annotations

import io
import sys
import tokenize
import unittest
from pathlib import Path

LOGIK = Path(__file__).resolve().parents[1]


def brud_311(kilde: str) -> list[str]:
    if not hasattr(tokenize, "FSTRING_START"):            # 3.11 selv: compile() i testen nedenfor er nok
        return []
    ud, stak = [], []                                      # stak: (anførselstegn, dybde i {})
    for tok in tokenize.generate_tokens(io.StringIO(kilde).readline):
        if tok.type == tokenize.FSTRING_START:
            q = tok.string.lstrip("rRbBfF")
            if stak and stak[-1][1] > 0 and q[0] == stak[-1][0][0]:
                ud.append(f"linje {tok.start[0]}: indlejret f-streng med samme anførselstegn")
            stak.append([q, 0])
        elif tok.type == tokenize.FSTRING_END:
            stak.pop()
        elif stak:
            top = stak[-1]
            if tok.type == tokenize.OP and tok.string == "{":
                top[1] += 1
            elif tok.type == tokenize.OP and tok.string == "}":
                top[1] = max(0, top[1] - 1)
            elif top[1] > 0 and tok.type == tokenize.STRING:
                s = tok.string.lstrip("rRbBuU")
                if len(top[0]) == 1 and s[0] == top[0][0]:
                    ud.append(f"linje {tok.start[0]}: {tok.string[:30]} genbruger f-strengens anførselstegn")
                if "\\" in tok.string:
                    ud.append(f"linje {tok.start[0]}: backslash i et f-strengs-udtryk")
    return ud


class TestPython311(unittest.TestCase):
    def test_ingen_pep701_f_strenge(self):
        fund = []
        for p in sorted(LOGIK.rglob("*.py")):
            for f in brud_311(p.read_text(encoding="utf-8")):
                fund.append(f"{p.relative_to(LOGIK)}: {f}")
        self.assertFalse(fund, "\n".join(fund))

    def test_detektoren_virker(self):
        if sys.version_info < (3, 12):
            self.skipTest("formerne kan ikke engang tokeniseres før 3.12")
        self.assertTrue(brud_311('x = f"{d["a"]}"\n'))
        self.assertTrue(brud_311("x = f\"{'\\\\n'.join(y)}\"\n"))
        self.assertFalse(brud_311("x = f\"{d['a']}\"\n"))
        self.assertFalse(brud_311("x = f'{d[\"a\"]}'\n"))


if __name__ == "__main__":
    unittest.main()
