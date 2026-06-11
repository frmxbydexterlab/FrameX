import json
from src.models import Wall, WallLayer, Opening, OpeningType
from src.join_detector import detect_and_trim_joins

def check_joins():
    with open("tests/walls_input.json", "r") as f:
        data = json.load(f)
    
    walls = []
    for wall_input in data["walls"]:
        openings = []
        for i, op in enumerate(wall_input.get("openings", [])):
            op_type = OpeningType.DOOR if op["type"].lower() == "door" else OpeningType.WINDOW
            openings.append(Opening(
                opening_type=op_type,
                x_offset=op["x_offset"],
                width=op["width"],
                height=op["height"],
                sill_height=op["sill_height"],
                label=op.get("label", "")
            ))
            
        layers = []
        for l in wall_input.get("layers", []):
            layers.append(WallLayer(
                function=l["function"],
                thickness_mm=l["thickness_mm"],
                is_structural=l.get("is_structural", False)
            ))
            
        wall = Wall(
            wall_id=wall_input["wall_id"],
            label=wall_input.get("label", ""),
            length=wall_input["length"],
            height=wall_input["height"],
            thickness=wall_input["thickness"],
            openings=openings,
            layers=layers,
            fire_rating=wall_input.get("fire_rating", ""),
            origin_x=wall_input["origin_x"],
            origin_y=wall_input["origin_y"],
            origin_z=wall_input["origin_z"],
            direction_x=wall_input["direction_x"],
            direction_y=wall_input["direction_y"]
        )
        walls.append(wall)
        
    joins = detect_and_trim_joins(walls)
    print(f"Detected {len(joins)} joins:")
    for stop, cont in joins:
        print(f"Join Type: {stop.join_type}")
        print(f"  Stopped: {stop.stopped_wall_id} (length={next(w.length for w in walls if w.wall_id == stop.stopped_wall_id)})")
        print(f"  Continuing: {stop.continuing_wall_id} (length={next(w.length for w in walls if w.wall_id == stop.continuing_wall_id)})")
        print(f"  Angle: {stop.angle_deg}")
        print()

if __name__ == "__main__":
    check_joins()
