import json

with open("tests/RevitCustomFamilies 1.json", "r") as f:
    data = json.load(f)

profiles = data.get('profiles', [])
if profiles:
    # Print keys of first profile
    print("Keys of profile 0:", profiles[0].keys())
    print("Profile 0 example:")
    print(json.dumps({k: v for k, v in profiles[0].items() if k != "vertices"}, indent=2))
