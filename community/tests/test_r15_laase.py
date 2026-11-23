"""Runde 15, anden rettelsesrunde — låsene i den lokale udgave mod SQL Server (fund I) .

**Fund I (P3).** ``laas_bestilling`` og ``arkiv_laas_koersler`` læste ``sp_getapplock``'s returværdi; kvotelåsen
(``laas_kvote``) kaldte proceduren uden at læse den. ``sp_getapplock`` melder en lås, den IKKE fik, i sin returværdi
(-1 = timeout, -2 = annulleret, -3 = deadlock-offer, -999 = fejl) — ikke som en SQL-fejl. Ved en timeout gik
bestillingen derfor videre til optællingen af køen uden brugerens kvotelås, og to bestillinger fra samme bruger kunne
begge tælle "2 i kø" og begge blive til en kørsel.

Efter rettelsen er der ét tjek (``betroet_lager.applock``), som alle tre låse bruger: kun 0 (tildelt) og 1 (tildelt
efter ventetid) er en lås; alt andet — også et manglende eller uforståeligt svar — er en fejl, der ruller transaktionen
tilbage.

SQL Server kan ikke køres her. Testene bruger en optagende forbindelse (som ``test_arkiv.ApplockN1``): de beviser
udsagnet og hvad returværdien fører til, ikke selve ventetiden. En timeout mellem to rigtige forbindelser er ikke
afprøvet (rapporten for anden rettelsesrunde).

Kør: ``cd community && python -m unittest discover -s tests -t tests`` (kræver sqlalchemy).
"""

from __future__ import annotations

import unittest

import hjaelp as H  # noqa: F401 — sætter datamappen op, før appen importeres
from fjernvarme_app.betroet_lager import SqlTransaktion

B = "aaaaaaaa-0000-4000-8000-000000000001"


class _Svar:
    def __init__(self, rc):
        self.rc = rc

    def scalar(self):
        return self.rc


class _Cn:
    """En forbindelse, der optager hvert udsagn og svarer med en fast returværdi."""

    def __init__(self, rc):
        self.rc, self.sql, self.params = rc, [], []

    def execute(self, q, params=None):
        self.sql.append(str(q))
        self.params.append(params)
        return _Svar(self.rc)


class _Db:
    dialekt = "mssql"


def tx(rc):
    cn = _Cn(rc)
    return SqlTransaktion(_Db(), cn), cn


#: (navn, kald) for hver af de tre applåse i den lokale udgave.
LAASE = (
    ("kvote", lambda t: t.laas_kvote("a@lokal")),
    ("bestilling", lambda t: t.laas_bestilling(B)),
    ("arkiv", lambda t: t.arkiv_laas_koersler([B])),
)


class FundIReturvaerdi(unittest.TestCase):
    def test_en_laas_der_ikke_blev_givet_er_en_fejl_for_alle_tre_laase(self):
        """Før rettelsen: kvotelåsen kastede ikke for nogen af dem (udsagnet læste slet ikke returværdien)."""
        for navn, kald in LAASE:
            for rc in (-1, -2, -3, -999, None, "x", 2, 0.5, True):
                t, cn = tx(rc)
                with self.assertRaises(RuntimeError, msg=f"{navn}: rc={rc!r}") as e:
                    kald(t)
                self.assertIn("sp_getapplock", str(e.exception))
                self.assertEqual(len(cn.sql), 1, navn)

    def test_udsagnet_laeser_returvaerdien(self):
        for navn, kald in LAASE:
            t, cn = tx(0)
            kald(t)
            self.assertIn("EXEC @rc = sp_getapplock", cn.sql[0], navn)
            self.assertIn("SELECT @rc", cn.sql[0], navn)
            self.assertIn("@LockOwner = 'Transaction'", cn.sql[0], navn)
            self.assertIn("@LockMode = 'Exclusive'", cn.sql[0], navn)

    def test_tildelt_og_tildelt_efter_ventetid_gaar_videre(self):
        for navn, kald in LAASE:
            for rc in (0, 1):
                t, _ = tx(rc)
                kald(t)                                    # kaster ikke

    def test_ressourcerne_er_hver_sit_rum(self):
        """Tre rum, så en bestillings lås aldrig kan forveksles med en kørsels eller en brugers."""
        ud = []
        for _, kald in LAASE:
            t, cn = tx(0)
            kald(t)
            ud.append(cn.params[0]["k"])
        self.assertEqual(ud, ["fjv_kvote:a@lokal", "fjv_bestilling:" + B, "fjv_arkiv:" + B])


if __name__ == "__main__":
    unittest.main()
