import json
import sys
sys.path.insert(0, r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine")
from src.security import decrypt_data

# Load decrypted frmx
with open(r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\scratch\revit_framing_data_decrypted.json", "r") as f:
    frmx = json.load(f)

# Decrypt and load wex
with open(r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input plus.wex", "rb") as f:
    wex_bytes = f.read()
wex = json.loads(decrypt_data(wex_bytes))

wex_walls = {w["wall_id"]: w for w in wex["walls"]}
frmx_walls = {w["wall_id"]: w for w in frmx["walls"]}

print(f"{'Wall ID':15} | {'WEX Length':10} | {'FRMX Length':10} | {'WEX Origin':30} | {'FRMX Origin':30}")
print("-" * 105)
for wall_id in sorted(frmx_walls.keys()):
    fw = frmx_walls[wall_id]
    ww = wex_walls.get(wall_id)
    if ww:
        w_origin = f"({ww.get('origin_x')}, {ww.get('origin_y')}, {ww.get('origin_z')})"
        f_origin = f"({fw.get('origin_x')}, {fw.get('origin_y')}, {fw.get('origin_z')})"
        print(f"{wall_id:15} | {ww.get('length'):10.2f} | {fw.get('length_mm'):10.2f} | {w_origin:30} | {f_origin:30}")
    else:
        print(f"{wall_id:15} | {'N/A':10} | {fw.get('length_mm'):10.2f}")
