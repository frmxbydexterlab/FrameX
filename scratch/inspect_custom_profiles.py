import json

with open("tests/RevitCustomFamilies 1.json", "r") as f:
    data = json.load(f)

profiles = data.get('profiles', [])
print("Total profiles:", len(profiles))
for p in profiles:
    fam = p.get('familyName', '')
    des = p.get('designation', '')
    if any(k in fam.upper() or k in des.upper() for k in ["CH", "SHAFT", "RUNNER", "STUD"]):
        print(f"Family: {fam}, Designation: {des}")
        # Let's print vertices bounding box and first few vertices
        if 'vertices' in p:
            u_vals = [v['u'] for v in p['vertices']]
            v_vals = [v['v'] for v in p['vertices']]
            print(f"  Vertices count: {len(p['vertices'])}")
            print(f"  Bounds: U [{min(u_vals):.2f}, {max(u_vals):.2f}], V [{min(v_vals):.2f}, {max(v_vals):.2f}]")
            print(f"  Vertices: {p['vertices']}")
