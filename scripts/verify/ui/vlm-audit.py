#!/usr/bin/env python3
"""VLM audit: ask a question about one or more screenshots, print concise answers."""
import json
import subprocess
import sys

def ask(prompt: str, image: str) -> str:
    out = subprocess.run(
        ["z-ai", "vision", "-p", prompt, "-i", image],
        capture_output=True, text=True, timeout=180,
    ).stdout
    i = out.find("{")
    if i < 0:
        return "(no json) " + out[:200]
    try:
        return json.loads(out[i:])["choices"][0]["message"]["content"]
    except Exception:
        return "(parse fail) " + out[:300]

if __name__ == "__main__":
    prompt = sys.argv[1]
    for image in sys.argv[2:]:
        print(f"\n===== {image} =====")
        print(ask(prompt, image))
