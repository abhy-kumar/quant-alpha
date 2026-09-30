import json
from pathlib import Path

HOLIDAYS = frozenset(json.loads((Path(__file__).resolve().parents[1] / 'frontend/server/market_calendar.json').read_text())['holidays'])
