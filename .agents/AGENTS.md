# Workspace Rules for AI Agents

## Database Split/Join Handling
Due to GitHub's 50MB file size limit for repositories, the main SQLite database (`data/market_scans.db`) is NOT tracked directly in Git. Instead, it is chunked into 40MB parts (`data/market_scans.db.part_*`).

**CRITICAL INSTRUCTIONS FOR AI:**
1. If you need to run `scanner.py` or any backend Python script that requires the database locally, YOU MUST first run:
   ```bash
   python db_split_join.py join
   ```
2. If you modify the database structure or generate new data, and you plan to commit the changes, YOU MUST first run:
   ```bash
   python db_split_join.py split
   ```
3. NEVER commit `data/market_scans.db` directly. It should remain in `.gitignore`. Commit the `data/market_scans.db.part_*` files instead.
