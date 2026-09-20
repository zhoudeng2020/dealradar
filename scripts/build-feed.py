#!/usr/bin/env python3
"""
Generate feed/deals.json from the bundled seed files.

The app prefers this feed over its bundled copy, so publishing it updates every
installed app without a release. Run after editing seed data:

    python3 scripts/build-feed.py

Output is validated before writing: the same integrity rules the app applies at
runtime and the test suite applies at build time.
"""
import json, re, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = [ROOT / 'src/data/seed.ts', ROOT / 'src/data/seed.additions.ts']
OUT = ROOT / 'feed/deals.json'
SCHEMA = 1

DAY_CONSTS = {'MON_FRI': [1, 2, 3, 4, 5], 'SAT_SUN': [0, 6], 'DAILY': [0, 1, 2, 3, 4, 5, 6]}


def blocks(text):
    out, i = [], 0
    while True:
        m = re.search(r'\n  \{\n', text[i:])
        if not m:
            return out
        start = i + m.start() + 1
        end = text.find('\n  },', start)
        if end == -1:
            return out
        out.append(text[start:end])
        i = end + 5


def s_field(block, key, consts):
    """A string field, single- or double-quoted, or a bare const identifier."""
    m = re.search(rf"\b{key}: '([^']*)'", block) or re.search(rf'\b{key}: "([^"]*)"', block)
    if m:
        return m.group(1)
    m = re.search(rf'\b{key}: ([A-Z_][A-Z_0-9]*),', block)
    return consts.get(m.group(1)) if m else None


def n_field(block, key):
    m = re.search(rf'\b{key}: (-?[\d.]+),', block)
    return float(m.group(1)) if m else None


def windows(block, key):
    m = re.search(rf'\b{key}: \[', block)
    if not m:
        return []
    depth, i = 0, m.end() - 1
    while i < len(block):
        if block[i] == '[':
            depth += 1
        elif block[i] == ']':
            depth -= 1
            if depth == 0:
                break
        i += 1
    body = block[m.end():i]
    out = []
    for d, a, b in re.findall(r"days: (\[[^\]]*\]|[A-Z_]+), start: '([^']+)', end: '([^']+)'", body):
        d = d.strip()
        days = DAY_CONSTS[d] if d in DAY_CONSTS else [int(n) for n in re.findall(r'\d', d)]
        out.append({'days': days, 'start': a, 'end': b})
    return out


venues, deals = [], []
for path in SOURCES:
    text = path.read_text(encoding='utf-8')
    consts = dict(re.findall(r"const ([A-Z_][A-Z_0-9]*) = '([^']*)';", text))
    for b in blocks(text):
        if not re.search(r"\bid: '", b):
            continue
        if 'venueId:' in b:
            deal = {
                'id': s_field(b, 'id', consts),
                'venueId': s_field(b, 'venueId', consts),
                'type': s_field(b, 'type', consts),
                'title': s_field(b, 'title', consts),
                'description': s_field(b, 'description', consts) or '',
                'windows': windows(b, 'windows'),
                'sourceUrl': s_field(b, 'sourceUrl', consts),
                'lastVerified': s_field(b, 'lastVerified', consts),
                'confidence': n_field(b, 'confidence'),
            }
            for opt in ('price', 'originalPrice', 'discountPct'):
                v = n_field(b, opt)
                if v is not None:
                    deal[opt] = v
            for opt in ('validFrom', 'validUntil'):
                v = s_field(b, opt, consts)
                if v:
                    deal[opt] = v
            deals.append(deal)
        else:
            venue = {
                'id': s_field(b, 'id', consts),
                'name': s_field(b, 'name', consts),
                'city': s_field(b, 'city', consts),
                'location': {'lat': n_field(b, 'lat'), 'lng': n_field(b, 'lng')},
                'address': s_field(b, 'address', consts),
                'cuisine': s_field(b, 'cuisine', consts),
                'hours': windows(b, 'hours'),
                'outdoor': bool(re.search(r'outdoor: true', b)),
            }
            site = s_field(b, 'website', consts)
            if site:
                venue['website'] = site
            venues.append(venue)

# --- refuse to publish anything the app would reject ---
errors = []
by_id = {v['id']: v for v in venues}
if len(by_id) != len(venues):
    errors.append('duplicate venue ids')
if len({d['id'] for d in deals}) != len(deals):
    errors.append('duplicate deal ids')

def span(w):
    to_min = lambda t: int(t[:2]) * 60 + int(t[3:])
    s_, e_ = to_min(w['start']), to_min(w['end'])
    return (s_, e_ + 1440 if e_ <= s_ else e_)

for v in venues:
    for k, val in v.items():
        if val is None:
            errors.append(f"{v['id']}: missing {k}")
    if not v['hours']:
        errors.append(f"{v['id']}: no hours")
for d in deals:
    if d['venueId'] not in by_id:
        errors.append(f"{d['id']}: unknown venue {d['venueId']}"); continue
    for k in ('id', 'type', 'title', 'sourceUrl', 'lastVerified', 'confidence'):
        if d.get(k) is None:
            errors.append(f"{d['id']}: missing {k}")
    if not d['windows']:
        errors.append(f"{d['id']}: no windows"); continue
    hours = by_id[d['venueId']]['hours']
    for w in d['windows']:
        ds, de = span(w)
        for day in w['days']:
            if not any(day in h['days'] and ((lambda a, b: b - a >= 1440 or (ds >= a and de <= b))(*span(h)))
                       for h in hours):
                errors.append(f"{d['id']}: day {day} outside {by_id[d['venueId']]['name']} hours")
                break

if errors:
    print('REFUSING TO WRITE - %d problem(s):' % len(errors), file=sys.stderr)
    for e in errors[:20]:
        print('  ', e, file=sys.stderr)
    sys.exit(1)

OUT.write_text(json.dumps({
    'schema': SCHEMA,
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    'venues': venues,
    'deals': deals,
}, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(f'wrote {OUT.relative_to(ROOT)}: {len(venues)} venues, {len(deals)} deals')
