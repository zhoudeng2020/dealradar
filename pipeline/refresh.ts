/**
 * Scheduled catalogue refresh.
 *
 * Two jobs with deliberately different trust levels:
 *
 *   --verify    Re-read each deal's source page and check the record still
 *               holds. This is a fact check: it generates nothing, it only
 *               confirms or denies what is already written. Safe to run
 *               unattended and safe to auto-merge.
 *
 *   --discover  Ask Claude to extract deals it finds on venue pages. This
 *               generates records, which is how the original dataset filled up
 *               with plausible fiction. Output always lands in a proposal file
 *               for a human to read; it is never merged automatically.
 *
 * Both write to pipeline/out/. Neither writes feed/deals.json directly.
 *
 *   npm run refresh -- --verify
 *   npm run refresh -- --discover --limit 10
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FEED = join(ROOT, 'feed/deals.json');
const OUT_DIR = join(ROOT, 'pipeline/out');

const UA = 'EatRadarBot/1.0 (+deal freshness check)';
const TIMEOUT_MS = 20_000;

interface Deal {
  id: string;
  venueId: string;
  title: string;
  price?: number;
  originalPrice?: number;
  discountPct?: number;
  windows: { days: number[]; start: string; end: string }[];
  validUntil?: string;
  sourceUrl: string;
  lastVerified: string;
  confidence: number;
  /** Verbatim snippet the record was built from, when one was captured. */
  evidence?: string;
}
interface Venue { id: string; name: string; website?: string }
interface Feed { schema: number; generatedAt: string; venues: Venue[]; deals: Deal[] }

type Verdict = 'confirmed' | 'evidence-gone' | 'page-unreachable' | 'no-evidence-recorded' | 'expired';

interface Check {
  dealId: string;
  venue: string;
  title: string;
  verdict: Verdict;
  detail: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Strip tags and collapse whitespace so quotes match regardless of markup. */
function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Loose comparison: case, punctuation and spacing vary constantly on these pages. */
const loosen = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return toText(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A deal is confirmed when its recorded evidence still appears on its source
 * page. With no evidence recorded we fall back to the price, which is weaker
 * but still catches a venue that has changed or withdrawn an offer.
 */
function checkAgainst(deal: Deal, pageText: string): { verdict: Verdict; detail: string } {
  const page = loosen(pageText);
  if (deal.evidence) {
    const found = page.includes(loosen(deal.evidence));
    return found
      ? { verdict: 'confirmed', detail: 'evidence still on page' }
      : { verdict: 'evidence-gone', detail: `quote no longer found: "${deal.evidence.slice(0, 60)}"` };
  }
  if (deal.price != null) {
    const forms = [`${deal.price}`, deal.price.toFixed(2), `${Math.round(deal.price)}`];
    const found = forms.some((f) => page.includes(loosen(f)));
    return found
      ? { verdict: 'confirmed', detail: `price ${deal.price} still on page (weak check - no evidence recorded)` }
      : { verdict: 'evidence-gone', detail: `price ${deal.price} no longer on page (weak check)` };
  }
  return { verdict: 'no-evidence-recorded', detail: 'nothing mechanically checkable; needs a human' };
}

async function verify(feed: Feed, limit?: number) {
  const venueName = new Map(feed.venues.map((v) => [v.id, v.name]));
  const deals = limit ? feed.deals.slice(0, limit) : feed.deals;
  const checks: Check[] = [];

  // One page fetch can serve several deals at the same venue.
  const pages = new Map<string, string | null>();
  for (const url of new Set(deals.map((d) => d.sourceUrl))) {
    try {
      pages.set(url, await fetchText(url));
    } catch (e) {
      pages.set(url, null);
      console.error(`  unreachable: ${url} (${(e as Error).message})`);
    }
  }

  for (const deal of deals) {
    const name = venueName.get(deal.venueId) ?? deal.venueId;
    if (deal.validUntil && deal.validUntil < today()) {
      checks.push({ dealId: deal.id, venue: name, title: deal.title, verdict: 'expired', detail: `ended ${deal.validUntil}` });
      continue;
    }
    const page = pages.get(deal.sourceUrl);
    if (page == null) {
      checks.push({ dealId: deal.id, venue: name, title: deal.title, verdict: 'page-unreachable', detail: deal.sourceUrl });
      continue;
    }
    const { verdict, detail } = checkAgainst(deal, page);
    checks.push({ dealId: deal.id, venue: name, title: deal.title, verdict, detail });
  }

  // Confirmed deals get their lastVerified bumped. That is the only change this
  // job makes to the data, and it asserts only "the page still says this".
  const confirmed = new Set(checks.filter((c) => c.verdict === 'confirmed').map((c) => c.dealId));
  const updated: Feed = {
    ...feed,
    generatedAt: new Date().toISOString(),
    deals: feed.deals.map((d) => (confirmed.has(d.id) ? { ...d, lastVerified: today() } : d)),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'verify-report.json'), JSON.stringify(checks, null, 2));
  writeFileSync(join(OUT_DIR, 'verified-feed.json'), JSON.stringify(updated, null, 2) + '\n');

  const by = (v: Verdict) => checks.filter((c) => c.verdict === v);
  const lines = [
    `# Catalogue verification — ${today()}`,
    '',
    `Checked ${checks.length} deals across ${pages.size} pages.`,
    '',
    `- ${by('confirmed').length} confirmed, \`lastVerified\` bumped`,
    `- ${by('evidence-gone').length} **no longer found on the page**`,
    `- ${by('page-unreachable').length} page unreachable`,
    `- ${by('expired').length} past their end date`,
    `- ${by('no-evidence-recorded').length} not mechanically checkable`,
  ];
  for (const v of ['evidence-gone', 'page-unreachable', 'expired'] as Verdict[]) {
    const rows = by(v);
    if (!rows.length) continue;
    lines.push('', `## ${v}`, '');
    for (const r of rows) lines.push(`- \`${r.dealId}\` — ${r.venue}: ${r.title}  \n  ${r.detail}`);
  }
  lines.push(
    '',
    '---',
    '',
    'Nothing here has been removed. A deal that stopped matching may have moved on',
    'the page, or the page may have been restyled — decide venue by venue.',
  );
  writeFileSync(join(OUT_DIR, 'verify-report.md'), lines.join('\n') + '\n');

  console.log(lines.slice(0, 9).join('\n'));
  console.log(`\nwrote ${OUT_DIR}/verify-report.md and verified-feed.json`);
  return checks.some((c) => c.verdict !== 'confirmed');
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;
  const feed: Feed = JSON.parse(readFileSync(FEED, 'utf8'));

  if (args.includes('--verify')) {
    await verify(feed, limit);
    return;
  }
  if (args.includes('--discover')) {
    console.error(
      'Discovery runs through pipeline/extract-deals.ts, which writes a proposal for review.\n' +
        'Run: npm run extract   — then read pipeline/out/deals.extracted.json before merging anything.\n' +
        'It is deliberately not wired into this job: extraction generates records, and unreviewed\n' +
        'generated records are what filled this dataset with venues that had closed years earlier.',
    );
    process.exit(2);
  }
  console.error('Usage: refresh.ts --verify [--limit N]');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
