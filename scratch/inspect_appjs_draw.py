with open("web/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "drawDetailedProfile(" in line:
        # print the line and the next 10 lines
        print(f"Line {i+1}:")
        for j in range(i, min(i+15, len(lines))):
            print(f"  {lines[j].strip()}")
