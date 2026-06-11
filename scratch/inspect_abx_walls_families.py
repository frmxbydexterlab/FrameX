import json
import os
import sys
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))
from src.security import decrypt_data

with open("tests/ABX.wex", "rb") as f:
    cipher_bytes = f.read()

plain_text = decrypt_data(cipher_bytes)
data = json.loads(plain_text)

for wall in data.get("walls", []):
    wall_id = wall.get("wall_id")
    revit_params = wall.get("revit_parameters", {})
    family_name = revit_params.get("Family Name", "")
    type_name = revit_params.get("Type Name", "")
    print(f"Wall ID: {wall_id}, Family: {family_name}, Type: {type_name}")
