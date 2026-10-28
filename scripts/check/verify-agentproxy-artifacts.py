#!/usr/bin/env python3
"""Binary-safe identity gate for generated directories and one canonical npm tarball."""

import argparse
import hashlib
import os
from pathlib import Path
import re
import sys
import tarfile

TOKENS = (b"omni" + b"route", b"omni" + b"router", b"ommi" + b"router")
WINDOW = max(map(len, TOKENS)) - 1
BLOCK_SIZE = 1024 * 1024


class IdentityViolation(ValueError):
    pass


def assert_clean_bytes(data: bytes, location: str) -> None:
    if any(token in data.lower() for token in TOKENS):
        raise IdentityViolation(f"forbidden identity in {location}")


def scan_content(stream, location: str) -> int:
    previous = b""
    count = 0
    while chunk := stream.read(BLOCK_SIZE):
        count += len(chunk)
        assert_clean_bytes(previous + chunk, location)
        previous = (previous + chunk)[-WINDOW:]
    return count


def scan_directory(root: Path) -> tuple[int, int]:
    if not root.is_dir():
        raise ValueError(f"missing generated directory: {root}")
    files = 0
    total_bytes = 0
    for current, directories, filenames in os.walk(root, followlinks=False):
        for name in directories + filenames:
            path = Path(current) / name
            relative = path.relative_to(root).as_posix()
            assert_clean_bytes(os.fsencode(relative), f"path {root}/{relative}")
            if path.is_symlink():
                assert_clean_bytes(os.fsencode(os.readlink(path)), f"symlink target {path}")
        for name in filenames:
            path = Path(current) / name
            if path.is_symlink():
                continue
            if not path.is_file():
                raise ValueError(f"unsupported artifact type: {path}")
            with path.open("rb") as f:
                total_bytes += scan_content(f, str(path))
            files += 1
    return files, total_bytes


def scan_tarball(archive: Path, expected_sha: str) -> tuple[int, int, str]:
    if not archive.is_file():
        raise ValueError(f"missing canonical tarball: {archive}")
    files = 0
    total_bytes = 0
    build_shas = []
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar:
            assert_clean_bytes(member.name.encode("utf-8"), f"tar member {member.name}")
            if member.linkname:
                assert_clean_bytes(member.linkname.encode("utf-8"), f"tar link {member.name}")
            if not member.isfile():
                continue
            stream = tar.extractfile(member)
            if stream is None:
                raise ValueError(f"unreadable tar member: {member.name}")
            with stream:
                if member.name == "package/dist/BUILD_SHA":
                    # Read the stamp without changing the binary-safe scanning path.
                    value = stream.read()
                    assert_clean_bytes(value, member.name)
                    build_shas.append(value.strip())
                    total_bytes += len(value)
                else:
                    total_bytes += scan_content(stream, f"tar member {member.name}")
            files += 1
    if len(build_shas) != 1 or build_shas[0] != expected_sha.encode("ascii"):
        raise IdentityViolation(
            f"tarball BUILD_SHA mismatch: expected exactly one package/dist/BUILD_SHA={expected_sha}"
        )
    with archive.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    return files, total_bytes, digest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", action="append", type=Path, default=[])
    parser.add_argument("--tar", type=Path)
    parser.add_argument("--stamp", action="append", type=Path, default=[])
    parser.add_argument("--build-sha", help="expected seven-character Git commit prefix")
    args = parser.parse_args()
    if not args.dir and not args.tar:
        parser.error("at least one --dir or --tar must be supplied")
    if args.tar and not args.build_sha:
        parser.error("--tar requires --build-sha")
    if args.stamp and not args.build_sha:
        parser.error("--stamp requires --build-sha")
    if args.build_sha and not re.fullmatch(r"[0-9a-f]{7}", args.build_sha):
        parser.error("--build-sha must be a seven-character lowercase hex prefix")
    try:
        scanned_files = 0
        scanned_bytes = 0
        for stamp in args.stamp:
            if stamp.read_bytes().strip() != args.build_sha.encode("ascii"):
                raise IdentityViolation(f"generated BUILD_SHA mismatch: {stamp}")
            print(f"[artifact-identity] generated BUILD_SHA={stamp}: {args.build_sha}")
        for root in args.dir:
            files, size = scan_directory(root)
            scanned_files += files
            scanned_bytes += size
            print(f"[artifact-identity] directory={root}: files={files}, bytes={size}")
        if args.tar:
            files, size, digest = scan_tarball(args.tar, args.build_sha)
            scanned_files += files
            scanned_bytes += size
            print(f"[artifact-identity] tarball={args.tar}: files={files}, bytes={size}, sha256={digest}")
        print(f"[artifact-identity] PASS: files={scanned_files}, bytes={scanned_bytes}, forbidden_hits=0")
        return 0
    except (IdentityViolation, OSError, ValueError, tarfile.TarError) as error:
        print(f"[artifact-identity] FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
