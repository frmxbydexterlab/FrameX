with open("web/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "drawLocalRect" in line:
        # Check if it draws a layer
        found_layer = False
        for j in range(max(0, i-5), min(len(lines), i+15)):
            if "layer" in lines[j].lower() or "thickness" in lines[j].lower():
                found_layer = True
                break
        if found_layer:
            print(f"Line {i+1}:")
            for j in range(max(0, i-5), min(len(lines), i+15)):
                print(f"  {lines[j].strip()}")
            print("-" * 50)
