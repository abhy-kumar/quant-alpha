import sys
import os

CHUNK_SIZE = 40 * 1024 * 1024  # 40 MB
DB_PATH = "data/market_scans.db"
PREFIX = "market_scans.db.part_"
DATA_DIR = "data"

def split_db():
    if not os.path.exists(DB_PATH):
        print(f"{DB_PATH} not found.")
        return
    
    # Remove old parts first
    for f in os.listdir(DATA_DIR):
        if f.startswith(PREFIX):
            os.remove(os.path.join(DATA_DIR, f))

    with open(DB_PATH, "rb") as f:
        part_num = 0
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            part_name = f"{PREFIX}{part_num:03d}"
            with open(os.path.join(DATA_DIR, part_name), "wb") as out:
                out.write(chunk)
            part_num += 1
    print(f"Split {DB_PATH} into {part_num} parts.")

def join_db():
    if not os.path.exists(DATA_DIR):
        return
    
    parts = sorted([f for f in os.listdir(DATA_DIR) if f.startswith(PREFIX)])
    if not parts:
        print("No database parts found to join.")
        return
    
    with open(DB_PATH, "wb") as out:
        for p in parts:
            part_path = os.path.join(DATA_DIR, p)
            with open(part_path, "rb") as f:
                out.write(f.read())
    print(f"Joined {len(parts)} parts into {DB_PATH}.")

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "join"
    if action == "split":
        split_db()
    else:
        join_db()
