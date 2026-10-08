#!/usr/bin/env python3
"""Validate golden scenario files against tests/Golden/golden-scenario.schema.json (16-test-strategy.md §11.6).

Usage: python3 tools/ci/validate-golden.py            (needs: pip install jsonschema pyyaml)
Accepts .json and .yaml/.yml scenario files under tests/Golden/{Scenarios,Drafts}. Exit code 1 on any violation (GS-E001).
"""
import glob
import json
import pathlib
import sys

import jsonschema

root = pathlib.Path(__file__).resolve().parents[2] / "tests" / "Golden"
schema = json.loads((root / "golden-scenario.schema.json").read_text(encoding="utf-8"))
validator = jsonschema.Draft202012Validator(schema)
failures = 0
files = sorted(glob.glob(str(root / "**" / "GS-*.*"), recursive=True))
for name in files:
    path = pathlib.Path(name)
    if path.suffix == ".json":
        document = json.loads(path.read_text(encoding="utf-8"))
    elif path.suffix in (".yaml", ".yml"):
        import yaml  # YAML 1.2-safe usage: quoted numbers/dates are required by TST-GS-18
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    else:
        continue
    errors = sorted(validator.iter_errors(document), key=lambda e: list(e.path))
    if not path.name.startswith(str(document.get("id", "")) + "-"):
        errors.append(jsonschema.ValidationError("file name must start with the scenario id (TST-GS-01)"))
    status = "OK" if not errors else "GS-E001"
    print(f"{status:8} {path.relative_to(root)}")
    for error in errors:
        failures += 1
        print(f"         {'/'.join(str(p) for p in error.path)}: {error.message}")
print(f"{len(files)} file(s), {failures} violation(s)")
sys.exit(1 if failures else 0)
