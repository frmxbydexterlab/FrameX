import json
import sys
sys.path.insert(0, r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine")
from src.security import decrypt_data

with open(r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input plus.wex", "rb") as f:
    wex_bytes = f.read()
wex = json.loads(decrypt_data(wex_bytes))

for w in wex["walls"]:
    doors = [o for o in w.get("openings", []) if o["type"] == "door"]
    if doors:
        print(f"Wall {w['wall_id']} has doors:")
        for d in doors:
            print(f"  - Label: {d['label']}, XOffset: {d['x_offset']}, Width: {d['width']}, Height: {d['height']}, SillHeight: {d.get('sill_height')}")
