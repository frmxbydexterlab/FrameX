import json
import os
import sys

# Add root directory to python path
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from src.security import decrypt_data

with open("tests/ABX.wex", "rb") as f:
    cipher_bytes = f.read()

plain_text = decrypt_data(cipher_bytes)
data = json.loads(plain_text)

all_ids = [w.get("wall_id") for w in data.get("walls", [])]
print("All Wall IDs in WEX:", all_ids)

target_ids = [1284212, 1284586, 1284621, 1284682]

for wall in data.get("walls", []):
    wall_id = wall.get("wall_id")
    # check if wall_id in target_ids
    if wall_id in target_ids or str(wall_id) in [str(i) for i in target_ids] or any(str(wall_id) in str(t) or str(t) in str(wall_id) for t in target_ids):
        print("="*60)
        print(f"Wall ID: {wall_id}")
        print(f"Label: {wall.get('label')}")
        print(f"Thickness: {wall.get('thickness')}")
        print("Layers:")
        for idx, layer in enumerate(wall.get("layers", [])):
            print(f"  Layer {idx}: {layer}")
        print("Config Overrides:")
        print(json.dumps(wall.get("config_overrides"), indent=2))
        print("Revit Parameters:")
        print(json.dumps(wall.get("revit_parameters"), indent=2))
