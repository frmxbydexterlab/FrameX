with open("web/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "wallInput.layers" in line or "wall.layers" in line:
        if "forEach" in line or "map" in line:
            print(f"Line {i+1}: {line.strip()}")
            for j in range(i, min(i+20, len(lines))):
                print(f"  {lines[j].strip()}")
