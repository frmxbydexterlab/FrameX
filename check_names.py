import json

d = json.load(open('C:/Users/RaunakC/.gemini/antigravity/scratch/LGSFRevitAddin/bin/x64/Debug2/revit_framing_data.json'))
for w in d['walls']:
    print(f"Wall: {w['wall_id']}")
    for m in w['members'][:3]:
        print(f"  {m['label']}: symbol={m['symbol_name']}, depth={m['depth_mm']}, flange={m['flange_width_mm']}, tf={m['thickness_mm']}")
    print()
