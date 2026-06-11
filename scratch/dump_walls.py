import json
import os
import sys

# Add directory to sys.path
sys.path.insert(0, r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine")

from src.security import decrypt_data

wex_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input plus.wex"
with open(wex_path, "rb") as f:
    encrypted_bytes = f.read()

json_str = decrypt_data(encrypted_bytes)
payload = json.loads(json_str)

target_ids = ["wall_1212237", "wall_1212791"]
for w in payload["walls"]:
    if w["wall_id"] in target_ids or any(tid in w["wall_id"] for tid in target_ids):
        print(f"Wall ID: {w['wall_id']}")
        print(f"  Length: {w['length']}")
        print(f"  Height: {w['height']}")
        print(f"  Height Start: {w.get('height_start')}")
        print(f"  Height End: {w.get('height_end')}")
        print(f"  Base Start: {w.get('base_start')}")
        print(f"  Base End: {w.get('base_end')}")
        print(f"  Openings:")
        for o in w.get("openings", []):
            print(f"    - Type: {o['type']}, Label: {o['label']}, XOffset: {o['x_offset']}, Width: {o['width']}, Height: {o['height']}, SillHeight: {o.get('sill_height')}")
        print("-" * 40)
