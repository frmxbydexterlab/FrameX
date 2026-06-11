import sys
import os
import json

# Add current dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.security import decrypt_data

wex_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\walls_input plus.wex"
if not os.path.exists(wex_path):
    print(f"File not found: {wex_path}")
    sys.exit(1)

with open(wex_path, "rb") as f:
    encrypted_bytes = f.read()

try:
    json_str = decrypt_data(encrypted_bytes)
    data = json.loads(json_str)
    
    # Save a readable json file for analysis
    output_path = wex_path.replace(".wex", "_decrypted.json")
    with open(output_path, "w", encoding="utf-8") as out:
        json.dump(data, out, indent=4)
        
    print(f"Successfully decrypted to: {output_path}")
    print(f"Keys in root: {list(data.keys())}")
    if "walls" in data:
        print(f"Number of walls: {len(data['walls'])}")
        for idx, w in enumerate(data['walls']):
            print(f"Wall {idx}: ID={w.get('WallId') or w.get('wall_id')}, Height={w.get('Height') or w.get('height')}, HeightStart={w.get('HeightStart') or w.get('height_start')}, HeightEnd={w.get('HeightEnd') or w.get('height_end')}")
    elif "Walls" in data:
        print(f"Number of walls: {len(data['Walls'])}")
        for idx, w in enumerate(data['Walls']):
            print(f"Wall {idx}: ID={w.get('WallId') or w.get('wall_id')}, Height={w.get('Height') or w.get('height')}, HeightStart={w.get('HeightStart') or w.get('height_start')}, HeightEnd={w.get('HeightEnd') or w.get('height_end')}")
            
except Exception as e:
    print(f"Decryption failed: {e}")
