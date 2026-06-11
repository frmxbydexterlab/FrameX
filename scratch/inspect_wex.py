import json
import os
import sys

# Add current dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.security import decrypt_data

wex_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\My Test Project.wex"
if not os.path.exists(wex_path):
    print(f"File not found: {wex_path}")
    sys.exit(1)

with open(wex_path, "rb") as f:
    encrypted_bytes = f.read()

try:
    json_str = decrypt_data(encrypted_bytes)
    data = json.loads(json_str)
    
    print(f"Keys in root: {list(data.keys())}")
    walls = data.get("walls") or data.get("Walls") or []
    print(f"Number of walls: {len(walls)}")
    for idx, w in enumerate(walls):
        print(f"Wall {idx}: ID={w.get('WallId')} / wall_id={w.get('wall_id')} / id={w.get('id')} / label={w.get('label') or w.get('Label')}")
            
except Exception as e:
    print(f"Decryption failed: {e}")
