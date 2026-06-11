import json
import os
import sys

# Add root directory to python path
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from src.security import decrypt_data

with open("tests/ABX.wex", "rb") as f:
    cipher_bytes = f.read()

try:
    plain_text = decrypt_data(cipher_bytes)
    data = json.loads(plain_text)
    print("Decrypted successfully!")
    print("Keys in data:", data.keys())
    
    # Check if there are profiles or walls
    if "walls" in data:
        print("Number of walls:", len(data["walls"]))
        # Print a wall example
        if data["walls"]:
            w = data["walls"][0]
            print("Wall 0 keys:", w.keys())
            # Check layers
            if "layers" in w:
                print("Wall 0 layers:", w["layers"])
            # Check members/studs
            if "studs" in w:
                print("Wall 0 studs count:", len(w["studs"]))
                if w["studs"]:
                    print("Stud 0 keys:", w["studs"][0].keys())
                    print("Stud 0:", w["studs"][0])
            
    # Check custom_profiles or similar keys
    for k in data.keys():
        if "profile" in k.lower() or "family" in k.lower():
            print(f"Key: {k}, Type: {type(data[k])}")
            
except Exception as e:
    print("Failed to decrypt or parse:", e)
