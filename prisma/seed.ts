/**
 * Development database seed
 * ─────────────────────────
 * Fills every table in the schema with realistic, internally consistent Indian
 * real-estate data: users & roles, builders, projects (with images, ratings,
 * saves, comments, reactions, view events and computed stats), knowledge base,
 * blogs, consultation services, consultations with chat threads, project
 * submission requests, notifications and pending registrations.
 *
 *   npx prisma db seed            (uses `migrations.seed` in prisma.config.ts)
 *   npx tsx prisma/seed.ts        (direct)
 *
 * ⚠️  It TRUNCATES EVERY TABLE first, so it is safe to re-run but destroys data.
 *     It refuses to run with NODE_ENV=production or against a non-local host
 *     unless SEED_ALLOW_REMOTE=true.
 *
 * Environment variables
 *   DATABASE_URL        required
 *   SEED_SCALE          multiplies volume (default 1; e.g. 0.5 or 3)
 *   SEED_PASSWORD       password for every seeded account (default "Password@123")
 *   SEED_RANDOM_SEED    makes the data reproducible (default 42)
 *   SEED_ALLOW_REMOTE   "true" to allow a non-local database host (e.g. a Neon dev branch)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { fakerEN_IN as faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";

// ───────────────────────────────────────────────────────────────────────────────
// Configuration
// ───────────────────────────────────────────────────────────────────────────────

const SCALE = Math.max(0.25, Number(process.env.SEED_SCALE ?? 1) || 1);
const n = (base: number) => Math.max(1, Math.round(base * SCALE));

const CONFIG = {
  randomSeed: Number(process.env.SEED_RANDOM_SEED ?? 42),
  password: process.env.SEED_PASSWORD ?? "Password@123",
  bcryptRounds: 10,
  emailDomain: "example.com",
  /** Role names as stored in `roles.name` — change these to match your app's auth checks. */
  roles: { admin: "ADMIN", sme: "SME", user: "USER" } as const,
  counts: {
    smes: 4,
    users: n(40),
    projects: n(60),
    visitors: n(1500),
    viewEvents: n(6000),
    consultations: n(24),
    projectRequests: n(12),
  },
};

// ───────────────────────────────────────────────────────────────────────────────
// Prisma client + safety guard
// ───────────────────────────────────────────────────────────────────────────────

function assertSafeTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV is 'production'. This script wipes every table.");
  }
  const { hostname, pathname } = new URL(url);
  const localHosts = ["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "db", "host.docker.internal"];
  if (!localHosts.includes(hostname) && process.env.SEED_ALLOW_REMOTE !== "true") {
    throw new Error(
      `Refusing to seed remote host "${hostname}". This script wipes every table.\n` +
        `If this really is a development database, re-run with SEED_ALLOW_REMOTE=true.`,
    );
  }
  return `${hostname}${pathname}`;
}

const target = assertSafeTarget();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

faker.seed(CONFIG.randomSeed);

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;
const NOW = new Date();

const uuid = () => faker.string.uuid();
const pick = <T>(arr: readonly T[]): T => faker.helpers.arrayElement(arr);
const chance = (p: number) => faker.number.float() < p;
const int = (min: number, max: number) => faker.number.int({ min, max });
const float = (min: number, max: number) => faker.number.float({ min, max });
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);
const clampToNow = (d: Date) => (d > NOW ? new Date(NOW) : d);
const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);
const between = (from: Date, to: Date) => (from >= to ? new Date(to) : faker.date.between({ from, to }));
const maxDate = (...ds: Date[]) => new Date(Math.max(...ds.map((d) => d.getTime())));
const money = (v: number) => v.toFixed(2);
const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A date after `from`, at most `maxMs` later, never in the future. */
const after = (from: Date, minMs: number, maxMs: number) =>
  clampToNow(addMs(from, faker.number.int({ min: minMs, max: Math.max(minMs, maxMs) })));

async function inBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>, size = 1000) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

/** Returns a function that picks items with probability proportional to `weight`. */
function weightedPicker<T>(items: readonly T[], weight: (t: T) => number) {
  const cumulative: number[] = [];
  let total = 0;
  for (const it of items) cumulative.push((total += Math.max(0, weight(it))));
  return () => {
    const r = faker.number.float({ min: 0, max: total });
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return items[lo];
  };
}

/** Picks up to `k` distinct items using a weighted picker. */
function pickDistinct<T>(picker: () => T, k: number, exclude: Set<T> = new Set()): T[] {
  const out = new Set<T>();
  for (let tries = 0; out.size < k && tries < k * 20; tries++) {
    const it = picker();
    if (!exclude.has(it)) out.add(it);
  }
  return [...out];
}

type Trend = "hot" | "steady" | "cooling";

/**
 * Activity timestamp biased by a project's trend: "hot" projects get much of
 * their activity in the last 7 days, "cooling" ones very little. This gives
 * the trending/popularity stats something meaningful to rank.
 */
function activityDate(trend: Trend, windowDays: number, notBefore: Date): Date {
  let ago: number;
  if (trend === "hot") ago = chance(0.5) ? float(0, 7) : float(0, windowDays);
  else if (trend === "cooling") ago = chance(0.95) ? float(7, windowDays) : float(0, 7);
  else ago = float(0, windowDays);
  const d = daysAgo(ago);
  return d < notBefore ? between(notBefore, NOW) : d;
}

const step = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t = Date.now();
  const result = await fn();
  console.log(`  ✓ ${label.padEnd(34)} ${String(Date.now() - t).padStart(5)} ms`);
  return result;
};

// ───────────────────────────────────────────────────────────────────────────────
// Static reference data
// ───────────────────────────────────────────────────────────────────────────────

const CITIES = [
  { city: "Gurugram", state: "Haryana", lat: 28.4595, lng: 77.0266, mult: 1.3,
    localities: ["Sector 65", "Golf Course Extension Road", "Sohna Road", "Dwarka Expressway", "Sector 82"] },
  { city: "Noida", state: "Uttar Pradesh", lat: 28.5355, lng: 77.391, mult: 0.9,
    localities: ["Sector 150", "Sector 137", "Noida Extension", "Sector 75"] },
  { city: "New Delhi", state: "Delhi", lat: 28.6139, lng: 77.209, mult: 1.4,
    localities: ["Dwarka", "Vasant Kunj", "Saket", "Rohini"] },
  { city: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777, mult: 1.6,
    localities: ["Andheri West", "Powai", "Goregaon East", "Chembur", "Borivali West"] },
  { city: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567, mult: 0.95,
    localities: ["Hinjewadi", "Kharadi", "Baner", "Wakad"] },
  { city: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946, mult: 1.15,
    localities: ["Whitefield", "Sarjapur Road", "Hebbal", "Electronic City", "Yelahanka"] },
  { city: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867, mult: 1.0,
    localities: ["Gachibowli", "Kokapet", "Kondapur", "Miyapur"] },
  { city: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707, mult: 0.9,
    localities: ["OMR", "Porur", "Perungudi", "Tambaram"] },
  { city: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639, mult: 0.75,
    localities: ["New Town", "Rajarhat", "EM Bypass"] },
  { city: "Ahmedabad", state: "Gujarat", lat: 23.0225, lng: 72.5714, mult: 0.7,
    localities: ["SG Highway", "Bopal", "Gota"] },
] as const;

const BUILDERS = [
  "Aravali Heights Developers", "Konkan Coast Realty", "Deccan Crest Builders", "Nilgiri Homes",
  "Sapphire Spaces", "Vrindavan Infra", "Meridian Estates", "Brahmaputra Buildcon",
  "Lotus Greens Infratech", "Coastal Horizon Constructions", "Sahyadri Habitats", "Indus Valley Realtors",
];

type ProjectType = Prisma.projectsCreateManyInput["project_type"] & string;
type ProjectStatus = Prisma.projectsCreateManyInput["status"] & string;

const PROJECT_TYPES: { value: ProjectType; weight: number; price: [number, number]; suffixes: string[]; label: string }[] = [
  { value: "APARTMENT", weight: 45, price: [4_500_000, 40_000_000], label: "residential apartment",
    suffixes: ["Heights", "Residency", "Towers", "Apartments", "Enclave", "Greens", "Vista", "Avenue"] },
  { value: "VILLA", weight: 10, price: [15_000_000, 120_000_000], label: "gated villa",
    suffixes: ["Villas", "Estates", "Manor", "Bungalows"] },
  { value: "PLOT", weight: 10, price: [2_500_000, 30_000_000], label: "residential plotted",
    suffixes: ["Plots", "Meadows", "Acres", "County"] },
  { value: "BUILDER_FLOOR", weight: 12, price: [8_000_000, 50_000_000], label: "independent builder floor",
    suffixes: ["Floors", "Homes", "Residences"] },
  { value: "COMMERCIAL", weight: 10, price: [5_000_000, 80_000_000], label: "commercial",
    suffixes: ["Business Park", "Trade Centre", "Corporate Tower", "Galleria"] },
  { value: "TOWNSHIP", weight: 7, price: [4_000_000, 60_000_000], label: "integrated township",
    suffixes: ["City", "Township", "Integrated Township"] },
  { value: "OTHER", weight: 6, price: [3_000_000, 20_000_000], label: "serviced living",
    suffixes: ["Serviced Residences", "Senior Living", "Co-living"] },
];

