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


def send_telegram_broadcast():
    """Send top 5 alpha signals and market regime summary to Telegram channel."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        log.info("[Telegram Bot] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured. Skipping broadcast.")
        return

    if not os.path.exists(MARKET_DATA_PATH):
        log.warning("[Telegram Bot] market_data.json not found. Skipping broadcast.")
        return

    try:
        with open(MARKET_DATA_PATH, "r", encoding="utf-8") as f:
            market_data = json.load(f)

        top_stocks = sorted(market_data.get("data", []), key=lambda x: x.get("Composite_Score") or 0, reverse=True)[:5]
        regime_score = market_data.get("market_regime_score", 0)

        # Construct markdown message
        msg_lines = [
            "🚀 *QUANT ALPHA DAILY SIGNALS*",
            f"📊 *Market Regime Score:* {regime_score}/5",
            "───────────────────────────",
            "🔥 *Top 5 Conviction Picks:*",
        ]

        for i, s in enumerate(top_stocks, 1):
            t = s.get("Ticker", "").replace(".NS", "")
            comp = s.get("Composite_Score", 0)
            conv = s.get("Conviction", "Hold")
            ml_prob = s.get("ML_Alpha_Prob", 50.0)
            is_ml = s.get("ML_Method", "").startswith("NIFTY")
            alpha_label = "ML Outperformance Estimate" if is_ml else "Uncalibrated Factor Heuristic"
            alpha_unit = "%" if is_ml else "/100"
            chg = s.get("1d_Chg_%", 0)
            chg_str = f"+{chg:.2f}%" if chg >= 0 else f"{chg:.2f}%"

            msg_lines.append(
                f"{i}. *{t}* | ₹{s.get('Price', 0)} ({chg_str})\n"
                f"   • Composite: *{comp:.1f}/10* | Conviction: *{conv}*\n"
                f"   • {alpha_label}: *{ml_prob:.1f}{alpha_unit}*"
            )

        msg_lines.append("───────────────────────────")
        msg_lines.append("📈 _Powered by Quant Alpha Free & Open Source Platform_")

        full_msg = "\n".join(msg_lines)

        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": full_msg,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }

        resp = requests.post(url, json=payload, timeout=10)
        if resp.status_code == 200:
            log.info("[Telegram Bot] Successfully sent daily alpha signals to Telegram channel!")
        else:
            log.warning(f"[Telegram Bot] Telegram API error ({resp.status_code}): {resp.text}")

    except Exception as e:
        log.error(f"[Telegram Bot] Failed sending Telegram update: {e}")


if __name__ == "__main__":
    send_telegram_broadcast()
