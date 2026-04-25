"""
Stockholm Scenario Festival — WordPress XML → scenarios.json
============================================================
Usage:
    python parse_xml.py stockholmscenariofestival_WordPress_YYYY-MM-DD.xml

Output:
    scenarios.json  (in the same directory)

No external dependencies — uses only the Python standard library.
Python 3.8+ required.

Run this each year after exporting from WordPress Admin → Tools → Export.
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# ---------------------------------------------------------------------------
# XML namespaces used in WordPress WXR exports
# ---------------------------------------------------------------------------
NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "wp":      "http://wordpress.org/export/1.2/",
    "dc":      "http://purl.org/dc/elements/1.1/",
    "excerpt": "http://wordpress.org/export/1.2/excerpt/",
}

# ---------------------------------------------------------------------------
# HTML / entity helpers
# ---------------------------------------------------------------------------
HTML_ENTITIES = {
    "&amp;": "&", "&nbsp;": " ", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#039;": "'",
    "&#8211;": "–", "&#8212;": "—",    # en/em dash
    "&#8216;": "'", "&#8217;": "'",    # curly quotes
    "&#8220;": "\u201c", "&#8221;": "\u201d",
    "&#215;": "×",
}

def clean_entities(s: str) -> str:
    for esc, rep in HTML_ENTITIES.items():
        s = s.replace(esc, rep)
    return s

def strip_html(s: str) -> str:
    """Remove HTML tags and normalise whitespace, preserving newlines."""
    s = re.sub(r"<[^>]+>", "\n", s)
    s = re.sub(r"[ \t]+", " ", clean_entities(s))
    return s.strip()


# ---------------------------------------------------------------------------
# Field extractors
# ---------------------------------------------------------------------------
META_RE = re.compile(
    r"By:|Duration|Number of|Number:|Scenario format|Download|Bio:|About the author",
    re.I,
)

def find_tags(plain: str) -> list[str]:
    """
    Extract the three tagwords.

    Modern format (2016+):  Word – Word – Word   (em-dash separated)
    Old format (2013–2015): Word - Word - Word    (hyphen, first line only)
    """
    top = plain[:500]

    # Em-dash pattern — anywhere in top section
    seg = r"([A-Za-z\u00C0-\u024F\u2018\u2019'][^–\n:]{1,40}?)"
    pattern = seg + r"\s*–\s*" + seg + r"\s*–\s*" + seg + r"(?:\s*\n|\s+By:|\s+Duration|\s*$)"
    m = re.search(pattern, top)
    if m:
        tags = [t.strip().rstrip(".,") for t in m.groups()]
        if (
            not any(META_RE.search(t) for t in tags)
            and all(2 < len(t) < 50 for t in tags)
        ):
            return tags

    # Hyphen pattern — must be the entire first non-empty line
    lines = [ln.strip() for ln in plain.split("\n") if ln.strip()]
    if lines:
        first = lines[0]
        if "–" not in first and len(first) < 120:
            m = re.match(r"^(.+?)\s*-\s*(.+?)\s*-\s*(.+?)$", first)
            if m:
                tags = [t.strip() for t in m.groups()]
                if (
                    all(2 < len(t) < 50 for t in tags)
                    and not any(META_RE.search(t) for t in tags)
                ):
                    return tags
    return []

def find_authors(plain: str) -> str:
    """Find the 'By: ...' line anywhere in the content."""
    m = re.search(r"\bBy:\s*([^\n]+)", plain, re.I)
    if m:
        auth = m.group(1).strip().rstrip(".,")
        # Tags sometimes follow on the same line after an em-dash
        auth = re.split(r"\s*–\s*[A-Z]", auth)[0].strip()
        if 0 < len(auth) < 120:
            return auth
    return ""

def find_duration(plain: str) -> str:
    """Parse 'Duration: X hours' — colon sometimes missing in older pages."""
    m = re.search(r"Duration:?\s*([^\n]+)", plain, re.I)
    if m:
        raw = m.group(1).strip()
        raw = re.split(r"\s+(?:Number|Scenario|Download|Bio)", raw, flags=re.I)[0]
        return raw.strip()
    return ""

def find_players(plain: str) -> str:
    """Parse 'Number of players: N' with various spelling variants."""
    m = re.search(r"Numbers? of players?:\s*([^\n]+)", plain, re.I)
    if not m:
        m = re.search(r"Number:\s*([^\n]+)", plain, re.I)
    if m:
        raw = m.group(1).strip()
        # Stop at a run of uppercase letters starting a new sentence
        raw = re.split(r"(?<=[0-9+])\s{2,}|\s+(?=[A-Z]{2}[a-z])", raw)[0]
        raw = re.sub(r"\s*[–—]\s*", "–", raw)
        return raw.strip()
    return ""

def find_format(plain: str) -> str:
    """Parse 'Scenario format: Larp/etc.'"""
    m = re.search(r"Scenario format:\s*([^\n]+)", plain, re.I)
    if m:
        f = m.group(1).strip()
        return re.split(r"\s+(?:Duration|Number|By)", f, flags=re.I)[0].strip()
    return ""

def find_description(
    plain: str,
    authors: str,
    duration: str,
    players: str,
    fmt: str,
    tags: list[str],
) -> str:
    """
    Extract the scenario description paragraphs —
    everything that isn't metadata or the tagwords line.
    """
    skip = set(filter(None, [authors, duration, players, fmt] + tags))
    lines = [ln.strip() for ln in plain.split("\n") if ln.strip()]
    desc_parts: list[str] = []

    for line in lines:
        if META_RE.search(line):
            continue
        if len(line) < 50:
            continue
        if line.startswith("http"):
            continue
        if any(sv and sv in line and len(sv) > 10 for sv in skip):
            continue
        if tags and len(tags) == 3 and all(t in line for t in tags):
            continue
        desc_parts.append(line)
        if len(" ".join(desc_parts)) > 500:
            break

    return " ".join(desc_parts)[:700]

def find_download(html: str) -> str:
    """Find the first download URL — PDF preferred, then Dropbox/Drive."""
    for pattern in [
        r'href=["\']([^"\']+\.pdf[^"\']*)["\']',
        r'href=["\']([^"\']*dropbox\.com[^"\']+)["\']',
        r'href=["\']([^"\']*drive\.google\.com[^"\']+)["\']',
    ]:
        m = re.search(pattern, html, re.I)
        if m:
            return m.group(1)
    return ""

def find_image(html: str) -> str:
    """Find the first scenario image (skip site header/logo images)."""
    for m in re.finditer(r'<img[^>]+src=["\']([^"\']+)["\']', html, re.I):
        img = m.group(1).split("?")[0]  # strip query string resizing params
        if not any(x in img for x in ["header", "cropped", "gravatar", "logo"]):
            return img
    return ""


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------
def get_year(link: str) -> int | None:
    m = re.search(r"scenarios-(\d{4})", link)
    return int(m.group(1)) if m else None

def parse_scenario(title: str, link: str, year: int | None, html_content: str) -> dict:
    plain   = strip_html(html_content)
    tags    = find_tags(plain)
    authors = find_authors(plain)
    dur     = find_duration(plain)
    players = find_players(plain)
    fmt     = find_format(plain)
    desc    = find_description(plain, authors, dur, players, fmt, tags)
    dl      = find_download(html_content)
    img     = find_image(html_content)

    return {
        "title":       title,
        "url":         link,
        "year":        year,
        "authors":     authors,
        "tags":        tags,
        "format":      fmt,
        "duration":    dur,
        "players":     players,
        "description": desc,
        "download":    dl,
        "image":       img,
    }


def is_scenario_url(link: str) -> bool:
    """True if this page is an individual scenario (not a year index page)."""
    if not re.search(r"/archive/scenarios-\d+/|/scenarios-2025/", link):
        return False
    # Exclude the year index pages themselves (they end with /scenarios-YYYY/)
    if re.search(r"/scenarios-\d+/$", link):
        return False
    return True


def parse_wxr(xml_path: str) -> list[dict]:
    print(f"Parsing {xml_path} …")
    tree = ET.parse(xml_path)
    root = tree.getroot()
    items = root.findall(".//item")
    print(f"  Total items in export: {len(items)}")

    scenarios = []
    for item in items:
        link   = item.findtext("link", "")
        status = item.findtext("wp:status", namespaces=NS)
        if status != "publish":
            continue
        if not is_scenario_url(link):
            continue

        html_content = item.findtext("content:encoded", namespaces=NS) or ""
        title        = clean_entities(item.findtext("title", ""))
        year         = get_year(link)
        scenarios.append(parse_scenario(title, link, year, html_content))

    scenarios.sort(key=lambda s: (s["year"] or 0, s["title"]))

    # Print summary
    total = len(scenarios)
    print(f"\n  Extracted {total} scenarios:")
    print(f"    Authors:     {sum(1 for s in scenarios if s['authors'])}/{total}")
    print(f"    Tags (×3):   {sum(1 for s in scenarios if len(s['tags'])==3)}/{total}")
    print(f"    Format:      {sum(1 for s in scenarios if s['format'])}/{total}")
    print(f"    Duration:    {sum(1 for s in scenarios if s['duration'])}/{total}")
    print(f"    Players:     {sum(1 for s in scenarios if s['players'])}/{total}")
    print(f"    Description: {sum(1 for s in scenarios if s['description'])}/{total}")
    print(f"    Download:    {sum(1 for s in scenarios if s['download'])}/{total}")
    print(f"    Image:       {sum(1 for s in scenarios if s['image'])}/{total}")

    return scenarios


def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_xml.py <export.xml>")
        sys.exit(1)

    xml_path = sys.argv[1]
    if not Path(xml_path).exists():
        print(f"File not found: {xml_path}")
        sys.exit(1)

    scenarios = parse_wxr(xml_path)

    out_path = Path(xml_path).parent / "scenarios.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(scenarios, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Saved {len(scenarios)} scenarios → {out_path}")
    print("  Copy scenarios.json next to index.html and you're done.")


if __name__ == "__main__":
    main()
