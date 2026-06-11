import sys
import os
import json

frmx_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json"
wex_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input plus.wex"

# Decrypt wex if needed
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.security import decrypt_data

with open(wex_path, "rb") as f:
    wex_bytes = f.read()
wex_str = decrypt_data(wex_bytes)
wex_payload = json.loads(wex_str)

with open(frmx_path, "r") as f:
    frmx_payload = json.load(f)

wex_walls = {w["wall_id"]: w for w in wex_payload["walls"]}
frmx_walls = {w["wall_id"]: w for w in frmx_payload["walls"]}

print("=== WALL DETAILS IN LATEST WEX ===")
for wall_id, w in wex_walls.items():
    openings = w.get("openings", [])
    if openings:
        print(f"\nWall ID: {wall_id} | Label: {w.get('label')}")
        print(f"  Length: {w.get('length')} | Height: {w.get('height')}")
        print(f"  Slope: start_h={w.get('height_start')}, end_h={w.get('height_end')} | base_start={w.get('base_start')}, base_end={w.get('base_end')}")
        print(f"  Openings ({len(openings)}):")
        for o in openings:
            print(f"    - {o.get('type')} label={o.get('label')} x={o['x_offset']} w={o['width']} h={o['height']} sill={o['sill_height']}")
        
        if wall_id in frmx_walls:
            members = frmx_walls[wall_id]["members"]
            print(f"  Framed Members count: {len(members)}")
            print("  Member types:")
            types = {}
            for m in members:
                types[m["type"]] = types.get(m["type"], 0) + 1
            for k, v in types.items():
                print(f"    - {k}: {v}")
