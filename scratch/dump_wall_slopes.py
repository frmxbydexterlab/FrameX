import json
import sys
sys.path.insert(0, r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine")
from src.security import decrypt_data

with open(r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input plus.wex", "rb") as f:
    wex_bytes = f.read()
wex = json.loads(decrypt_data(wex_bytes))

for w in wex["walls"]:
    print(f"Wall {w['wall_id']}:")
    print(f"  Length: {w['length']}, Height: {w['height']}")
    print(f"  Height Start: {w.get('height_start')}, Height End: {w.get('height_end')}")
    print(f"  Base Start: {w.get('base_start')}, Base End: {w.get('base_end')}")
