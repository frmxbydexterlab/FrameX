import json
import os

# Typical LGSF wall compound structure: Exterior Gypsum + Structural Core + Interior Gypsum
SAMPLE_LAYERS_92MM = [
    {"function": "Finish1",   "function_name": "Finish Layer (Exterior)", "material_name": "Gypsum Wall Board",   "thickness_mm": 12.7,  "is_structural": False},
    {"function": "Structure", "function_name": "Structural Core",         "material_name": "Metal Stud Framing",  "thickness_mm": 92.08, "is_structural": True},
    {"function": "Finish2",   "function_name": "Finish Layer (Interior)", "material_name": "Gypsum Wall Board",   "thickness_mm": 12.7,  "is_structural": False},
]

# Thicker wall: insulated cavity wall
SAMPLE_LAYERS_152MM = [
    {"function": "Finish1",    "function_name": "Finish Layer (Exterior)", "material_name": "Exterior Cladding",   "thickness_mm": 12.7,  "is_structural": False},
    {"function": "Substrate",  "function_name": "Substrate",               "material_name": "OSB Sheathing",       "thickness_mm": 11.1,  "is_structural": False},
    {"function": "Insulation", "function_name": "Insulation / Air Layer",  "material_name": "Mineral Wool",         "thickness_mm": 38.0,  "is_structural": False},
    {"function": "Structure",  "function_name": "Structural Core",         "material_name": "Metal Stud Framing",  "thickness_mm": 92.08, "is_structural": True},
    {"function": "Membrane",   "function_name": "Membrane / Vapour Barrier","material_name": "Vapour Barrier",     "thickness_mm":  0.5,  "is_structural": False},
    {"function": "Finish2",    "function_name": "Finish Layer (Interior)", "material_name": "Gypsum Wall Board",   "thickness_mm": 12.7,  "is_structural": False},
]

# Load existing export to get real wall geometry
base_dir = os.path.dirname(os.path.abspath(__file__))
input_path = os.path.join(base_dir, "output", "revit_framing_data.json")
with open(input_path, "r") as f:
    export_data = json.load(f)

source_walls = export_data.get("walls", [])

# Build Revit-format input JSON (the format the plugin exports, NOT the engine output)
demo_walls = []
for idx, wall in enumerate(source_walls[:4]):  # Take first 4 walls
    # Use thick wall layers for every other wall to show variety
    layers = SAMPLE_LAYERS_152MM if idx % 2 == 1 else SAMPLE_LAYERS_92MM
    
    # Extract openings from the engine output format
    openings = []
    for op in wall.get("openings", []):
        openings.append({
            "type": op.get("type", "window"),
            "label": op.get("label", ""),
            "x_offset": op.get("x_offset", 0),
            "width": op.get("width", 900),
            "height": op.get("height", 2100),
            "sill_height": op.get("sill_height", 0),
            "is_rough_opening": True,
        })

    demo_walls.append({
        "wall_id": wall["wall_id"],
        "label": wall["label"] + (" [Insulated]" if idx % 2 == 1 else " [Standard]"),
        "length": wall["length_mm"],
        "height": wall["height_mm"],
        "thickness": wall.get("thickness_mm", 92.08),
        "origin_x": wall.get("origin_x", 0),
        "origin_y": wall.get("origin_y", 0),
        "origin_z": wall.get("origin_z", 0),
        "direction_x": wall.get("direction_x", 1),
        "direction_y": wall.get("direction_y", 0),
        "revit_parameters": {},
        "layers": layers,
        "openings": openings,
    })

payload = {
    "units": "mm",
    "description": "Demo export with compound structure layers — for testing wall layer visualization",
    "walls": demo_walls,
}

out_path = os.path.join(base_dir, "output", "demo_with_layers.json")
with open(out_path, "w") as f:
    json.dump(payload, f, indent=2)

print(f"Written: {out_path}")
print(f"Walls: {len(demo_walls)}")
for w in demo_walls:
    print(f"  {w['label']}: {len(w['layers'])} layers, total thickness = {sum(l['thickness_mm'] for l in w['layers']):.1f}mm")