const PROJECT_STATUSES: { value: ProjectStatus; weight: number }[] = [
  { value: "UPCOMING", weight: 20 },
  { value: "ONGOING", weight: 40 },
  { value: "COMPLETED", weight: 25 },
  { value: "SOLD_OUT", weight: 8 },
  { value: "UNKNOWN", weight: 7 },
];

const NAME_PREFIXES = [
  "Aurum", "Emerald", "Sapphire", "Skyline", "Green", "Royal", "Silver", "Palm", "Lake", "Orchid",
  "Crystal", "Urban", "Serene", "Golden", "Maple", "Riverside", "Sunrise", "Ivory", "Zenith", "Amber",
];

const AMENITIES = [
  "a clubhouse", "an infinity pool", "a jogging track", "EV charging points", "a co-working lounge",
  "a children's play area", "24×7 security with CCTV", "rainwater harvesting", "a landscaped central park",
  "a multipurpose sports court", "power backup for common areas", "a senior citizens' garden",
];

const RATING_CATEGORIES = [
  { code: "LOCATION_CONNECTIVITY", name: "Location & Connectivity",
    description: "Access to metro, highways, schools, hospitals and workplaces." },
  { code: "AMENITIES_FACILITIES", name: "Amenities & Facilities",
    description: "Clubhouse, sports, parking, security and other shared facilities." },
  { code: "SURROUNDING_ENVIRONMENT", name: "Surrounding Environment",
    description: "Greenery, air and noise levels, cleanliness and neighbourhood feel." },
  { code: "CONSTRUCTION_QUALITY", name: "Construction Quality",
    description: "Materials, finishing, workmanship and structural soundness." },
  { code: "BUILDER", name: "Builder",
    description: "Track record, delivery timelines, transparency and after-sales support." },
] as const;

const TOP_COMMENTS = [
  "Visited the site last weekend. Construction looks on track and the sample flat is well finished.",
  "How is the water supply here? Is it municipal or borewell-based?",
  "The location is great for anyone working nearby, but traffic at peak hours can be heavy.",
  "Is this project RERA registered? I couldn't find the number on the brochure.",
  "Prices have gone up almost 15% since launch. Is it still worth it?",
  "We moved in six months ago. Maintenance is decent, though the lifts need servicing more often.",
  "Does anyone know the actual carpet area of the 3 BHK units?",
  "Possession was promised for this year — has anyone received a revised date?",
  "Good project, but the loading on super built-up area seems high.",
  "Metro connectivity will improve a lot once the new line opens.",
  "The clubhouse is still not complete even though the towers are handed over.",
  "Which banks have approved this project for home loans?",
  "Parking allocation is a concern — only one covered slot per unit.",
  "Nearby schools and hospitals are within 3–4 km, which is convenient.",
  "Is there any festive offer running right now?",
  "The builder's previous projects were delivered on time, so I'm fairly confident about this one.",
  "Air quality in winter is a real issue in this area. Factor that in.",
  "Has anyone checked if the OC has been received for the completed towers?",
  "Rental yield here is around 3%, which is reasonable for the area.",
  "Floor plans are efficient — very little wasted corridor space.",
];

const REPLIES = [
  "Thanks, that's really helpful!",
  "Same experience here. The site office was quite transparent.",
  "You can check the RERA number on the state RERA portal — it's listed there.",
  "I asked the sales team; they said the revised timeline is about six months later.",
  "Agreed. Always ask for the carpet area in writing in the agreement.",
  "SBI and HDFC have both approved it, as far as I know.",
  "Not really — I'd negotiate on the PLC instead of waiting for an offer.",
  "Water supply is municipal plus a backup borewell, according to the RWA.",
  "Can you share which tower you're in?",
  "That's a fair point, but the location premium makes up for it.",
  "The OC for towers A and B came through last month.",
  "I'd suggest visiting on a weekday evening to see the real traffic situation.",
];

const SME_REPLIES = [
  "Expert tip: ask for the RERA-defined carpet area in the agreement and compare it with the super built-up figure — loading above 30% deserves a closer look.",
  "Before booking, check the project's quarterly progress updates on the RERA portal; they show whether construction matches the payment demands.",
  "For ready-to-move units, insist on seeing the Occupancy Certificate. Without it, registration and utility connections can be delayed.",
];

// ───────────────────────────────────────────────────────────────────────────────
// Knowledge base content
// ───────────────────────────────────────────────────────────────────────────────

const KNOWLEDGE_CATEGORIES = [
  { name: "Legal & Documentation", description: "Approvals, certificates and documents every buyer should check." },
  { name: "Area & Measurements", description: "How property area is measured and what you actually pay for." },
  { name: "Finance & Home Loans", description: "Loans, EMIs and payment plans explained." },
  { name: "Taxes & Charges", description: "Stamp duty, registration, GST and other costs of buying." },
  { name: "Construction & Approvals", description: "Plans, charges and timelines during construction." },
];

const KNOWLEDGE_TAGS = [
  "RERA", "Legal", "Buyer Protection", "Measurement", "Home Loans", "Tax",
  "Documentation", "Under Construction", "Ready to Move", "First-time Buyer", "Bengaluru",
];

