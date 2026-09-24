#!/usr/bin/env python3
"""Lint a Substack post drafted by the substack-post skill.

    lint_post.py post.md [--notes notes.md] [--slugs a,b] [--voice ~/.config/csarko-sh/voice.md] [--author]

Errors (exit 1) are the site's rules (no dashes, no email or phone), the link rules
(every doc linked, a link up top, UTM tags, no URL in a Note) and the catalogued AI
tells. Warnings are Substack's engagement findings (an image, lengths, a closing question), which a post may break on purpose.
A phrase on the voice profile's `## Protect` list is exempt from the AI tells only.
--author is for text Cyrus wrote himself: the AI-tell and formatting rules only warn
(the lists were built for model output, and his own words are his to keep), while the
site and link rules still fail.
See ../SKILL.md and docs/superpowers/specs/2026-09-23-substack-post-design.md.
"""

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[4]
VOICE = Path.home() / ".config/csarko-sh/voice.md"

# The same patterns deploy.sh refuses to publish.
EMAIL = re.compile(r'mailto:[^"]*|[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}', re.I)
PHONE = re.compile(r"\+1[ .-]?[0-9]{3}[ .-]?[0-9]{3}[ .-]?[0-9]{4}|\(?[0-9]{3}\)?[ .-][0-9]{3}-[0-9]{4}")
DASH = re.compile("[—–]")
URL = re.compile(r"https?://[^\s)\]>\"]+")
NOTE_URL = re.compile(r"https?://|www\.|\b[a-z0-9-]+\.(?:com|sh|io|net|org|dev|app|co|me|ai)\b", re.I)
BUTTON = re.compile(r"^\[[^\]]+\]\([^)\s]+\)$")
IMAGE = re.compile(r"^!\[[^\]]*\]\([^)\s]+\)$")
LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
WORD = re.compile(r"[A-Za-z0-9][\w'’-]*")

# From Wikipedia's "Signs of AI writing" and vale-ai-tells. Stems catch the inflections.
TELLS = [
    (re.compile(r"\b(?:delv\w*|tapestr\w*|testament|pivotal|crucial\w*|intricat\w*|interplay|meticulous\w*"
                r"|vibrant\w*|garner\w*|underscor\w*|boasts?|leverag\w*|harness\w*|navigat\w*|embark\w*"
                r"|foster\w*|spearhead\w*|showcas\w*|realms?|seamless\w*|robust\w*|game-changer\w*)\b", re.I),
     "AI-tell word"),
    (re.compile(r"\bnot (?:just|only|merely)\b[^.?!\n]{1,80}?\bbut\b", re.I),
     "negative parallelism (\"not just X, but Y\")"),
    (re.compile(r"\b(?:it|this|that)(?:'s not| is not| isn't)\b[^.?!\n]{1,80}?[,;]\s*(?:it|this|that)(?:'s| is)\b",
                re.I),
     "negative parallelism (\"it's not X, it's Y\")"),
    (re.compile(r"\b(?:serves?|served|serving|stands?|stood) as\b", re.I), "copula avoidance; say \"is\""),
    (re.compile(r"\bhere's the thing\b|\blet's dive\b|\bin today's\b", re.I), "staged opener"),
    (re.compile(r"(?:^|(?<=[.!?]\s))(?:in short|in conclusion|in summary|ultimately),", re.I | re.M),
     "summarising closer"),
]
LANDSCAPE = re.compile(r"\blandscapes?\b", re.I)
BOLD = re.compile(r"\*\*[^*\n]+\*\*|__[^_\n]+__")
TRIPLE = re.compile(r"\b[\w'-]+(?: [\w'-]+){0,2}, [\w'-]+(?: [\w'-]+){0,2},? (?:and|or) [\w'-]+", re.I)


@dataclass
class Finding:
    level: str  # "error" or "warning"
    line: int
    message: str
    file: str = "post"


def protect_list(voice_text):
    """The `- item` lines under the voice profile's `## Protect` heading, lowercased."""
    out, inside = [], False
    for line in voice_text.splitlines():
        if line.startswith("## "):
            inside = line[3:].strip().lower() == "protect"
        elif inside and line.lstrip().startswith("- "):
            item = line.lstrip()[2:].strip().lower()
            if item:
                out.append(item)
    return out


