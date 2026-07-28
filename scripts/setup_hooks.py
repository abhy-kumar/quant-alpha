"""
setup_hooks.py
--------------
Helper script to install git pre-commit hooks for SQLite DB splitting.
"""

import os
import sys

HOOK_CONTENT = """#!/bin/sh
# Git pre-commit hook to auto-split SQLite database before commit
if [ -f "data/market_scans.db" ]; then
    echo "[Pre-Commit Hook] Auto-splitting data/market_scans.db into git-tracked chunks..."
    python db_split_join.py split
    git add data/market_scans.db.part_*
fi
"""

def install_hook():
    git_dir = ".git"
    if not os.path.exists(git_dir):
        print("Error: .git directory not found. Must run from root of git repo.")
        sys.exit(1)
        
    hooks_dir = os.path.join(git_dir, "hooks")
    os.makedirs(hooks_dir, exist_ok=True)
    
    hook_path = os.path.join(hooks_dir, "pre-commit")
    with open(hook_path, "w", encoding="utf-8") as f:
        f.write(HOOK_CONTENT)
        
    try:
        os.chmod(hook_path, 0o755)
    except Exception:
        pass
        
    print(f"Successfully installed pre-commit hook at {hook_path}")

if __name__ == "__main__":
    install_hook()
