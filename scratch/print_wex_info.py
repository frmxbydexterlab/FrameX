import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.security import decrypt_data

wex_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input plus.wex"
with open(wex_path, "rb") as f:
    encrypted_bytes = f.read()

json_str = decrypt_data(encrypted_bytes)
payload = json.loads(json_str)

print("Number of walls:", len(payload["walls"]))
for w in payload["walls"]:
    print(f"Wall: {w['wall_id']} | Label: {w.get('label')} | Length: {w['length']} | Height: {w['height']}")
    print(f"  Slope: start_h={w.get('height_start')}, end_h={w.get('height_end')} | base_start={w.get('base_start')}, base_end={w.get('base_end')}")
    print(f"  Openings ({len(w.get('openings', []))}):")
    for o in w.get("openings", []):
        print(f"    - {o.get('type')} label={o.get('label')} x={o['x_offset']} w={o['width']} h={o['height']} sill={o['sill_height']}")
