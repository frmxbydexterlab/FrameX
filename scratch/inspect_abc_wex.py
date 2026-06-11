import json
import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))
from src.security import decrypt_data

with open("tests/abc.wex", "rb") as f:
    cipher_bytes = f.read()

plain_text = decrypt_data(cipher_bytes)
data = json.loads(plain_text)

print("Decrypted successfully!")
print("Keys:", data.keys())
print("Number of walls:", len(data.get("walls", [])))

for w in data.get("walls", []):
    print("="*60)
    print(f"Wall ID: {w.get('wall_id')}")
    print(f"Label: {w.get('label')}")
    print(f"Thickness: {w.get('thickness')}")
    print("Layers:")
    for idx, layer in enumerate(w.get("layers", [])):
        print(f"  Layer {idx}: {layer}")
