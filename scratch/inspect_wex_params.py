import sys
import os
import json

sys.path.insert(0, r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine")
from src.security import decrypt_data

wex_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input new.wex"

if not os.path.exists(wex_path):
    print("Error: file does not exist")
    sys.exit(1)

with open(wex_path, "rb") as f:
    data = f.read()

content = decrypt_data(data)
wex_json = json.loads(content)
walls = wex_json.get("walls", wex_json)

print(f"Total walls: {len(walls)}")
if len(walls) > 0:
    first_wall = walls[0]
    print("\nKeys in wall:")
    for k in first_wall.keys():
        print(f"  {k}")
    
    print("\nRevit parameters of first wall:")
    params = first_wall.get("revit_parameters", first_wall.get("RevitParameters", {}))
    for k, v in params.items():
        print(f"  {k}: {v}")
