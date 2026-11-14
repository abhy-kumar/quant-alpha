"""Join the git-tracked database parts into data/market_scans.db, or split it back.

    python db_split_join.py join
    python db_split_join.py split [--force]

`split` refuses to run when the local database is older than the parts on disk.
That is the state right after `git pull` and before `join`: splitting then would
overwrite the freshly pulled parts with a stale copy and commit weeks of data loss.
"""
import os
import sys

CHUNK_SIZE = 40 * 1024 * 1024  # 40 MB
DB_PATH = "data/market_scans.db"
PREFIX = "market_scans.db.part_"
DATA_DIR = "data"


def _parts():
    if not os.path.isdir(DATA_DIR):
        return []
    return sorted(f for f in os.listdir(DATA_DIR) if f.startswith(PREFIX))


def database_is_stale():
    """True when any tracked part is newer than the joined database."""
    parts = _parts()
    if not parts or not os.path.exists(DB_PATH):
        return False
    return os.path.getmtime(DB_PATH) < max(os.path.getmtime(os.path.join(DATA_DIR, p)) for p in parts)


def split_db(force=False):
    if not os.path.exists(DB_PATH):
        print(f"{DB_PATH} not found.")
        return True
    if not force and database_is_stale():
        print(f"Skipped split: {DB_PATH} is older than the tracked parts (pulled since the last join?).\n"
              f"Run `python db_split_join.py join` first, or pass --force to overwrite the parts.", file=sys.stderr)
        return False

    written = []
    with open(DB_PATH, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            part_name = f"{PREFIX}{len(written):03d}"
            with open(os.path.join(DATA_DIR, part_name), "wb") as out:
                out.write(chunk)
            written.append(part_name)
    # A smaller database must not leave higher-numbered parts of the old one behind.
    for stale in set(_parts()) - set(written):
        os.remove(os.path.join(DATA_DIR, stale))
    print(f"Split {DB_PATH} into {len(written)} parts.")
    return True


def join_db():
    parts = _parts()
    if not parts:
        print("No database parts found to join.")
        return
    # Write beside the target and swap, so an interrupted join never leaves half a database.
    temporary = DB_PATH + ".joining"
    with open(temporary, "wb") as out:
        for p in parts:
            with open(os.path.join(DATA_DIR, p), "rb") as f:
                while chunk := f.read(8 * 1024 * 1024):
                    out.write(chunk)
    os.replace(temporary, DB_PATH)
    print(f"Joined {len(parts)} parts into {DB_PATH}.")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "join"
    if action == "split":
        split_db(force="--force" in sys.argv[2:])
    else:
        join_db()
