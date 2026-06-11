import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.security import decrypt_data

path = "tests/ABX.wex"
if os.path.exists(path):
    with open(path, "rb") as f:
        data = f.read()
    try:
        content = decrypt_data(data)
        wex_json = json.loads(content)
        print("WEX File Keys:", list(wex_json.keys()))
        if "walls" in wex_json:
            print("Number of walls:", len(wex_json["walls"]))
            for wall in wex_json["walls"]:
                print(f"Wall: {wall.get('wall_id')}, Label: {wall.get('label')}, Thickness: {wall.get('thickness')}")
                if "layers" in wall:
                    print("Layers:")
                    for l in wall["layers"]:
                        print(f"  - Function: {l.get('function')}, Thickness: {l.get('thickness_mm')}, Structural: {l.get('is_structural')}")
                if "joins" in wall:
                    print("Joins:", wall["joins"])
                print()
    except Exception as e:
        print("Failed to decrypt WEX:", e)
else:
    print("File not found")
