"""Én solver ad gangen — lokalt med en OS-fillås (KONTRAKT §6c, ``fjv.lager.Laas``).

Fabric bruger SQL-applocken ``fjv_solver`` (session-ejet: dør processen, frigiver SQL Server låsen).
Her er det samme løfte givet af operativsystemet: ``msvcrt.locking`` (Windows) / ``fcntl.flock`` (POSIX)
på ``<datamappe>/fjv_solver.lock``. Låsen er ejet af den åbne filhandle; dør processen, lukker OS'et
handlen, og låsen er fri. Det virker ens for sqlite, postgresql og mssql, fordi den ikke bor i databasen.

``tabt`` sættes aldrig af sig selv (en fillås kan ikke "glide" som en SQL-session); den findes, fordi
protokollen kræver den, og fordi ``frigiv`` sætter den, så en hjerteslagstråd, der overlever sit job,
stopper sin solver.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path

NAVN = "fjv_solver.lock"


class FilLaas:
    def __init__(self, sti: Path):
        self.sti = Path(sti)
        self.tabt = threading.Event()
        self._fd: int | None = None
        self._ved_tab: list = []
        self._mutex = threading.Lock()

    # -------------------------------------------------- OS-delen
    def _tag_os(self, fd: int) -> bool:
        if os.name == "nt":
            import msvcrt
            try:
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                return True
            except OSError:
                return False
        import fcntl
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except OSError:
            return False

    def _frigiv_os(self, fd: int) -> None:
        if os.name == "nt":
            import msvcrt
            try:
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
        else:
            import fcntl
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except OSError:
                pass

    # -------------------------------------------------- protokollen
    def tag(self) -> bool:
        with self._mutex:
            if self._fd is not None:
                return True
            self.sti.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(str(self.sti), os.O_RDWR | os.O_CREAT, 0o644)
            if os.fstat(fd).st_size == 0:
                os.write(fd, b"\0")
            if not self._tag_os(fd):
                os.close(fd)
                return False
            self._fd = fd
            self.tabt.clear()
            return True

    def holdt(self) -> bool:
        return self._fd is not None and not self.tabt.is_set()

    def frigiv(self) -> None:
        with self._mutex:
            fd, self._fd = self._fd, None
        if fd is not None:
            self._frigiv_os(fd)
            os.close(fd)
            self._marker_tabt()

    def start_vagt(self, interval_s: float | None = None) -> None:
        """Intet at vogte: OS'et holder låsen, så længe processen lever."""

    def ved_tab(self, funktion) -> None:
        self._ved_tab.append(funktion)
        if self.tabt.is_set():
            funktion()

    def afmeld(self, funktion) -> None:
        try:
            self._ved_tab.remove(funktion)
        except ValueError:
            pass

    def _marker_tabt(self) -> None:
        if not self.tabt.is_set():
            self.tabt.set()
            for f in list(self._ved_tab):
                try:
                    f()
                except Exception:
                    pass


def er_fri(sti: Path) -> bool:
    """Test (som ``solverLåsFri`` i motor.ts): tag låsen med det samme og frigiv den igen."""
    l = FilLaas(sti)
    if not l.tag():
        return False
    l.frigiv()
    return True
