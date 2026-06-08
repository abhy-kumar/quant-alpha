import re

with open("app.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Typography
font_link = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Plus+Jakarta+Sans:wght@300;400;500;600&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">"""

content = re.sub(r'<link rel="preconnect" href="https://fonts.googleapis.com">.*?<link href="[^"]+" rel="stylesheet">', font_link, content, flags=re.DOTALL)

# 2. Update CSS Variables for stark contrast (Ninebar aesthetic)
dark_vars = """    :root {
        --bg-app: #000000;
        --bg-card: #0A0A0A;
        --border-color: #1A1A1A;
        --text-main: #FFFFFF;
        --text-muted: #737373;
        --text-sub: #52525B;
        --text-hover: #D4D4D8;
        --brand-red: #C8102E;
        --brand-red-hover: #E53030;
        --btn-bg: transparent;
        --btn-border: #27272A;
        --btn-hover: #1A1A1A;
        --fms-red: #C8102E;
    }"""
content = re.sub(r':root\s*\{[^}]*--bg-app:\s*#09090b;[^}]*\}', dark_vars, content)

# 3. Modify global typography and shapes
content = content.replace("border-radius: 16px;", "border-radius: 0px;")
content = content.replace("border-radius: 12px;", "border-radius: 0px;")
content = content.replace("box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);", "")

# 4. Make Wordmark / Headers brutalist
content = content.replace(".app-wordmark {\n    font-size: 1.3rem;\n    font-weight: 600;", ".app-wordmark {\n    font-size: 1.6rem;\n    font-family: 'Archivo Black', sans-serif;\n    font-weight: 400;\n    text-transform: uppercase;")

content = content.replace(".section-head {\n    font-size: 1.15rem;\n    font-weight: 600;", ".section-head {\n    font-family: 'Archivo Black', sans-serif;\n    font-size: 1.6rem;\n    font-weight: 400;\n    text-transform: uppercase;\n    letter-spacing: 0.05em;")
content = content.replace(".section-sub {\n    font-size: 0.85rem;", ".section-sub {\n    font-family: 'Space Mono', monospace;\n    font-size: 0.75rem;\n    text-transform: uppercase;\n    letter-spacing: 0.05em;")

# Tab styling
content = content.replace(".stTabs [data-baseweb=\"tab\"] {\n    background: transparent !important;\n    color: var(--text-sub) !important;\n    font-weight: 500 !important;\n    font-size: 0.85rem !important;", ".stTabs [data-baseweb=\"tab\"] {\n    background: transparent !important;\n    color: var(--text-sub) !important;\n    font-family: 'Space Mono', monospace !important;\n    font-weight: 700 !important;\n    font-size: 0.75rem !important;\n    text-transform: uppercase !important;")

# 5. Fix buttons shape (sharp rectangles)
content = content.replace("border-radius: 99px", "border-radius: 0px")
content = content.replace("border-radius: 4px", "border-radius: 0px")
content = content.replace("border-radius: 6px", "border-radius: 0px")
content = content.replace("border-radius: 8px", "border-radius: 0px")

with open("app.py", "w", encoding="utf-8") as f:
    f.write(content)
print("Brutalist design patched.")
