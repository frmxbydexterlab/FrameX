with open("web/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

found = False
for i, line in enumerate(lines):
    if "function collectOverrides" in line:
        found = True
        print(f"Line {i+1}:")
        for j in range(i, min(i+70, len(lines))):
            print(f"  {lines[j].strip()}")
        break
