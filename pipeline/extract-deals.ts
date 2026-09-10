/**
 * DealRadar — AI deal extraction pipeline.
 *
 * Reads venue sources (web pages, or pasted text such as Instagram captions), asks Claude to
 * extract structured deals matching the app's `Deal` schema, and writes them to
 * `out/deals.extracted.json` for human review before merging into `src/data/seed.ts`.
 *
 * Usage:
 *   cd pipeline && npm install
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npm run extract                               # all venues in sources.json
 *   npm run extract -- --venue sg-level33         # one venue
 *   npm run extract -- --venue sg-level33 --text ./caption.txt   # from pasted text instead of URLs
 *
 * Extracted deals get confidence 0.6 (0.8 if the model reports explicit times AND prices).
 * A human bumps confidence to 1.0 after verifying with the venue.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';

interface Source {
  venueId: string;
  venueName: string;
  urls: string[];
}

interface ExtractedDeal {
  type: 'breakfast' | 'brunch' | 'lunch' | 'happy_hour' | 'dinner' | 'late_night' | 'other';
  title: string;
  description: string;
  price?: number;
  originalPrice?: number;
  discountPct?: number;
  windows: { days: number[]; start: string; end: string }[];
  validUntil?: string;
  evidence: string;
  hasExplicitTimes: boolean;
  hasExplicitPrice: boolean;
}

const DEAL_TOOL: Anthropic.Tool = {
  name: 'record_deals',
  description: 'Record every current promotional deal found in the source text.',
  input_schema: {
    type: 'object',
    properties: {
      deals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['breakfast', 'brunch', 'lunch', 'happy_hour', 'dinner', 'late_night', 'other'],
            },
            title: { type: 'string', description: 'Short, specific, e.g. "Happy hour: 1-for-1 house pours"' },
            description: { type: 'string', description: 'One or two sentences with the concrete terms.' },
            price: { type: 'number', description: 'Deal price in local currency, if fixed-price.' },
            originalPrice: { type: 'number', description: 'Regular price, if stated.' },
            discountPct: { type: 'number', description: 'Percent saving if stated or clearly implied (1-for-1 = 50).' },
            windows: {
              type: 'array',
              description: 'When the deal applies. days: 0=Sun..6=Sat. Times HH:MM 24h local. end<start means past midnight.',
              items: {
                type: 'object',
                properties: {
                  days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
                  start: { type: 'string' },
                  end: { type: 'string' },
                },
                required: ['days', 'start', 'end'],
              },
            },
            validUntil: { type: 'string', description: 'ISO date if the promotion has an end date.' },
            evidence: { type: 'string', description: 'Verbatim snippet from the source supporting this deal.' },
            hasExplicitTimes: { type: 'boolean' },
            hasExplicitPrice: { type: 'boolean' },
          },
          required: ['type', 'title', 'description', 'windows', 'evidence', 'hasExplicitTimes', 'hasExplicitPrice'],
        },
      },
    },
    required: ['deals'],
  },
};

const SYSTEM = `You extract restaurant and bar promotions into structured data for a "best deal near me" app.
Rules:
- Only record deals actually stated in the source. Never invent times, prices or days.
- Skip generic marketing ("great food", "book now") and expired promotions (today is ${new Date().toISOString().slice(0, 10)}).
- If days are not stated but the deal is clearly a weekday office-crowd offer, use Mon–Fri and set hasExplicitTimes=false.
- "1-for-1", "buy one get one", "2-for-1" → discountPct 50.
- Happy hour = discounted drinks in a fixed window. Brunch = weekend/late-morning sets. Late night = starts 21:00 or later.
- Currency: keep the number only (S$12 → 12).`;

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DealRadarBot/0.1; +https://example.com/bot)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = htmlToText(await res.text());
  return text.slice(0, 40_000); // keep prompts bounded
}

async function extract(client: Anthropic, src: Source, text: string): Promise<ExtractedDeal[]> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    tools: [DEAL_TOOL],
    tool_choice: { type: 'tool', name: 'record_deals' },
    messages: [
      {
        role: 'user',
        content: `Venue: ${src.venueName}\n\nSource text:\n"""\n${text}\n"""\n\nRecord all current deals.`,
      },
    ],
  });
  const tool = msg.content.find((b) => b.type === 'tool_use');
  if (!tool || tool.type !== 'tool_use') return [];
  return ((tool.input as { deals: ExtractedDeal[] }).deals ?? []).filter((d) => d.windows?.length);
}

function toAppDeal(src: Source, d: ExtractedDeal, i: number, sourceUrl: string) {
  const confidence = d.hasExplicitTimes && d.hasExplicitPrice ? 0.8 : 0.6;
  return {
    id: `x-${src.venueId}-${d.type}-${i + 1}`,
    venueId: src.venueId,
    type: d.type,
    title: d.title,
    description: d.description,
    ...(d.price !== undefined ? { price: d.price } : {}),
    ...(d.originalPrice !== undefined ? { originalPrice: d.originalPrice } : {}),
    ...(d.discountPct !== undefined ? { discountPct: d.discountPct } : {}),
    windows: d.windows,
    ...(d.validUntil ? { validUntil: d.validUntil } : {}),
    sourceUrl,
    lastVerified: new Date().toISOString().slice(0, 10),
    confidence,
    _evidence: d.evidence, // review aid; strip before merging into seed.ts
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY first.');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const venueFilter = args.includes('--venue') ? args[args.indexOf('--venue') + 1] : undefined;
  const textFile = args.includes('--text') ? args[args.indexOf('--text') + 1] : undefined;

  const sources: Source[] = JSON.parse(readFileSync(join(__dirname, 'sources.json'), 'utf8'));
  const selected = venueFilter ? sources.filter((s) => s.venueId === venueFilter) : sources;
  if (!selected.length) throw new Error(`No sources match ${venueFilter}`);

  const client = new Anthropic();
  const out: ReturnType<typeof toAppDeal>[] = [];

  for (const src of selected) {
    const inputs: { text: string; url: string }[] = [];
    if (textFile) {
      inputs.push({ text: readFileSync(textFile, 'utf8'), url: `file://${textFile}` });
    } else {
      for (const url of src.urls) {
        try {
          inputs.push({ text: await fetchText(url), url });
        } catch (e) {
          console.warn(`  ! ${src.venueId}: ${(e as Error).message}`);
        }
      }
    }
    for (const { text, url } of inputs) {
      if (text.length < 200) {
        console.warn(`  ! ${src.venueId}: too little text from ${url} (JS-rendered site? paste text with --text)`);
        continue;
      }
      const deals = await extract(client, src, text);
      console.log(`  ${src.venueId}: ${deals.length} deal(s) from ${url}`);
      deals.forEach((d, i) => out.push(toAppDeal(src, d, i, url)));
    }
  }

  const outDir = join(__dirname, 'out');
  if (!existsSync(outDir)) mkdirSync(outDir);
  const outFile = join(outDir, 'deals.extracted.json');
  writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.length} deal(s) → ${outFile}\nReview, then merge into src/data/seed.ts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
