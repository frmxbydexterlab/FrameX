import os
import time

brain_dir = r"C:\Users\RaunakC\.gemini\antigravity-ide\brain\eb3d6086-74d0-4b35-9fe7-4eecbfaec509"

files_with_time = []
for root, dirs, files in os.walk(brain_dir):
    for f in files:
        full_path = os.path.join(root, f)
        try:
            mtime = os.path.getmtime(full_path)
            files_with_time.append((full_path, mtime))
        except Exception:
            pass

# Sort by mtime descending
files_with_time.sort(key=lambda x: x[1], reverse=True)

print("Recently modified files:")
for path, mtime in files_with_time[:30]:
    t_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(mtime))
    size = os.path.getsize(path)
    print(f"{t_str} | {size:10} bytes | {path}")
