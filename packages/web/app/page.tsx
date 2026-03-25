import demoData from "../public/demo-data.json";

interface DailyEntry {
  date: string;
  agent: string;
  tokens: number;
  cost: number;
  sessions: number;
}

interface ModelEntry {
  model: string;
  tokens: number;
  cost: number;
}

interface DemoData {
  user: { username: string; avatar_url: string };
  total_tokens: number;
  total_cost: number;
  total_sessions: number;
  daily: DailyEntry[];
  models: ModelEntry[];
}

const data = demoData as DemoData;

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatCost(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Build contribution heatmap data (last 90 days)
function buildHeatmap(daily: DailyEntry[]) {
  const map = new Map<string, number>();
  for (const d of daily) {
    map.set(d.date, (map.get(d.date) || 0) + d.tokens);
  }

  const days: { date: string; tokens: number; level: number }[] = [];
  const now = new Date();
  const maxTokens = Math.max(...Array.from(map.values()), 1);

  for (let i = 89; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const tokens = map.get(dateStr) || 0;
    const level = tokens === 0 ? 0 : Math.min(4, Math.ceil((tokens / maxTokens) * 4));
    days.push({ date: dateStr, tokens, level });
  }

  return days;
}

// Fake leaderboard (your real data + simulated competitors)
const leaderboard = [
  {
    rank: 1,
    username: data.user.username,
    tokens: data.total_tokens,
    cost: data.total_cost,
    streak: data.daily.length,
    agent: "claude-code",
    isYou: true,
  },
  {
    rank: 2,
    username: "tensorchad",
    tokens: Math.floor(data.total_tokens * 0.82),
    cost: data.total_cost * 0.78,
    streak: 19,
    agent: "cursor",
    isYou: false,
  },
  {
    rank: 3,
    username: "promptlord",
    tokens: Math.floor(data.total_tokens * 0.65),
    cost: data.total_cost * 0.61,
    streak: 24,
    agent: "claude-code",
    isYou: false,
  },
  {
    rank: 4,
    username: "vibecodoor",
    tokens: Math.floor(data.total_tokens * 0.51),
    cost: data.total_cost * 0.48,
    streak: 12,
    agent: "codex",
    isYou: false,
  },
  {
    rank: 5,
    username: "gpu_princess",
    tokens: Math.floor(data.total_tokens * 0.43),
    cost: data.total_cost * 0.39,
    streak: 31,
    agent: "gemini-cli",
    isYou: false,
  },
  {
    rank: 6,
    username: "nullpointer",
    tokens: Math.floor(data.total_tokens * 0.37),
    cost: data.total_cost * 0.33,
    streak: 8,
    agent: "cursor",
    isYou: false,
  },
  {
    rank: 7,
    username: "bitmancer",
    tokens: Math.floor(data.total_tokens * 0.29),
    cost: data.total_cost * 0.26,
    streak: 15,
    agent: "claude-code",
    isYou: false,
  },
  {
    rank: 8,
    username: "stacksurfer",
    tokens: Math.floor(data.total_tokens * 0.22),
    cost: data.total_cost * 0.19,
    streak: 5,
    agent: "codex",
    isYou: false,
  },
];

const heatmap = buildHeatmap(data.daily);

const LEVEL_COLORS = [
  "bg-zinc-800/50",
  "bg-emerald-900",
  "bg-emerald-700",
  "bg-emerald-500",
  "bg-emerald-300",
];

const MEDAL = ["", "\u{1F947}", "\u{1F948}", "\u{1F949}"];

export default function Home() {
  // Weekly totals for the bar chart
  const weeklyMap = new Map<string, number>();
  for (const d of data.daily) {
    const date = new Date(d.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split("T")[0];
    weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + d.tokens);
  }
  const weeks = Array.from(weeklyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12);
  const maxWeekly = Math.max(...weeks.map((w) => w[1]), 1);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500 text-sm font-bold text-black">
              T
            </div>
            <span className="text-lg font-bold tracking-tight">
              tokenboard
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <span className="hidden sm:inline">the multiplayer leaderboard for AI token usage</span>
            <code className="rounded bg-zinc-800 px-2 py-1 text-xs text-emerald-400">
              npx tokenboard scan
            </code>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Hero stats */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Tokens" value={formatTokens(data.total_tokens)} />
          <StatCard label="Est. Cost" value={formatCost(data.total_cost)} />
          <StatCard label="Sessions" value={data.total_sessions.toLocaleString()} />
          <StatCard
            label="Active Days"
            value={String(new Set(data.daily.map((d) => d.date)).size)}
          />
        </div>

        {/* Contribution heatmap */}
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">
            Daily Activity — Last 90 Days
          </h2>
          <div className="flex flex-wrap gap-[3px]">
            {heatmap.map((day) => (
              <div
                key={day.date}
                className={`h-3 w-3 rounded-sm ${LEVEL_COLORS[day.level]}`}
                title={`${day.date}: ${formatTokens(day.tokens)} tokens`}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
            <span>Less</span>
            {LEVEL_COLORS.map((c, i) => (
              <div key={i} className={`h-3 w-3 rounded-sm ${c}`} />
            ))}
            <span>More</span>
          </div>
        </section>

        {/* Weekly bar chart */}
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">
            Weekly Token Usage
          </h2>
          <div className="flex items-end gap-2" style={{ height: 120 }}>
            {weeks.map(([week, tokens]) => {
              const pct = (tokens / maxWeekly) * 100;
              return (
                <div key={week} className="group relative flex flex-1 flex-col items-center">
                  <div className="absolute -top-6 hidden rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300 group-hover:block">
                    {formatTokens(tokens)}
                  </div>
                  <div
                    className="w-full rounded-t bg-emerald-500/80 transition-all hover:bg-emerald-400"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                  <span className="mt-1 text-[9px] text-zinc-600">
                    {week.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Leaderboard */}
          <section className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-400">
                Global Leaderboard — This Week
              </h2>
              <div className="flex gap-1 text-xs">
                {(["Today", "Week", "Month", "All"] as const).map((p, i) => (
                  <button
                    key={p}
                    className={`rounded px-2 py-1 ${
                      i === 1
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">User</th>
                    <th className="px-4 py-2.5 font-medium text-right">
                      Tokens
                    </th>
                    <th className="hidden px-4 py-2.5 font-medium text-right sm:table-cell">
                      Cost
                    </th>
                    <th className="hidden px-4 py-2.5 font-medium text-right md:table-cell">
                      Streak
                    </th>
                    <th className="hidden px-4 py-2.5 font-medium text-right md:table-cell">
                      Agent
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr
                      key={entry.rank}
                      className={`border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30 ${
                        entry.isYou ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        {entry.rank <= 3 ? (
                          <span className="text-base">{MEDAL[entry.rank]}</span>
                        ) : (
                          <span className="text-zinc-500">{entry.rank}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-zinc-700" />
                          <span
                            className={
                              entry.isYou
                                ? "font-medium text-emerald-400"
                                : "text-zinc-200"
                            }
                          >
                            {entry.username}
                            {entry.isYou && (
                              <span className="ml-1.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">
                                YOU
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatTokens(entry.tokens)}
                      </td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-400 sm:table-cell">
                        {formatCost(entry.cost)}
                      </td>
                      <td className="hidden px-4 py-3 text-right md:table-cell">
                        <span className="text-orange-400">
                          {entry.streak}d
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-right md:table-cell">
                        <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                          {entry.agent}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Model breakdown */}
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">
                Token Usage by Model
              </h2>
              <div className="space-y-2">
                {data.models.map((m) => {
                  const pct = (m.tokens / data.total_tokens) * 100;
                  return (
                    <div key={m.model}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <code className="text-zinc-300">{m.model}</code>
                        <span className="text-zinc-500">
                          {formatTokens(m.tokens)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Security badge */}
            <div className="rounded-lg border border-zinc-800 p-4">
              <h3 className="mb-2 text-sm font-medium text-emerald-400">
                Zero Code Exposure
              </h3>
              <ul className="space-y-1 text-xs text-zinc-500">
                <li>
                  <span className="text-zinc-600">&#x2717;</span> No code, diffs, or snippets
                </li>
                <li>
                  <span className="text-zinc-600">&#x2717;</span> No prompts or instructions
                </li>
                <li>
                  <span className="text-zinc-600">&#x2717;</span> No file paths or project names
                </li>
                <li>
                  <span className="text-zinc-600">&#x2717;</span> No repo URLs or branch names
                </li>
                <li className="pt-1 text-emerald-500/60">
                  Only token counts + model names
                </li>
              </ul>
            </div>

            {/* Get started */}
            <div className="rounded-lg border border-zinc-800 p-4">
              <h3 className="mb-2 text-sm font-medium text-zinc-300">
                Get Started
              </h3>
              <div className="space-y-2 text-xs">
                <div className="rounded bg-zinc-900 p-2">
                  <code className="text-emerald-400">npx tokenboard scan</code>
                  <p className="mt-1 text-zinc-500">
                    See your local token usage
                  </p>
                </div>
                <div className="rounded bg-zinc-900 p-2">
                  <code className="text-emerald-400">
                    npx tokenboard submit --dry-run
                  </code>
                  <p className="mt-1 text-zinc-500">
                    Preview what gets sent
                  </p>
                </div>
                <div className="rounded bg-zinc-900 p-2">
                  <code className="text-emerald-400">
                    npx tokenboard team create &quot;My Team&quot; my-team
                  </code>
                  <p className="mt-1 text-zinc-500">
                    Start a private competition
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-zinc-800 px-6 py-6 text-center text-xs text-zinc-600">
        <p>
          Tokenboard is open source.{" "}
          <a
            href="https://github.com/melonhead629/tokenboard"
            className="text-zinc-400 hover:text-emerald-400"
          >
            GitHub
          </a>{" "}
          &middot;{" "}
          <a href="#" className="text-zinc-400 hover:text-emerald-400">
            Security Model
          </a>{" "}
          &middot;{" "}
          <a href="#" className="text-zinc-400 hover:text-emerald-400">
            Data Schema
          </a>
        </p>
        <p className="mt-1">
          Tokscale is the speedometer. Tokenboard is the race.
        </p>
      </footer>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
