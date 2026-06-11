import sys

appjs_path = r"c:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\web\app.js"
query = sys.argv[1] if len(sys.argv) > 1 else ""

if not query:
    print("Please specify a query.")
    sys.exit(1)

with open(appjs_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"--- Matches for '{query}' in app.js ---")
count = 0
for idx, line in enumerate(lines):
    if query.lower() in line.lower():
        print(f"{idx+1}: {line.rstrip()}")
        count += 1
        if count >= 100:
            print("... truncated ...")
            break
print(f"Total matches: {count}")
