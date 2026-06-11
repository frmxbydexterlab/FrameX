import os

files = os.listdir("tests")
print("Files in tests/:", files)
for f in files:
    if f.lower() in ("abc.wex", "abx.wex"):
        print(f"File {f} size: {os.path.getsize(os.path.join('tests', f))}")