def published_slugs(folder):
    return {re.sub(r"^\d{4}-\d{2}-\d{2}-", "", p.stem) for p in Path(folder).glob("*.md")}


def _line(text, pos):
    return text.count("\n", 0, pos) + 1


def _paragraphs(text, start):
    """(offset, text) for each blank-line-separated block of text[start:]."""
    return [(start + m.start(), m.group(0)) for m in re.finditer(r"(?:[^\n]|\n(?![ \t]*\n))+", text[start:])
            if m.group(0).strip()]


def _words(text):
    return WORD.findall(LINK.sub(r"\1", text).replace("*", "").replace("#", ""))


def _site_rules(text, file):
    out = []
    for m in DASH.finditer(text):
        out.append(Finding("error", _line(text, m.start()), "em-dash or en-dash; use a comma, colon or semicolon", file))
    for m in EMAIL.finditer(text):
        out.append(Finding("error", _line(text, m.start()), f"email address ({m.group(0)}); never on the site or posts",
                           file))
    for m in PHONE.finditer(text):
        out.append(Finding("error", _line(text, m.start()), f"phone number ({m.group(0)}); never on the site or posts",
                           file))
    return out


def lint(text, notes=None, slugs=(), published=frozenset(), protect=(), author=False):
    tell = "warning" if author else "error"
    findings = _site_rules(text, "post")
    if notes is not None:
        findings += _site_rules(notes, "notes")
        for m in NOTE_URL.finditer(notes):
            findings.append(Finding("error", _line(notes, m.start()),
                                    f"URL in a Note ({m.group(0)}); name the post instead", "notes"))

    lines = [(m.start(), m.group(0)) for m in re.finditer(r"[^\n]*", text) if m.group(0).strip()]
    if not lines or not lines[0][1].startswith("# "):
        return findings + [Finding("error", 1, "post.md must start with '# <title>'")]
    if len(lines) < 2 or not lines[1][1].startswith("## "):
        return findings + [Finding("error", _line(text, lines[0][0]) + 1, "second line must be '## <subtitle>'")]
    title, subtitle = lines[0][1][2:].strip(), lines[1][1][3:].strip()
    paras = _paragraphs(text, lines[1][0] + len(lines[1][1]))
    button = paras.pop() if paras and BUTTON.match(paras[-1][1].strip()) else None
    body_start = paras[0][0] if paras else len(text)
    images = [(o, p) for o, p in paras if IMAGE.match(p.strip())]
    prose = [(o, p) for o, p in paras if not IMAGE.match(p.strip())]
    body_end = button[0] if button else len(text)
    body = text[:body_end].replace("’", "'")  # same length, so offsets hold

    # Links
    campaign, linked = None, set()
    for m in URL.finditer(text, lines[1][0]):
        parts = urlsplit(m.group(0))
        if parts.hostname not in ("csarko.sh", "www.csarko.sh"):
            continue
        ln = _line(text, m.start())
        q = {k: v[0] for k, v in parse_qs(parts.query).items()}
        if q.get("utm_source") != "substack" or q.get("utm_medium") != "email" or not q.get("utm_campaign"):
            findings.append(Finding("error", ln, "csarko.sh link needs utm_source=substack, utm_medium=email "
                                                 "and utm_campaign=<post-slug>"))
        elif campaign is None:
            campaign = q["utm_campaign"]
        elif q["utm_campaign"] != campaign:
            findings.append(Finding("error", ln, f"utm_campaign={q['utm_campaign']} differs from {campaign}; "
                                                 "all csarko.sh links share one"))
        doc = re.fullmatch(r"/research/([^/]+)/?", parts.path)
        if doc:
            linked.add(doc.group(1))
            if doc.group(1) not in published:
                findings.append(Finding("error", ln, f"/research/{doc.group(1)} is not in docs/published/"))
    for slug in slugs:
        if slug not in linked:
            findings.append(Finding("error", 1, f"doc {slug} is never linked as https://csarko.sh/research/{slug}"))
    if not any(urlsplit(u).hostname in ("csarko.sh", "www.csarko.sh")
               for _, p in prose[:2] for u in URL.findall(p)):
        findings.append(Finding("error", _line(text, body_start),
                                "no csarko.sh link in body paragraph 1 or 2; many readers never reach the bottom"))

    # AI tells, in the body only (the title and subtitle are checked too: they are the inbox preview)
    for pattern, label in TELLS:
        for m in pattern.finditer(body, lines[0][0]):
            hit = m.group(0).lower()
            if not any(p in hit for p in protect):
                findings.append(Finding(tell, _line(text, m.start()), f"{label}: \"{m.group(0).strip()}\""))
    for n, m in enumerate(BOLD.finditer(body, body_start)):
        if n == 2:
            findings.append(Finding(tell, _line(text, m.start()), "more than two bold spans"))
    for off, p in paras:
        for i, l in enumerate(p.splitlines()):
            if l.lstrip().startswith("#"):
                findings.append(Finding(tell, _line(text, off) + i, "header in the body; a short post is prose"))

    # Warnings: Substack's engagement findings
    tl = len(title.split())
    if not 9 <= tl <= 17:
        findings.append(Finding("warning", _line(text, lines[0][0]), f"title has {tl} words; 9 to 17 do best"))
    if title.endswith("?"):
        findings.append(Finding("warning", _line(text, lines[0][0]),
                                "title ends in a question mark; question titles do slightly worse"))
    sl = len(subtitle.split())
    if not 6 <= sl <= 10:
        findings.append(Finding("warning", _line(text, lines[1][0]), f"subtitle has {sl} words; 6 to 10 do best"))
    sw = {w.lower() for w in WORD.findall(subtitle) if len(w) >= 3}
    tw = {w.lower() for w in WORD.findall(title) if len(w) >= 3}
    if sw and len(sw & tw) / len(sw) > 0.5:
        findings.append(Finding("warning", _line(text, lines[1][0]),
                                "subtitle repeats the title; make it add something"))
    bw = sum(len(_words(p)) for _, p in prose)
    if not 300 <= bw <= 600:
        findings.append(Finding("warning", _line(text, body_start), f"body has {bw} words; aim for 300 to 600"))
    if prose and "?" not in prose[-1][1]:
        findings.append(Finding("warning", _line(text, prose[-1][0]),
                                "last paragraph asks no question; one closing question draws comments"))
    if not images:
        findings.append(Finding("warning", _line(text, body_start),
                                "no image in the post; Substack shows the first one as the social preview"))
    triples = list(TRIPLE.finditer(LINK.sub(lambda m: m.group(1).ljust(len(m.group(0))), body), body_start))
    if len(triples) > 2:
        findings.append(Finding("warning", _line(text, triples[2].start()),
                                f"{len(triples)} \"X, Y and Z\" lists; more than two reads as rule-of-three"))
    for m in LANDSCAPE.finditer(body, lines[0][0]):
        if not any(p in m.group(0).lower() for p in protect):
            findings.append(Finding("warning", _line(text, m.start()),
                                    "\"landscape\" as a metaphor is an AI tell; fine if you mean terrain"))
    return sorted(findings, key=lambda f: (f.file, f.line))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("post")
    ap.add_argument("--notes")
    ap.add_argument("--slugs", default="", help="comma-separated doc slugs the post must link")
    ap.add_argument("--voice", default=str(VOICE))
    ap.add_argument("--published", default=str(ROOT / "docs/published"))
    ap.add_argument("--author", action="store_true", help="the text is his own: AI tells only warn")
    a = ap.parse_args()

    voice = Path(a.voice).expanduser()
    protect = protect_list(voice.read_text(encoding="utf-8")) if voice.exists() else []
    if not voice.exists():
        print(f"note: no voice profile at {voice}; no protect list applied", file=sys.stderr)
    notes = Path(a.notes).read_text(encoding="utf-8") if a.notes else None
    findings = lint(Path(a.post).read_text(encoding="utf-8"), notes=notes,
                    slugs=[s for s in a.slugs.split(",") if s], published=published_slugs(a.published),
                    protect=protect, author=a.author)
    for f in findings:
        print(f"{a.notes if f.file == 'notes' else a.post}:{f.line}: {f.level}: {f.message}")
    errors = sum(f.level == "error" for f in findings)
    print(f"{errors} error(s), {len(findings) - errors} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
