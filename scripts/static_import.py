import argparse
import hashlib
import os
import shutil


parser = argparse.ArgumentParser(description="Static Import Script")
parser.add_argument("file", type=argparse.FileType("rb"), help="Path to the file to be imported")
parser.add_argument("--ext", type=str, help="File extension (optional)")

args = parser.parse_args()
print(f"Importing file from path: {args.file.name}")

if args.ext:
    ext = args.ext
else:
    _,ext = os.path.splitext(args.file.name)
content = args.file.read()
hash = hashlib.sha256(content).hexdigest()
print(f"SHA-256 Hash: {hash}")
dest = f"assets/img/{hash}.{ext}"

with open(dest, "wb") as f:
    f.write(content)
    print(f"Successfully copied to {dest}")
