import json

with open("tests/RevitCustomFamilies 1.json", "r") as f:
    data = json.load(f)

import json

with open("tests/RevitCustomFamilies 1.json", "r") as f:
    data = json.load(f)

profiles = data.get('profiles', [])
print("Number of profiles:", len(profiles))
for i, item in enumerate(profiles):
    print(f"Profile {i}: {item.get('familyName')} - {item.get('designation')}")
    if 'vertices' in item:
        print("  Vertices count:", len(item['vertices']))
        u_vals = [pt['u'] for pt in item['vertices']]
        v_vals = [pt['v'] for pt in item['vertices']]
        print(f"  Bounds: U [{min(u_vals):.2f}, {max(u_vals):.2f}], V [{min(v_vals):.2f}, {max(v_vals):.2f}]")