type Level = "BEGINNER" | "INTERMEDIATE" | "PROFESSIONAL";
type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
const KNOWLEDGE_TOPICS: {
  category: number; title: string; level: Level; status?: ContentStatus; tags: string[];
  definition: string; simple: string;
}[] = [
  { category: 0, title: "RERA", level: "BEGINNER", tags: ["RERA", "Legal", "Buyer Protection", "First-time Buyer"],
    definition: "The Real Estate (Regulation and Development) Act, 2016 set up a real estate regulatory authority in each state. Most projects above 500 sq m or eight apartments must be registered, and promoters must keep 70% of buyer collections in a separate account used for construction and land costs.",
    simple: "A law that makes builders register projects, share progress publicly and use your money only for your project." },
  { category: 0, title: "Occupancy Certificate", level: "INTERMEDIATE", tags: ["Documentation", "Ready to Move", "Legal"],
    definition: "A certificate issued by the local planning authority confirming that a building has been constructed according to the sanctioned plan and is fit for occupation.",
    simple: "Official proof that the building is safe and legal to live in." },
  { category: 0, title: "Completion Certificate", level: "INTERMEDIATE", tags: ["Documentation", "Legal"],
    definition: "A document from the local authority stating that construction has been completed in compliance with approved plans, building bye-laws and applicable norms.",
    simple: "Confirms the builder finished the building the way it was approved." },
  { category: 0, title: "Encumbrance Certificate", level: "INTERMEDIATE", tags: ["Documentation", "Legal", "Buyer Protection"],
    definition: "A certificate from the sub-registrar's office listing registered transactions on a property over a chosen period, used to confirm it is free of mortgages or other monetary or legal liabilities.",
    simple: "Shows whether anyone else has a claim or loan on the property." },
  { category: 0, title: "Agreement for Sale vs Sale Deed", level: "BEGINNER", tags: ["Documentation", "Legal", "First-time Buyer"],
    definition: "An agreement for sale records the terms on which the property will be transferred in future; the sale deed is the registered conveyance that actually transfers ownership to the buyer.",
    simple: "The agreement is the promise to sell; the sale deed is the actual transfer." },
  { category: 0, title: "Title Search", level: "PROFESSIONAL", tags: ["Legal", "Documentation"],
    definition: "An examination of the chain of ownership documents, typically going back 30 years, to confirm the seller holds clear and marketable title and to identify defects, disputes or encumbrances.",
    simple: "Checking the property's ownership history to make sure the seller really owns it." },
  { category: 1, title: "Carpet Area", level: "BEGINNER", tags: ["Measurement", "RERA", "First-time Buyer"],
    definition: "Under RERA, the net usable floor area of an apartment, excluding external walls, service shafts, exclusive balconies or verandahs and exclusive open terraces, but including internal partition walls.",
    simple: "The area inside your walls that you can actually use." },
  { category: 1, title: "Built-up Area", level: "BEGINNER", tags: ["Measurement"],
    definition: "Carpet area plus the thickness of external walls and, depending on local practice, balconies and other exclusive spaces attached to the unit.",
    simple: "Your usable area plus the walls and balconies." },
  { category: 1, title: "Super Built-up Area", level: "INTERMEDIATE", tags: ["Measurement", "Buyer Protection"],
    definition: "Built-up area plus a proportionate share of common areas such as lobbies, staircases, lift wells and the clubhouse. The difference from carpet area is often called the loading factor.",
    simple: "Your flat plus your share of the building's common spaces." },
  { category: 1, title: "Floor Space Index (FSI)", level: "PROFESSIONAL", tags: ["Measurement", "Legal"],
    definition: "Also called Floor Area Ratio, it is the ratio of total permissible built-up area to plot area, set by local development regulations to control density.",
    simple: "A rule that limits how much can be built on a piece of land." },
  { category: 2, title: "Home Loan EMI", level: "BEGINNER", tags: ["Home Loans", "First-time Buyer"],
    definition: "An Equated Monthly Instalment is the fixed monthly payment that repays a loan's principal and interest over its tenure.",
    simple: "The amount you pay the bank every month for your home loan." },
  { category: 2, title: "Loan-to-Value Ratio", level: "INTERMEDIATE", tags: ["Home Loans"],
    definition: "The share of a property's value a lender will finance. RBI caps it at 90% for loans up to ₹30 lakh, 80% for ₹30–75 lakh and 75% above ₹75 lakh.",
    simple: "How much of the home's price the bank will lend — the rest is your down payment." },
  { category: 2, title: "Pre-EMI Interest", level: "INTERMEDIATE", tags: ["Home Loans", "Under Construction"],
    definition: "Interest-only payments on the amount disbursed so far, paid during construction before full EMIs begin.",
    simple: "Interest you pay while the flat is still being built." },
  { category: 2, title: "Construction-Linked Payment Plan", level: "INTERMEDIATE", tags: ["Under Construction", "Home Loans"],
    definition: "A payment schedule in which instalments fall due when the project reaches defined construction milestones rather than on fixed dates.",
    simple: "You pay as the building goes up, not all at once." },
  { category: 3, title: "Stamp Duty", level: "BEGINNER", tags: ["Tax", "First-time Buyer"],
    definition: "A state-levied tax on property transfer documents. Rates vary by state, commonly between 4% and 8% of the property value, and several states offer concessions for women buyers.",
    simple: "A state tax you pay to make the purchase official." },
  { category: 3, title: "Registration Charges", level: "BEGINNER", tags: ["Tax", "Documentation"],
    definition: "Fees paid to the sub-registrar to register the sale deed, typically around 1% of the property value, subject to state-specific caps.",
    simple: "The fee to record your purchase in government records." },
  { category: 3, title: "GST on Under-Construction Property", level: "INTERMEDIATE", tags: ["Tax", "Under Construction"],
    definition: "GST applies to under-construction residential property at 5% without input tax credit, or 1% for affordable housing. Ready-to-move property with an Occupancy Certificate attracts no GST.",
    simple: "Buying before completion adds GST; buying a finished flat with an OC doesn't." },
  { category: 3, title: "TDS on Property Purchase", level: "PROFESSIONAL", tags: ["Tax"],
    definition: "When the sale consideration for immovable property (other than agricultural land) is ₹50 lakh or more, the buyer must deduct 1% tax at source and deposit it with the government.",
    simple: "On purchases of ₹50 lakh or more, you hold back 1% and pay it to the tax department." },
  { category: 4, title: "Preferential Location Charges", level: "INTERMEDIATE", tags: ["Under Construction"],
    definition: "Additional charges levied for units with desirable attributes such as park-facing views, corner positions or higher floors.",
    simple: "Extra cost for a better view or position in the building." },
  { category: 4, title: "Sanctioned Building Plan", level: "INTERMEDIATE", tags: ["Legal", "Documentation"],
    definition: "The building layout approved by the local development authority. Deviations from it can lead to penalties or denial of an Occupancy Certificate.",
    simple: "The approved blueprint the builder must follow." },
  { category: 4, title: "Possession Date & Grace Period", level: "BEGINNER", status: "DRAFT", tags: ["Under Construction", "RERA"],
    definition: "The handover date committed in the agreement and RERA registration, sometimes followed by a contractual grace period. Delays beyond the committed date can entitle buyers to interest under RERA.",
    simple: "When you'll get your keys — and what happens if it's late." },
  { category: 4, title: "A-Khata and B-Khata", level: "PROFESSIONAL", status: "ARCHIVED", tags: ["Bengaluru", "Legal", "Documentation"],
    definition: "Property account records maintained by Bengaluru's municipal body. A-Khata indicates a property fully compliant with building and tax rules; B-Khata covers properties with deviations or pending approvals.",
    simple: "Bengaluru's record that shows whether a property is fully legal." },
];

// ───────────────────────────────────────────────────────────────────────────────
// Blog content
// ───────────────────────────────────────────────────────────────────────────────

const BLOGS: {
  title: string; author: "admin" | "sme"; status: ContentStatus; deleted?: boolean;
  source?: { name: string; url: string }; intro: string; sections: [string, string][];
}[] = [
  { title: "Carpet Area vs Super Built-up Area: What You Actually Pay For", author: "admin", status: "PUBLISHED",
    intro: "Two flats advertised at the same size can feel very different once you walk in. The reason is usually how the area was measured.",
    sections: [
      ["Carpet area is what you use", "Under RERA, carpet area is the net usable floor area inside your walls. It's the number that tells you how big the home really is."],
      ["Super built-up adds shared spaces", "Super built-up area adds your share of lobbies, lifts, staircases and amenities. The gap between the two is the loading factor."],
      ["Compare price per carpet sq ft", "Divide the total price by carpet area, not super built-up area. It's the fairest way to compare two projects."],
    ] },
  { title: "A First-Time Buyer's Checklist Before Booking an Under-Construction Flat", author: "sme", status: "PUBLISHED",
    intro: "Booking amounts are small compared to the final price, but they lock you in. Run through this list before you sign anything.",
    sections: [
      ["Verify the RERA registration", "Look the project up on your state RERA portal and check the committed completion date and quarterly updates."],
      ["Read the payment plan carefully", "Prefer construction-linked plans and make sure demands are tied to verifiable milestones."],
      ["Check the builder's track record", "Visit at least one completed project and speak to residents about delays and build quality."],
    ] },
  { title: "How to Verify a Project on Your State RERA Portal", author: "sme", status: "PUBLISHED",
    intro: "Every state runs its own RERA website. The details differ, but the checks you need to make are the same.",
    sections: [
      ["Search by registration number", "The number should be printed on all advertisements. Searching by it avoids confusion with similarly named projects."],
      ["Review the uploaded documents", "Approvals, layout plans and the title report are usually attached to the registration."],
      ["Track quarterly progress", "Promoters must update construction progress regularly; gaps in updates are a warning sign."],
    ] },
  { title: "Ready-to-Move vs Under-Construction: The Real Cost Comparison", author: "admin", status: "PUBLISHED",
    source: { name: "Example Housing Market Report", url: "https://www.example.com/housing-market-report-2026" },
    intro: "Under-construction homes are often cheaper on paper. Once you factor in GST, rent and pre-EMI interest, the gap narrows.",
    sections: [
      ["GST changes the maths", "Under-construction property attracts GST, while ready-to-move units with an Occupancy Certificate do not."],
      ["Rent while you wait", "If you're renting during construction, add those payments to the effective cost of the new home."],
      ["Risk has a price too", "Delays are common. A ready home removes that uncertainty, which is worth something."],
    ] },
  { title: "Understanding Stamp Duty and Registration Charges Across States", author: "sme", status: "PUBLISHED",
    intro: "Stamp duty is set by each state, so the same flat can cost noticeably more to register in one city than another.",
    sections: [
      ["Typical ranges", "Most states charge between 4% and 8% stamp duty, plus registration fees of around 1%."],
      ["Concessions for women buyers", "Several states reduce stamp duty when a woman is the sole or joint owner."],
      ["Budget for it upfront", "Banks generally don't finance stamp duty and registration, so keep cash aside for them."],
    ] },
  { title: "Five Red Flags in a Builder-Buyer Agreement", author: "sme", status: "PUBLISHED",
    intro: "Most disputes trace back to a clause the buyer didn't question. Watch for these before you sign.",
    sections: [
      ["One-sided delay clauses", "Compensation for delays should be symmetric with the penalty you'd pay for late instalments."],
      ["Vague area definitions", "The agreement should state carpet area as defined under RERA."],
      ["Unilateral plan changes", "Changes to the sanctioned plan generally need the consent of a majority of allottees."],
    ] },
  { title: "Why Micro-Market Matters More Than City Averages", author: "admin", status: "DRAFT",
    intro: "City-level price trends hide huge differences between neighbourhoods a few kilometres apart.",
    sections: [
      ["Infrastructure drives local demand", "A new metro station or expressway can move prices in one locality while others stay flat."],
      ["Supply pipelines differ", "Localities with heavy upcoming supply tend to see slower appreciation."],
    ] },
  { title: "Festive Season Offers: Are They Worth It?", author: "admin", status: "ARCHIVED",
    intro: "Free modular kitchens and waived parking fees sound attractive. Here's how to tell whether an offer is real value.",
    sections: [
      ["Compare the final price", "Offers often come with a higher base price. Ask for the all-inclusive cost per carpet sq ft."],
      ["Get it in writing", "Any freebie should appear in the allotment letter or agreement, not just the brochure."],
    ] },
  { title: "Home Loan Prepayment: Reduce Tenure or EMI?", author: "sme", status: "PUBLISHED", deleted: true,
    intro: "When you prepay a home loan, banks usually let you choose between a shorter tenure and a lower EMI.",
    sections: [
      ["Reducing tenure saves more interest", "Keeping the EMI the same and cutting tenure usually saves the most interest overall."],
      ["Reducing EMI improves cash flow", "If your budget is tight, a lower EMI gives you breathing room."],
    ] },
];

