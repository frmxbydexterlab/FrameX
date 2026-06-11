import json
import sys
sys.path.insert(0, r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine")
from src.security import decrypt_data

with open(r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input plus.wex", "rb") as f:
    wex_bytes = f.read()
wex = json.loads(decrypt_data(wex_bytes))

w = [w for w in wex["walls"] if w["wall_id"] == "wall_1212237"][0]
print("Wall wall_1212237:")
print("Openings:")
for o in w.get("openings", []):
    print(f"  - Label: {o['label']}, Type: {o['type']}, XOffset: {o['x_offset']}, Width: {o['width']}, Height: {o['height']}, SillHeight: {o.get('sill_height')}")
