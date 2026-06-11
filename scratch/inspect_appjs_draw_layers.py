with open("web/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "drawLocalRect(" in line and "layer" in line.lower():
        print(f"Line {i+1}: {line.strip()}")
        for j in range(i, min(i+25, len(lines))):
            print(f"  {lines[j].strip()}")
