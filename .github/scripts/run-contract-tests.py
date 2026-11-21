"""Run Cargo tests and expose compiler errors as readable GitHub annotations."""

import json
import subprocess
import sys
from collections import deque


def escape(value: str) -> str:
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def main() -> int:
    process = subprocess.Popen(
        ["cargo", "test", "--locked", "--message-format=json"],
        stdout=subprocess.PIPE,
        text=True,
    )
    assert process.stdout is not None
    output_tail: deque[str] = deque(maxlen=100)
    compiler_failed = False
    for line in process.stdout:
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            output_tail.append(line)
            print(line, end="", flush=True)
            continue
        if record.get("reason") != "compiler-message":
            continue
        message = record["message"]
        rendered = message.get("rendered") or message["message"]
        print(rendered, end="\n", flush=True)
        if message["level"] == "error":
            compiler_failed = True
            # Annotations can be read through the public Checks API even when log downloads require sign-in.
            print(f"::error title=Rust compilation::{escape(rendered)}", flush=True)
    status = process.wait()
    if status and not compiler_failed and output_tail:
        print(f"::error title=Rust tests::{escape(''.join(output_tail))}", flush=True)
    return status


if __name__ == "__main__":
    sys.exit(main())
