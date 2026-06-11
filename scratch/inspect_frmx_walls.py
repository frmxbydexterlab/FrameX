import sys
import os
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.security import decrypt_data

frmx_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data (1).frmx"
with open(frmx_path, "rb") as f:
    encrypted_bytes = f.read()

json_str = decrypt_data(encrypted_bytes)
payload = json.loads(json_str)

for w in payload.get("walls", []):
    if w["wall_id"] in ("wall_1212308", "wall_1212369"):
        print("="*60)
        print(f"Wall ID in Revit: {w['wall_id']}")
        print(f"Length: {w.get('length') or w.get('length_mm')}")
        print(f"Origin: {w.get('origin_x')}, {w.get('origin_y')}")
        print(f"Dir: {w.get('direction_x')}, {w.get('direction_y')}")
