"""
telegram_bot.py
---------------
Zero-cost automated Telegram Signal Bot.
Broadcasts top daily quantitative alpha picks, market regime scores,
and outperformance signals to a Telegram Channel via HTTP API.
"""

import os
import json
import requests
from utils import log

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
QUANT_DATA_PATH = "frontend/public/quant_data.json"
MARKET_DATA_PATH = "frontend/public/market_data.json"


def _escape(text) -> str:
    """Telegram legacy Markdown treats these as formatting; a ticker like M_M would break the message."""
    return "".join("\\" + ch if ch in "_*`[" else ch for ch in str(text))


def _number(value, default=0.0) -> float:
    try:
        value = float(value)
        return value if value == value else default
    except (TypeError, ValueError):
        return default


def build_message(market_data: dict) -> str:
    """Top balanced-horizon recommendations: eligible, rated Buy or better, no red flags."""
    picks = [s for s in market_data.get("data", [])
             if s.get("Conviction") in ("Strong Buy", "Buy")
             and (s.get("Ranking_Eligible") or {}).get("balanced", True)
             and not s.get("Red_Flags")]
    picks = sorted(picks, key=lambda s: (-_number(s.get("Composite_Score")), str(s.get("Ticker", ""))))[:5]
    lines = [
        "🚀 *QUANT ALPHA DAILY SIGNALS*",
        f"📊 *Market Regime Score:* {_escape(market_data.get('market_regime_score', 0))}/5",
        "───────────────────────────",
    ]
    if not picks:
        lines.append("No stock currently meets the Buy criteria.")
    else:
        lines.append(f"🔥 *Top {len(picks)} Conviction Picks:*")
    for i, s in enumerate(picks, 1):
        ticker = _escape(str(s.get("Ticker", "")).replace(".NS", ""))
        change = _number(s.get("1d_Chg_%"))
        entry = (f"{i}. *{ticker}* | ₹{_number(s.get('Price')):,.2f} ({change:+.2f}%)\n"
                 f"   • Composite: *{_number(s.get('Composite_Score')):.1f}/10* | Conviction: *{_escape(s.get('Conviction'))}*")
        # Shown only when a calibrated model produced it; ranking-v3 publishes none.
        if str(s.get("ML_Method") or "").startswith("NIFTY") and s.get("ML_Alpha_Prob") is not None:
            entry += f"\n   • ML Outperformance Estimate: *{_number(s.get('ML_Alpha_Prob')):.1f}%*"
        lines.append(entry)
    lines.append("───────────────────────────")
    lines.append("📈 _Powered by Quant Alpha Free & Open Source Platform_")
    return "\n".join(lines)


def send_telegram_broadcast() -> bool:
    """Send the top signals and market regime summary to the Telegram channel."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        log.info("[Telegram Bot] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured. Skipping broadcast.")
        return False

    if not os.path.exists(MARKET_DATA_PATH):
        log.warning("[Telegram Bot] market_data.json not found. Skipping broadcast.")
        return False

    try:
        with open(MARKET_DATA_PATH, "r", encoding="utf-8") as f:
            market_data = json.load(f)
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": build_message(market_data),
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }
        resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage", json=payload, timeout=10)
        if resp.status_code == 200:
            log.info("[Telegram Bot] Successfully sent daily alpha signals to Telegram channel!")
            return True
        log.warning(f"[Telegram Bot] Telegram API error ({resp.status_code}): {resp.text}")
    except requests.RequestException as e:
        # The request URL contains the bot token; never log the exception text.
        log.error(f"[Telegram Bot] Failed sending Telegram update: {type(e).__name__}")
    except Exception as e:
        log.error(f"[Telegram Bot] Failed building Telegram update: {type(e).__name__}: {e}")
    return False


if __name__ == "__main__":
    send_telegram_broadcast()
