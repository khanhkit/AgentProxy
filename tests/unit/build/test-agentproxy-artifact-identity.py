#!/usr/bin/env python3
"""Fast synthetic gates for binary-safe generated and npm artifact scanning."""

from io import BytesIO
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[3]
SCANNER = REPO / "scripts/check/verify-agentproxy-artifacts.py"
BUILD_SHA = "565e0dc"
BANNED = b"omni" + b"route"


def write_tar(path: Path, *, files: dict[str, bytes]) -> None:
    with tarfile.open(path, "w:gz") as archive:
        for name, content in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(content)
            archive.addfile(entry, BytesIO(content))


def invoke(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-B", str(SCANNER), *map(str, args)],
        text=True,
        capture_output=True,
        check=False,
    )


class TestArtifactIdentity(unittest.TestCase):
    def test_binary_safe_clean_directory_and_exact_tar_sha(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            generated = root / "generated"
            generated.mkdir()
            (generated / "module.bin").write_bytes(b"\0\x01\x02safe-payload\0")
            package = root / "agentproxy.tgz"
            write_tar(package, files={
                "package/dist/BUILD_SHA": BUILD_SHA.encode(),
                "package/dist/module.bin": b"\0\x01\x02safe-payload\0",
            })
            result = invoke("--dir", generated, "--tar", package, "--build-sha", BUILD_SHA)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("forbidden_hits=0", result.stdout)

    def test_rejects_mismatched_generated_stamp(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            generated = root / "generated"
            generated.mkdir()
            stamp = generated / "BUILD_SHA"
            stamp.write_text("1111111")
            package = root / "package.tgz"
            write_tar(package, files={"package/dist/BUILD_SHA": BUILD_SHA.encode()})
            result = invoke("--dir", generated, "--stamp", stamp, "--tar", package, "--build-sha", BUILD_SHA)
            self.assertEqual(result.returncode, 1)
            self.assertIn("generated BUILD_SHA mismatch", result.stderr)

    def test_detects_binary_token_across_chunk_boundary(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "module.bin").write_bytes(b"\0" + b"x" * (1024 * 1024 - 5) + BANNED)
            result = invoke("--dir", root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("forbidden identity", result.stderr)

    def test_detects_forbidden_filename(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / ((b"OMNI" + b"ROUTE").decode() + ".txt")).write_text("safe")
            result = invoke("--dir", root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("forbidden identity", result.stderr)

    def test_detects_forbidden_content_inside_tar_member(self):
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / "package.tgz"
            write_tar(package, files={
                "package/dist/BUILD_SHA": BUILD_SHA.encode(),
                "package/dist/module.bin": b"binary\0" + BANNED,
            })
            result = invoke("--tar", package, "--build-sha", BUILD_SHA)
            self.assertEqual(result.returncode, 1)
            self.assertIn("forbidden identity", result.stderr)

    def test_rejects_missing_or_mismatched_embedded_build_sha(self):
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / "package.tgz"
            write_tar(package, files={"package/dist/BUILD_SHA": b"1111111"})
            result = invoke("--tar", package, "--build-sha", BUILD_SHA)
            self.assertEqual(result.returncode, 1)
            self.assertIn("BUILD_SHA mismatch", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
