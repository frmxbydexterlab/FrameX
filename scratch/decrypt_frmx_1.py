import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.security import decrypt_data

frmx_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data (1).frmx"
with open(frmx_path, "rb") as f:
    encrypted_bytes = f.read()

json_str = decrypt_data(encrypted_bytes)
payload = json.loads(json_str)

output_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json"
with open(output_path, "w") as f:
    json.dump(payload, f, indent=2)

print("Decrypted successfully to", output_path)
print("Number of walls:", len(payload["walls"]))
for w in payload["walls"]:
    print(f"Wall: {w['wall_id']} | Label: {w.get('label')} | Members: {len(w['members'])}")
