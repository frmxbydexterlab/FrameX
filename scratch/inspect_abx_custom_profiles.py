import json

with open("tests/RevitCustomFamilies 1.json", "r") as f:
    data = json.load(f)

profiles = data.get('profiles', [])
print("Total profiles in RevitCustomFamilies 1.json:", len(profiles))
for p in profiles:
    fam = p.get('familyName', '')
    des = p.get('designation', '')
    # Check if designation contains any target substring
    if any(k in des or k in fam for k in ["400", "600", "212", "CH", "JR"]):
        print(f"Family: {fam}, Designation: {des}")