// ───────────────────────────────────────────────────────────────────────────────
// Consultation content
// ───────────────────────────────────────────────────────────────────────────────

const CONSULTATION_SERVICES = [
  { name: "Property Document Review", price: 1999, duration_days: 7, is_active: true,
    description: "An expert reviews your agreement for sale, allotment letter and title documents and flags risky clauses." },
  { name: "Home Loan Advisory", price: 999, duration_days: 5, is_active: true,
    description: "Compare sanction letters, interest rate structures and prepayment options with a home-finance expert." },
  { name: "Project Due Diligence Report", price: 4999, duration_days: 14, is_active: true,
    description: "A detailed check of a project's approvals, RERA filings, builder track record and on-ground progress." },
  { name: "RERA Complaint Guidance", price: 2499, duration_days: 10, is_active: true,
    description: "Step-by-step guidance on drafting and filing a complaint with your state RERA authority." },
  { name: "Site Visit Planning (Legacy)", price: 499, duration_days: 3, is_active: false,
    description: "Discontinued service kept for historical consultations." },
];

type ScriptLine = { from: "user" | "sme"; text: string; type?: "IMAGE" | "DOCUMENT"; file?: string };

const AGREEMENT_SCRIPT: ScriptLine[] = [
  { from: "user", text: "Hi, I'm planning to buy a 3 BHK in an under-construction project. Could you review the builder-buyer agreement?" },
  { from: "sme", text: "Sure. Please share the draft agreement, the RERA registration number and the payment plan you've been offered." },
  { from: "user", text: "Here's the draft agreement.", type: "DOCUMENT", file: "draft-agreement.pdf" },
  { from: "sme", text: "Thanks. Clause 14 lets the builder move the possession date without compensation — that's worth negotiating. RERA entitles you to interest for delayed possession." },
  { from: "user", text: "Got it. What about the super built-up vs carpet area figures?" },
  { from: "sme", text: "The loading works out to about 32%, which is on the higher side. Make sure the agreement states the carpet area as defined under RERA." },
  { from: "user", text: "Should I choose the construction-linked plan or the down-payment plan?" },
  { from: "sme", text: "Given two delayed projects in the builder's history, a construction-linked plan limits your exposure." },
  { from: "user", text: "This is the site photo from last weekend.", type: "IMAGE", file: "site-photo.jpg" },
  { from: "sme", text: "The structure looks to be around the 9th-floor slab, which matches their last quarterly RERA update." },
  { from: "user", text: "Thank you, this is really helpful." },
  { from: "sme", text: "Happy to help. I'll send a summary of the points to raise with the builder." },
];

const LOAN_SCRIPT: ScriptLine[] = [
  { from: "user", text: "I have sanction letters from two banks — one repo-linked and one fixed for three years. Which is better?" },
  { from: "sme", text: "Please share both letters. I'd like to compare the spread over the repo rate and any reset clauses." },
  { from: "user", text: "Both sanction letters attached.", type: "DOCUMENT", file: "sanction-letters.pdf" },
  { from: "sme", text: "Bank A's spread is lower but it charges a 0.5% processing fee plus GST. Over 20 years the lower spread still works out cheaper." },
  { from: "user", text: "Should I borrow the maximum or put more down?" },
  { from: "sme", text: "For loans above ₹75 lakh the maximum LTV is 75% anyway. A larger down payment also cuts your EMI and total interest." },
  { from: "user", text: "Makes sense. What about prepaying later?" },
  { from: "sme", text: "Floating-rate home loans to individuals can't carry foreclosure or prepayment charges, so part-prepay whenever you get a bonus." },
  { from: "user", text: "Great, thanks!" },
];

const REJECTION_REASONS = [
  "Duplicate of an existing listing.",
  "We could not verify the RERA registration for this project.",
  "Insufficient details — please add the location and pricing.",
  "The uploaded image does not show the project.",
];

// ───────────────────────────────────────────────────────────────────────────────
// Seed steps
// ───────────────────────────────────────────────────────────────────────────────

const ALL_TABLES = [
  "blogs", "builders", "comment_reactions", "comments", "consultation_messages", "consultation_services",
  "consultations", "knowledge_categories", "knowledge_tags", "knowledge_topic_tags", "knowledge_topics",
  "notifications", "project_images", "project_requests", "project_ratings", "projects", "rating_categories",
  "roles", "saved_projects", "user_roles", "users", "pending_registrations", "project_stats", "project_view_events",
];

async function resetDatabase() {
  const list = ALL_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

type SeedUser = { id: string; name: string; email: string; created_at: Date; kind: "admin" | "sme" | "user"; active: boolean };

async function seedUsers() {
  const passwordHash = await bcrypt.hash(CONFIG.password, CONFIG.bcryptRounds);
  const roleIds = { admin: uuid(), sme: uuid(), user: uuid() };
  await prisma.roles.createMany({
    data: (Object.keys(roleIds) as (keyof typeof roleIds)[]).map((k) => ({
      id: roleIds[k], name: CONFIG.roles[k], created_at: daysAgo(400),
    })),
  });

  const users: SeedUser[] = [];
  const rows: Prisma.usersCreateManyInput[] = [];
  const roleRows: Prisma.user_rolesCreateManyInput[] = [];

  const add = (kind: SeedUser["kind"], email: string, name: string, createdDaysAgo: number,
    extra: Partial<Prisma.usersCreateManyInput> = {}) => {
    const id = uuid();
    const created_at = daysAgo(createdDaysAgo);
    const status = extra.status ?? "ACTIVE";
    const active = status === "ACTIVE" && !extra.deleted_at;
    users.push({ id, name, email, created_at, kind, active });
    rows.push({
      id, email, name, password_hash: passwordHash,
      phone: `+91 ${pick(["9", "8", "7"])}${faker.string.numeric(9)}`,
      profile_image_url: chance(0.6) ? `https://i.pravatar.cc/300?u=${id}` : null,
      is_verified: true, status, created_at, updated_at: after(created_at, 0, 30 * DAY),
      ...extra,
    });
    roleRows.push({ user_id: id, role_id: roleIds.user, created_at });
    if (kind !== "user") roleRows.push({ user_id: id, role_id: roleIds[kind], created_at });
  };

  add("admin", `admin@${CONFIG.emailDomain}`, "Dev Admin", 365);
  for (let i = 1; i <= CONFIG.counts.smes; i++) {
    add("sme", `sme${i}@${CONFIG.emailDomain}`, faker.person.fullName(), int(200, 330));
  }
  for (let i = 1; i <= CONFIG.counts.users; i++) {
    const extra: Partial<Prisma.usersCreateManyInput> = { is_verified: i === 1 || chance(0.85) };
    const fromEnd = CONFIG.counts.users - i;
    if (CONFIG.counts.users >= 5) {
      if (fromEnd === 0) extra.status = "SUSPENDED";
      if (fromEnd === 1) extra.status = "DEACTIVATED";
      if (fromEnd === 2) Object.assign(extra, { status: "DEACTIVATED", deleted_at: daysAgo(int(1, 20)) });
    }
    add("user", `user${i}@${CONFIG.emailDomain}`, faker.person.fullName(), i === 1 ? 150 : float(1, 180), extra);
  }

  await prisma.users.createMany({ data: rows });
  await prisma.user_roles.createMany({ data: roleRows });

  return {
    all: users,
    admin: users[0],
    smes: users.filter((u) => u.kind === "sme"),
    regular: users.filter((u) => u.kind === "user"),
    activeRegular: users.filter((u) => u.kind === "user" && u.active),
  };
}

async function seedPendingRegistrations() {
  const otpHash = await bcrypt.hash("123456", 8);
  const pw = await bcrypt.hash(CONFIG.password, CONFIG.bcryptRounds);
  const rows: Prisma.pending_registrationsCreateManyInput[] = [
    { email: `pending1@${CONFIG.emailDomain}`, name: faker.person.fullName(), expires_at: addMs(NOW, 10 * MINUTE), attempts: 0 },
    { email: `pending2@${CONFIG.emailDomain}`, name: faker.person.fullName(), expires_at: addMs(NOW, -2 * HOUR), attempts: 1 },
    { email: `pending3@${CONFIG.emailDomain}`, name: faker.person.fullName(), expires_at: addMs(NOW, 5 * MINUTE), attempts: 5 },
  ].map((r) => {
    const created_at = addMs(r.expires_at as Date, -15 * MINUTE);
    return { ...r, id: uuid(), password_hash: pw, otp_hash: otpHash, created_at, updated_at: created_at };
  });
  await prisma.pending_registrations.createMany({ data: rows });
}

type SeedBuilder = { id: string; name: string; quality: number };

async function seedBuilders(): Promise<SeedBuilder[]> {
  const builders: SeedBuilder[] = [];
  const rows: Prisma.buildersCreateManyInput[] = BUILDERS.map((name) => {
    const id = uuid();
    const slug = slugify(name);
    const created_at = daysAgo(int(300, 400));
    builders.push({ id, name, quality: float(2.8, 4.6) });
    return {
      id, name, slug,
      description: `${name} is a ${pick(["family-run", "listed", "privately held", "fast-growing"])} developer founded in ${int(1985, 2015)}, with ${int(4, 40)} delivered projects across ${pick(["North", "West", "South", "East"])} India.`,
      logo_url: `https://placehold.co/256x256/png?text=${encodeURIComponent(name.split(" ").map((w) => w[0]).join("").slice(0, 3))}`,
      website_url: `https://${slug}.example.com`,
      created_at, updated_at: after(created_at, 0, 60 * DAY),
    };
  });
  // A soft-deleted builder with no projects, to exercise `deleted_at` filters.
  const created_at = daysAgo(390);
  rows.push({
    id: uuid(), name: "Defunct Developers (deleted)", slug: "defunct-developers",
    description: "Soft-deleted builder kept for testing.", created_at, updated_at: daysAgo(30), deleted_at: daysAgo(30),
  });
  await prisma.builders.createMany({ data: rows });
  return builders;
}

type SeedProject = {
  id: string; name: string; slug: string; builder: SeedBuilder; city: (typeof CITIES)[number]; locality: string;
  type: ProjectType; status: ProjectStatus; minPrice: number | null; maxPrice: number | null;
  lat: number; lng: number; created_at: Date; deleted: boolean;
  weight: number; trend: Trend; quality: number;
};

async function seedProjects(builders: SeedBuilder[]): Promise<SeedProject[]> {
  const usedNames = new Set<string>();
  const projects: SeedProject[] = [];
  const rows: Prisma.projectsCreateManyInput[] = [];
  const imageRows: Prisma.project_imagesCreateManyInput[] = [];
  const pickType = () => faker.helpers.weightedArrayElement(PROJECT_TYPES.map((t) => ({ weight: t.weight, value: t })));
  const pickStatus = () => faker.helpers.weightedArrayElement(PROJECT_STATUSES);

  for (let i = 0; i < CONFIG.counts.projects; i++) {
    const type = pickType();
    const city = pick(CITIES);
    const locality = pick(city.localities);
    const builder = pick(builders);
    let name = "";
    for (let tries = 0; !name || usedNames.has(name); tries++) {
      name = `${pick(NAME_PREFIXES)} ${pick(type.suffixes)}${tries > 10 ? ` Phase ${tries - 9}` : ""}`;
    }
    usedNames.add(name);

    const status = pickStatus();
    const hasPrice = status !== "UNKNOWN" || chance(0.5);
    const base = float(type.price[0], type.price[1]) * city.mult;
    const minPrice = hasPrice ? roundTo(base, 100_000) : null;
    const maxPrice = minPrice !== null ? roundTo(minPrice * float(1.2, 2.5), 100_000) : null;
    const lat = city.lat + float(-0.12, 0.12);
    const lng = city.lng + float(-0.12, 0.12);
    const created_at = daysAgo(float(1, 365));
    const deleted = CONFIG.counts.projects >= 10 && i >= CONFIG.counts.projects - 2;
    const id = uuid();
    const slug = slugify(name);

    projects.push({
      id, name, slug, builder, city, locality, type: type.value, status, minPrice, maxPrice, lat, lng,
      created_at, deleted,
      weight: Math.pow(faker.number.float(), 3) * 10 + 0.3,
      trend: faker.helpers.weightedArrayElement([
        { weight: 2, value: "hot" as const }, { weight: 6, value: "steady" as const }, { weight: 2, value: "cooling" as const },
      ]),
      quality: clamp((builder.quality + float(2.6, 4.8)) / 2, 1.5, 4.9),
    });

    const configs = type.value === "APARTMENT" ? ` Configurations include ${pick(["1, 2 & 3 BHK", "2 & 3 BHK", "3 & 4 BHK", "2, 3 & 4 BHK"])} homes.` : "";
    rows.push({
      id, builder_id: builder.id, name, slug,
      description: `${name} by ${builder.name} is a ${type.label} project in ${locality}, ${city.city}.${configs} Highlights include ${faker.helpers.arrayElements(AMENITIES, int(3, 5)).join(", ")}.`,
      project_type: type.value, status,
      location: `${locality}, ${city.city}, ${city.state}`,
      locality, city: city.city, state: city.state, country: "India",
      latitude: lat.toFixed(7), longitude: lng.toFixed(7),
      min_price: minPrice !== null ? money(minPrice) : null,
      max_price: maxPrice !== null ? money(maxPrice) : null,
      currency: "INR",
      created_at, updated_at: after(created_at, 0, 30 * DAY),
      deleted_at: deleted ? daysAgo(int(1, 10)) : null,
    });

    const imageCount = int(3, 6);
    for (let k = 0; k < imageCount; k++) {
      imageRows.push({
        id: uuid(), project_id: id,
        image_url: `https://picsum.photos/seed/${slug}-${k}/1200/800`,
        cloudinary_public_id: `seed/projects/${slug}/${k}`,
        display_order: k, created_at,
      });
    }
  }

  await prisma.projects.createMany({ data: rows });
  await prisma.project_images.createMany({ data: imageRows });
  return projects;
}

async function seedRatingCategories() {
  const ids = new Map<string, string>();
  await prisma.rating_categories.createMany({
    data: RATING_CATEGORIES.map((c, i) => {
      const id = uuid();
      ids.set(c.code, id);
      return { id, code: c.code, name: c.name, description: c.description, display_order: i + 1, is_active: true, created_at: daysAgo(400) };
    }),
  });
  return ids;
}

type Activity = {
  saves: Prisma.saved_projectsCreateManyInput[];
  ratings: Prisma.project_ratingsCreateManyInput[];
  comments: (Prisma.commentsCreateManyInput & { created_at: Date })[];
  reactions: Prisma.comment_reactionsCreateManyInput[];
  views: (Prisma.project_view_eventsCreateManyInput & { viewed_at: Date })[];
};

async function seedProjectActivity(
  projects: SeedProject[], users: Awaited<ReturnType<typeof seedUsers>>, ratingCategoryIds: Map<string, string>,
): Promise<Activity> {
  const live = projects.filter((p) => !p.deleted);
  const byWeight = weightedPicker(live, (p) => p.weight);
  const active = users.activeRegular;
  const act: Activity = { saves: [], ratings: [], comments: [], reactions: [], views: [] };
  const demo = users.regular[0]; // user1 always gets some activity so you can log in and see it

  // Saved projects
  for (const u of active) {
    for (const p of pickDistinct(byWeight, int(u === demo ? 4 : 0, 10))) {
      act.saves.push({ user_id: u.id, project_id: p.id, created_at: activityDate(p.trend, 90, maxDate(p.created_at, u.created_at)) });
    }
  }

  // Ratings — every rater scores all (or most) categories for a project
  const categoryIds = [...ratingCategoryIds.values()];
  for (const u of active) {
    for (const p of pickDistinct(byWeight, int(u === demo ? 3 : 0, 6))) {
      const created_at = activityDate(p.trend, 120, maxDate(p.created_at, u.created_at));
      const updated_at = chance(0.2) ? after(created_at, HOUR, 20 * DAY) : created_at;
      const cats = chance(0.85) ? categoryIds : faker.helpers.arrayElements(categoryIds, int(2, 4));
      for (const catId of cats) {
        const score = clamp(roundTo(p.quality + float(-1.2, 1.2), 0.5), 1, 5);
        act.ratings.push({ id: uuid(), project_id: p.id, user_id: u.id, rating_category_id: catId, score: score.toFixed(1), created_at, updated_at });
      }
    }
  }

  // Comments, replies and nested replies
  const commenters = [...active];
  const maxWeight = Math.max(...live.map((p) => p.weight));
  for (const p of live) {
    const topLevel = int(0, 2) + Math.round((p.weight / maxWeight) * 6);
    for (let t = 0; t < topLevel; t++) {
      const author = pick(commenters);
      const created_at = activityDate(p.trend, 120, maxDate(p.created_at, author.created_at));
      const top = { id: uuid(), project_id: p.id, user_id: author.id, parent_comment_id: null, content: pick(TOP_COMMENTS), created_at,
        updated_at: created_at, deleted_at: chance(0.04) ? after(created_at, HOUR, 10 * DAY) : null };
      act.comments.push(top);

      const replyCount = chance(0.6) ? int(1, 3) : 0;
      for (let r = 0; r < replyCount; r++) {
        const isSme = chance(0.12);
        const rAuthor = isSme ? pick(users.smes) : pick(commenters.filter((c) => c.id !== author.id));
        const rCreated = after(created_at, 10 * MINUTE, 5 * DAY);
        const reply = { id: uuid(), project_id: p.id, user_id: rAuthor.id, parent_comment_id: top.id,
          content: isSme ? pick(SME_REPLIES) : pick(REPLIES), created_at: rCreated, updated_at: rCreated, deleted_at: null };
        act.comments.push(reply);
        if (chance(0.25)) {
          const nCreated = after(rCreated, 10 * MINUTE, 3 * DAY);
          act.comments.push({ id: uuid(), project_id: p.id, user_id: author.id, parent_comment_id: reply.id,
            content: pick(REPLIES), created_at: nCreated, updated_at: nCreated, deleted_at: null });
        }
      }
    }
  }

  // Reactions (one per user per comment, never on your own comment)
  for (const c of act.comments) {
    if (c.deleted_at) continue;
    const reactors = faker.helpers.arrayElements(active.filter((u) => u.id !== c.user_id), int(0, 6));
    for (const u of reactors) {
      act.reactions.push({ id: uuid(), comment_id: c.id!, user_id: u.id, reaction_type: chance(0.8) ? "LIKE" : "DISLIKE",
        created_at: after(c.created_at, MINUTE, 7 * DAY) });
    }
  }

  // View events — a pool of anonymous visitors, ~30% of whom are logged-in users
  const allLoggable = [...active, ...users.smes];
  const visitors = Array.from({ length: CONFIG.counts.visitors }, () => ({
    id: uuid(), userId: chance(0.3) ? pick(allLoggable).id : null,
  }));
  for (let i = 0; i < CONFIG.counts.viewEvents; i++) {
    const p = byWeight();
    const v = pick(visitors);
    act.views.push({ id: uuid(), project_id: p.id, user_id: v.userId, visitor_id: v.id, viewed_at: activityDate(p.trend, 60, p.created_at) });
  }
  // A handful of views on soft-deleted projects (from before they were removed)
  for (const p of projects.filter((x) => x.deleted)) {
    for (let i = 0; i < 5; i++) {
      act.views.push({ id: uuid(), project_id: p.id, user_id: null, visitor_id: pick(visitors).id, viewed_at: between(maxDate(p.created_at, daysAgo(60)), daysAgo(10)) });
    }
  }

  await inBatches(act.saves, (data) => prisma.saved_projects.createMany({ data }));
  await inBatches(act.ratings, (data) => prisma.project_ratings.createMany({ data }));
  await inBatches(act.comments, (data) => prisma.comments.createMany({ data }));
  await inBatches(act.reactions, (data) => prisma.comment_reactions.createMany({ data }));
  await inBatches(act.views, (data) => prisma.project_view_events.createMany({ data }));
  return act;
}

/**
 * Computes project_stats from the seeded activity. The formula is a reasonable
 * stand-in; if your app has its own stats job, run it after seeding so the
 * numbers match production logic exactly.
 */
async function seedProjectStats(projects: SeedProject[], act: Activity) {
  const d30 = daysAgo(30);
  const d7 = daysAgo(7);
  const d14 = daysAgo(14);
  type Agg = { views30: number; visitors30: Set<string>; saves30: number; comments30: number; raters30: Set<string>;
    e7: number; ePrev7: number };
  const agg = new Map<string, Agg>();
  const get = (id: string) => {
    let a = agg.get(id);
    if (!a) agg.set(id, (a = { views30: 0, visitors30: new Set(), saves30: 0, comments30: 0, raters30: new Set(), e7: 0, ePrev7: 0 }));
    return a;
  };
  const W = { view: 1, save: 5, comment: 4, rating: 3 };
  const engage = (a: Agg, at: Date, w: number) => {
    if (at >= d7) a.e7 += w;
    else if (at >= d14) a.ePrev7 += w;
  };

  for (const v of act.views) {
    const a = get(v.project_id);
    if (v.viewed_at >= d30) { a.views30++; a.visitors30.add(v.visitor_id); }
    engage(a, v.viewed_at, W.view);
  }
  for (const s of act.saves) {
    const at = s.created_at as Date;
    const a = get(s.project_id);
    if (at >= d30) a.saves30++;
    engage(a, at, W.save);
  }
  for (const c of act.comments) {
    if (c.deleted_at) continue;
    const a = get(c.project_id);
    if (c.created_at >= d30) a.comments30++;
    engage(a, c.created_at, W.comment);
  }
  const ratingSubmissions = new Map<string, Date>(); // project|user → submission time
  for (const r of act.ratings) ratingSubmissions.set(`${r.project_id}|${r.user_id}`, r.created_at as Date);
  for (const [key, at] of ratingSubmissions) {
    const [projectId, userId] = key.split("|");
    const a = get(projectId);
    if (at >= d30) a.raters30.add(userId);
    engage(a, at, W.rating);
  }

  const live = projects.filter((p) => !p.deleted);
  const metrics = live.map((p) => {
    const a = get(p.id);
    return { p, a, views: a.views30, uv: a.visitors30.size, saves: a.saves30, comments: a.comments30, ratings: a.raters30.size };
  });
  const maxOf = (f: (m: (typeof metrics)[number]) => number) => Math.max(1, ...metrics.map(f));
  const max = {
    views: maxOf((m) => m.views), uv: maxOf((m) => m.uv), saves: maxOf((m) => m.saves),
    comments: maxOf((m) => m.comments), ratings: maxOf((m) => m.ratings), e7: maxOf((m) => m.a.e7),
  };
  const score = (v: number, m: number) => clamp((100 * Math.log1p(v)) / Math.log1p(m), 0, 100);

  const rows: Prisma.project_statsCreateManyInput[] = metrics.map(({ p, a, views, uv, saves, comments, ratings }) => {
    const s = {
      views: score(views, max.views), uv: score(uv, max.uv), saves: score(saves, max.saves),
      comments: score(comments, max.comments), ratings: score(ratings, max.ratings), recent: score(a.e7, max.e7),
    };
    const popularity = 0.25 * s.views + 0.15 * s.uv + 0.25 * s.saves + 0.15 * s.comments + 0.1 * s.ratings + 0.1 * s.recent;
    const growth = (a.e7 - a.ePrev7) / (a.ePrev7 + 10);
    const trending = 0.6 * s.recent + 0.4 * (50 + 50 * Math.tanh(growth));
    return {
      project_id: p.id,
      views_30d: BigInt(views), unique_visitors_30d: BigInt(uv), saves_30d: BigInt(saves),
      comments_30d: BigInt(comments), rating_activity_30d: BigInt(ratings),
      engagement_7d: money(a.e7), engagement_previous_7d: money(a.ePrev7),
      views_score: money(s.views), unique_visitors_score: money(s.uv), saves_score: money(s.saves),
      comments_score: money(s.comments), rating_activity_score: money(s.ratings), recent_engagement_score: money(s.recent),
      popularity_score: money(clamp(popularity, 0, 100)), trending_score: money(clamp(trending, 0, 100)),
      calculated_at: NOW,
    };
  });
  await prisma.project_stats.createMany({ data: rows });
}

async function seedKnowledgeBase() {
  const categoryIds = KNOWLEDGE_CATEGORIES.map(() => uuid());
  await prisma.knowledge_categories.createMany({
    data: KNOWLEDGE_CATEGORIES.map((c, i) => ({
      id: categoryIds[i], name: c.name, slug: slugify(c.name), description: c.description,
      display_order: i + 1, created_at: daysAgo(300), updated_at: daysAgo(int(1, 100)),
    })),
  });

  const tagIds = new Map(KNOWLEDGE_TAGS.map((t) => [t, uuid()]));
  await prisma.knowledge_tags.createMany({
    data: KNOWLEDGE_TAGS.map((t) => ({ id: tagIds.get(t)!, name: t, slug: slugify(t), created_at: daysAgo(300) })),
  });

  const topicTagRows: Prisma.knowledge_topic_tagsCreateManyInput[] = [];
  await prisma.knowledge_topics.createMany({
    data: KNOWLEDGE_TOPICS.map((t) => {
      const id = uuid();
      for (const tag of t.tags) topicTagRows.push({ topic_id: id, tag_id: tagIds.get(tag)! });
      const created_at = daysAgo(int(30, 280));
      return {
        id, category_id: categoryIds[t.category], title: t.title, slug: slugify(t.title), level: t.level,
        definition: t.definition, simple_explanation: t.simple, status: t.status ?? "PUBLISHED",
        created_at, updated_at: after(created_at, 0, 20 * DAY),
      };
    }),
  });
  await prisma.knowledge_topic_tags.createMany({ data: topicTagRows });
}

async function seedBlogs(users: Awaited<ReturnType<typeof seedUsers>>) {
  await prisma.blogs.createMany({
    data: BLOGS.map((b, i) => {
      const slug = slugify(b.title);
      const author = b.author === "admin" ? users.admin : users.smes[i % users.smes.length];
      const created_at = daysAgo(int(20, 200));
      const published_at = b.status === "DRAFT" ? null : after(created_at, HOUR, 5 * DAY);
      const body = [b.intro, ...b.sections.map(([h, t]) => `## ${h}\n\n${t}`)].join("\n\n");
      const hasCover = b.status !== "DRAFT";
      return {
        id: uuid(), author_id: author.id, title: b.title, slug, excerpt: b.intro, body,
        cover_image_url: hasCover ? `https://picsum.photos/seed/blog-${slug}/1600/900` : null,
        cover_image_public_id: hasCover ? `seed/blogs/${slug}` : null,
        source_name: b.source?.name ?? null, source_url: b.source?.url ?? null,
        status: b.status, published_at, created_at,
        updated_at: after(published_at ?? created_at, 0, 10 * DAY),
        deleted_at: b.deleted ? daysAgo(int(1, 10)) : null,
      };
    }),
  });
}

type ConsultationStatus = Prisma.consultationsCreateManyInput["status"] & string;
type SeedConsultation = { id: string; userId: string; smeId: string | null; status: ConsultationStatus; serviceName: string;
  assignedAt: Date | null; completedAt: Date | null; lastMessage: { at: Date; to: string } | null; updatedAt: Date };

async function seedConsultations(users: Awaited<ReturnType<typeof seedUsers>>) {
  const services = CONSULTATION_SERVICES.map((s) => ({ ...s, id: uuid(), slug: slugify(s.name) }));
  await prisma.consultation_services.createMany({
    data: services.map((s) => ({
      id: s.id, name: s.name, slug: s.slug, description: s.description, price: money(s.price), currency: "INR",
      duration_days: s.duration_days, is_active: s.is_active, created_at: daysAgo(300), updated_at: daysAgo(int(1, 60)),
    })),
  });
  const activeServices = services.filter((s) => s.is_active);
  const legacyService = services.find((s) => !s.is_active)!;

  // Cycle through every status so each one is represented; the demo user gets the first few.
  const plan: ConsultationStatus[] = [
    "ONGOING", "COMPLETED", "PENDING_PAYMENT", "PAID", "ASSIGNED", "ONGOING", "COMPLETED", "COMPLETED",
    "CANCELLED", "EXPIRED", "REFUNDED", "ONGOING",
  ];
  const consultations: SeedConsultation[] = [];
  const rows: Prisma.consultationsCreateManyInput[] = [];
  const msgRows: Prisma.consultation_messagesCreateManyInput[] = [];
  const demoUser = users.regular[0];

  for (let i = 0; i < CONFIG.counts.consultations; i++) {
    const status = plan[i % plan.length];
    const user = i < 4 ? demoUser : pick(users.activeRegular);
    const service = status === "COMPLETED" && i === 7 ? legacyService : pick(activeServices);
    const dur = service.duration_days;
    const id = uuid();

    // Timeline (booked → paid → assigned → started → completed/expired), consistent with status.
    let agoDays: number;
    switch (status) {
      case "PENDING_PAYMENT": agoDays = float(0.01, 2); break;
      case "PAID": case "ASSIGNED": case "ONGOING": agoDays = float(0.2, Math.min(dur - 0.5, 4)); break;
      case "EXPIRED": agoDays = float(dur + 1, dur + 60); break;
      default: agoDays = float(Math.max(dur, 10), 90);
    }
    const booked = daysAgo(agoDays);
    const isPaid = !["PENDING_PAYMENT", "CANCELLED"].includes(status);
    const paidAt = isPaid ? after(booked, 2 * MINUTE, 20 * MINUTE) : null;
    const hasSme = ["ASSIGNED", "ONGOING", "COMPLETED", "EXPIRED"].includes(status);
    const assignedAt = hasSme && paidAt ? after(paidAt, 30 * MINUTE, 6 * HOUR) : null;
    const startedAt = ["ONGOING", "COMPLETED", "EXPIRED"].includes(status) && assignedAt ? after(assignedAt, 10 * MINUTE, 4 * HOUR) : null;
    const expiresAt = paidAt ? addMs(paidAt, dur * DAY) : null;
    const completedAt = status === "COMPLETED" && startedAt && expiresAt ? between(addMs(startedAt, DAY), addMs(expiresAt, -HOUR)) : null;
    const sme = hasSme ? users.smes[i % users.smes.length] : null;
    const cancelledOrRefundedAt = status === "CANCELLED" ? after(booked, HOUR, 2 * DAY) : status === "REFUNDED" ? after(paidAt!, DAY, 3 * DAY) : null;

    rows.push({
      id, user_id: user.id, service_id: service.id, sme_id: sme?.id ?? null, status,
      amount: money(service.price), currency: "INR", booked_at: booked,
      started_at: startedAt, expires_at: expiresAt, completed_at: completedAt,
      cashfree_order_id: `order_seed_${String(i + 1).padStart(5, "0")}`,
      cashfree_payment_session_id: `session_${faker.string.alphanumeric(40)}`,
      cashfree_payment_id: paidAt ? `${faker.string.numeric(10)}` : null,
      payment_verified_at: paidAt,
      created_at: booked,
      updated_at: maxDate(booked, paidAt ?? booked, assignedAt ?? booked, startedAt ?? booked, completedAt ?? booked,
        cancelledOrRefundedAt ?? booked, status === "EXPIRED" && expiresAt ? expiresAt : booked),
    });

    // Messages
    let lastMessage: SeedConsultation["lastMessage"] = null;
    const sys = (content: string, at: Date) =>
      msgRows.push({ id: uuid(), consultation_id: id, sender_id: users.admin.id, message_type: "SYSTEM", content, created_at: at, read_at: after(at, MINUTE, HOUR) });
    if (assignedAt && sme) sys(`${sme.name} has been assigned as your expert.`, assignedAt);
    if (startedAt && sme) {
      const script = service.name === "Home Loan Advisory" ? LOAN_SCRIPT : AGREEMENT_SCRIPT;
      const lines = status === "COMPLETED" ? script : script.slice(0, int(3, script.length - 2));
      const end = completedAt ?? (status === "EXPIRED" ? expiresAt! : NOW);
      let t = startedAt;
      const gap = (end.getTime() - startedAt.getTime()) / (lines.length + 1);
      lines.forEach((line, idx) => {
        t = clampToNow(addMs(t, faker.number.int({ min: Math.floor(gap * 0.5), max: Math.max(Math.floor(gap * 0.5) + 1, Math.floor(gap)) })));
        const sender = line.from === "user" ? user.id : sme.id;
        const isLast = idx === lines.length - 1;
        const unread = status === "ONGOING" && isLast;
        msgRows.push({
          id: uuid(), consultation_id: id, sender_id: sender, message_type: line.type ?? "TEXT", content: line.text,
          attachment_url: line.file ? `https://files.example.com/seed/consultations/${id}/${line.file}` : null,
          created_at: t, read_at: unread ? null : after(t, MINUTE, 3 * HOUR),
        });
        lastMessage = { at: t, to: line.from === "user" ? sme.id : user.id };
      });
      if (status === "ONGOING" && i === 0) {
        // One message the user deleted, to exercise deleted_at handling.
        const at = after(t, MINUTE, HOUR);
        msgRows.push({ id: uuid(), consultation_id: id, sender_id: user.id, message_type: "TEXT", content: "Sorry, wrong file.",
          created_at: at, deleted_at: after(at, MINUTE, 5 * MINUTE) });
      }
    }
    if (completedAt) sys("This consultation has been marked as completed.", completedAt);
    if (status === "EXPIRED" && expiresAt) sys("This consultation has expired.", expiresAt);
    if (status === "REFUNDED" && cancelledOrRefundedAt) sys("Your payment has been refunded.", cancelledOrRefundedAt);

    consultations.push({ id, userId: user.id, smeId: sme?.id ?? null, status, serviceName: service.name,
      assignedAt, completedAt, lastMessage, updatedAt: rows[rows.length - 1].updated_at as Date });
  }

  await prisma.consultations.createMany({ data: rows });
  await inBatches(msgRows, (data) => prisma.consultation_messages.createMany({ data }));
  return consultations;
}

async function seedProjectRequests(users: Awaited<ReturnType<typeof seedUsers>>, projects: SeedProject[]) {
  const live = projects.filter((p) => !p.deleted);
  const rows: Prisma.project_requestsCreateManyInput[] = [];
  const count = CONFIG.counts.projectRequests;
  for (let i = 0; i < count; i++) {
    const kind = i % 3 === 0 ? "APPROVED" : i % 3 === 1 ? "PENDING" : "REJECTED";
    const requester = pick(users.activeRegular);
    const id = uuid();
    const created_at = daysAgo(float(0.5, 60));
    const reviewed_at = kind === "PENDING" ? null : after(created_at, HOUR, 5 * DAY);
    const base = {
      id, requester_id: requester.id, request_status: kind, created_at, reviewed_at,
      reviewer_id: kind === "PENDING" ? null : users.admin.id,
      image_url: `https://picsum.photos/seed/request-${id.slice(0, 8)}/1200/800`,
      image_public_id: `seed/project-requests/${id}`,
      currency: "INR",
    } as const;

    if (kind === "APPROVED") {
      const p = pick(live);
      rows.push({
        ...base, project_id: p.id, builder_name: p.builder.name, name: p.name, project_type: p.type, status: p.status,
        description: `Submitted by a resident of ${p.locality}.`, location: `${p.locality}, ${p.city.city}, ${p.city.state}`,
        locality: p.locality, city: p.city.city, state: p.city.state, country: "India",
        latitude: p.lat.toFixed(7), longitude: p.lng.toFixed(7),
        min_price: p.minPrice !== null ? money(p.minPrice) : null, max_price: p.maxPrice !== null ? money(p.maxPrice) : null,
      });
    } else {
      const city = pick(CITIES);
      const locality = pick(city.localities);
      const type = pick(PROJECT_TYPES);
      const min = roundTo(float(type.price[0], type.price[1]) * city.mult, 100_000);
      const withDetails = !(kind === "REJECTED" && chance(0.5));
      rows.push({
        ...base, project_id: null,
        builder_name: chance(0.5) ? pick(BUILDERS) : `${faker.person.lastName()} ${pick(["Constructions", "Developers", "Infra"])}`,
        name: `${pick(NAME_PREFIXES)} ${pick(type.suffixes)} ${pick(["II", "Phase 2", "Annexe", "Prime"])}`,
        project_type: type.value, status: pick(["UPCOMING", "ONGOING", "UNKNOWN"] as const),
        description: withDetails ? `New ${type.label} project spotted in ${locality}.` : null,
        location: withDetails ? `${locality}, ${city.city}, ${city.state}` : null,
        locality: withDetails ? locality : null, city: city.city, state: city.state, country: "India",
        latitude: withDetails ? (city.lat + float(-0.1, 0.1)).toFixed(7) : null,
        longitude: withDetails ? (city.lng + float(-0.1, 0.1)).toFixed(7) : null,
        min_price: withDetails ? money(min) : null, max_price: withDetails ? money(roundTo(min * float(1.2, 2), 100_000)) : null,
        rejection_reason: kind === "REJECTED" ? pick(REJECTION_REASONS) : null,
      });
    }
  }
  await prisma.project_requests.createMany({ data: rows });
}

async function seedNotifications(
  users: Awaited<ReturnType<typeof seedUsers>>, act: Activity, consultations: SeedConsultation[],
) {
  const names = new Map(users.all.map((u) => [u.id, u.name]));
  const rows: Prisma.notificationsCreateManyInput[] = [];
  const push = (userId: string, type: Prisma.notificationsCreateManyInput["type"], title: string, body: string | null,
    entityType: string | null, entityId: string | null, at: Date) => {
    const read = at < daysAgo(3) ? chance(0.75) : chance(0.2);
    rows.push({ id: uuid(), user_id: userId, type, title: title.slice(0, 250), body, entity_type: entityType, entity_id: entityId,
      is_read: read, created_at: at, read_at: read ? after(at, MINUTE, 2 * DAY) : null });
  };

  for (const u of users.all) {
    push(u.id, "SYSTEM", "Welcome aboard!", "Explore projects, save your favourites and rate the ones you know.", null, null, after(u.created_at, 0, MINUTE));
  }

  const commentById = new Map(act.comments.map((c) => [c.id!, c]));
  for (const c of act.comments) {
    if (!c.parent_comment_id || c.deleted_at) continue;
    const parent = commentById.get(c.parent_comment_id)!;
    if (parent.user_id === c.user_id) continue;
    push(parent.user_id, "COMMENT_REPLY", `${names.get(c.user_id)} replied to your comment`, c.content.slice(0, 140), "comment", c.id!, c.created_at);
  }
  for (const r of act.reactions) {
    if (r.reaction_type !== "LIKE" || !chance(0.3)) continue;
    const c = commentById.get(r.comment_id)!;
    push(c.user_id, "COMMENT_REACTION", `${names.get(r.user_id)} liked your comment`, null, "comment", c.id!, r.created_at as Date);
  }

  for (const c of consultations) {
    if (c.assignedAt && c.smeId) {
      push(c.userId, "CONSULTATION_ASSIGNED", "An expert has been assigned", `${names.get(c.smeId)} will help you with ${c.serviceName}.`, "consultation", c.id, c.assignedAt);
      push(c.smeId, "CONSULTATION_ASSIGNED", "New consultation assigned to you", `${c.serviceName} for ${names.get(c.userId)}.`, "consultation", c.id, c.assignedAt);
    }
    if (c.lastMessage) {
      push(c.lastMessage.to, "CONSULTATION_MESSAGE", "New message in your consultation", null, "consultation", c.id, c.lastMessage.at);
    }
    if (["COMPLETED", "EXPIRED", "REFUNDED", "CANCELLED"].includes(c.status)) {
      push(c.userId, "CONSULTATION_STATUS", `Your consultation is now ${c.status.toLowerCase()}`, c.serviceName, "consultation", c.id, c.completedAt ?? c.updatedAt);
    }
  }

  await inBatches(rows, (data) => prisma.notifications.createMany({ data }));
}

// ───────────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌱 Seeding ${target} (scale ×${SCALE}, random seed ${CONFIG.randomSeed})\n`);
  const started = Date.now();

  await step("Truncate all tables", resetDatabase);
  const users = await step("Roles, users, user_roles", seedUsers);
  await step("Pending registrations", seedPendingRegistrations);
  const builders = await step("Builders", seedBuilders);
  const projects = await step("Projects + images", () => seedProjects(builders));
  const ratingCategoryIds = await step("Rating categories", seedRatingCategories);
  const act = await step("Saves, ratings, comments, views", () => seedProjectActivity(projects, users, ratingCategoryIds));
  await step("Project stats", () => seedProjectStats(projects, act));
  await step("Knowledge base", seedKnowledgeBase);
  await step("Blogs", () => seedBlogs(users));
  const consultations = await step("Consultations + messages", () => seedConsultations(users));
  await step("Project requests", () => seedProjectRequests(users, projects));
  await step("Notifications", () => seedNotifications(users, act, consultations));

  const counts = await Promise.all(
    ([
      "users", "roles", "user_roles", "pending_registrations", "builders", "projects", "project_images",
      "rating_categories", "project_ratings", "saved_projects", "comments", "comment_reactions", "project_view_events",
      "project_stats", "knowledge_categories", "knowledge_tags", "knowledge_topics", "knowledge_topic_tags", "blogs",
      "consultation_services", "consultations", "consultation_messages", "project_requests", "notifications",
    ] as const).map(async (t) => [t, await (prisma[t] as unknown as { count: () => Promise<number> }).count()] as const),
  );
  console.log("\n  Rows per table");
  for (const [t, c] of counts) console.log(`    ${t.padEnd(24)} ${String(c).padStart(6)}`);

  console.log(`\n✅ Done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  console.log("  Logins (password for all: " + CONFIG.password + ")");
  console.log(`    admin       admin@${CONFIG.emailDomain}`);
  console.log(`    experts     sme1@${CONFIG.emailDomain} … sme${CONFIG.counts.smes}@${CONFIG.emailDomain}`);
  console.log(`    demo user   user1@${CONFIG.emailDomain}  (has consultations, saves and ratings)`);
  console.log(`    users       user2@${CONFIG.emailDomain} … user${CONFIG.counts.users}@${CONFIG.emailDomain}`);
  console.log(`    pending     pending1@${CONFIG.emailDomain} (OTP 123456, valid ~10 min after seeding)\n`);
}

main()
  .catch((err) => {
    console.error("\n❌ Seed failed:\n", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
