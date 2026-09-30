# Local SEO pilot

Upstream: IamRamgarhia/All-In-One-Free-SEO-Tool at
`c520ea06147abc888b7d459792ec6981609a47f9` (unchanged from the handoff research).
This fork maintains Docker packaging and a read-only MCP boundary.

## Allowed apps and local state

Docker Desktop and Docker CLI/Compose are authorized for this project.
The dashboard uses the Compose `seo-data` named volume; the MCP service mounts
that exact volume read-only. Do not remove the volume when stopping services.
Keep one checkout/Compose project name for both services: a different project
name would select a different volume. The launcher derives its project from
this repository's Compose files, independent of the website working directory.

Create a private `.env` from `.env.example`, set a strong unique `APP_PASSWORD`,
`SEO_HOST_PORT=3100`, `SEO_BIND_ADDR=127.0.0.1`, and
`SEO_DISABLE_SCHEDULER=1`, and `SEO_GOOGLE_GSC_ONLY=1`. The scheduler switch also blocks dashboard-triggered
work. Credentials and `.local/` evidence are excluded from Git and build contexts.
Never copy a real `.env` or database into an image.

```sh
docker compose build
docker compose -f docker-compose.yml -f compose.mcp.yml build mcp
docker compose up -d --no-build
```

Open http://127.0.0.1:3100 and use the password in the private `.env`.
Stop with `docker compose stop`; restart with `docker compose restart seo`.
Back up the persistent data before any upgrade or migration. Do not use
`down -v`, volume pruning, or global Docker cleanup for routine maintenance.

## Read-only MCP

The dashboard's standalone image does not contain the full TypeScript MCP
runtime. The separate `mcp` build target packages that runtime and runs on
stdio without a listening port, without network access, with a read-only
filesystem and a read-only mount of the dashboard volume. It receives no
password or provider environment variables. SQLite opens the existing database
read-only; a missing database fails instead of creating an empty one.
The process can read stored client data, so only attach trusted local projects.

The server advertises and dispatches only these tools in `SEO_MCP_READ_ONLY=1` mode:

- `list_clients`
- `get_client_overview`
- `list_audit_issues`
- `get_keyword_rankings`
- `get_ai_visibility`
- `get_citation_landscape`
- `list_agent_actions`
- `get_recent_agent_runs`
- `list_proposed_fixes`

`run_agent`, `apply_fix`, and `revert_agent_action` are refused, including direct
calls to names absent from discovery. The default upstream mode remains available
for other installs; this project's launcher always uses the restricted service.

Project-scoped `.codex/config.toml` is supported for trusted projects by the
[official MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
Use an absolute path appropriate to the local installation:

```toml
[mcp_servers.local_seo]
command = "/absolute/path/SEOTool/scripts/mcp-docker.sh"
startup_timeout_sec = 30
tool_timeout_sec = 60
enabled_tools = ["list_clients", "get_client_overview", "list_audit_issues", "get_keyword_rankings", "get_ai_visibility", "get_citation_landscape", "list_agent_actions", "get_recent_agent_runs", "list_proposed_fixes"]
```

Restart the MCP connection or open a fresh task after configuration changes.
A protocol smoke test proves the server, not that an already-running Codex task
has reloaded its tools. Keep machine-specific configuration out of public Git.

## Manual baseline and website workflow

The operator-only `scripts/local-audit.ts` uses the upstream crawler with five
pages maximum and depth one by default, robots enabled, static HTML, and private
hosts refused. For a comparable broader audit, pass `--max-pages` (5–25) and
`--max-depth` (1–2) explicitly. Record the options when comparing scores.
It does not run AI, CMS writes, notifications, or automations. Ancillary upstream
robots/sitemap/site-wide/broken-link checks make extra bounded requests: five
pages is a page-analysis cap, not a five-HTTP-request cap. It stores real findings
and audit state in the dashboard DB; failures remain marked failed.

Run it deliberately in an operator container with network access and a writable
volume, separate from the MCP container. For this installation:

```sh
docker run --rm --cap-drop ALL --security-opt no-new-privileges \
  -e SEO_MCP_READ_ONLY=0 -e SEO_DB_PATH=/data/data.db -e SEO_DATA_DIR=/data \
  -v seotool_seo-data:/data seo-tool-mcp:local \
  node node_modules/tsx/dist/cli.mjs scripts/local-audit.ts \
  https://djfreddy.se/ 'DJ Freddy'
```

To revisit the DJ Freddy portfolio and media pages, use
`--max-pages 25 --max-depth 2`. The operator crawl preserves `ignored` and
`false_positive` statuses from the latest completed crawler audit when the same issue
type and URL recur. Mark an issue `new` again to unmute it; `resolved` issues
reopen if the crawler still finds them. The dashboard's own crawl follows the
same status rules and does not create tasks from muted findings. Existing tasks
are separate records. The score still measures raw findings, including muted ones.

Always pair `list_audit_issues` with `get_client_overview`: findings refer to the
last completed audit, while `latestAttempt` reveals a newer failed/running attempt.
Preserve timestamps, crawl options, source version and target URL when comparing
runs. Missing accounts, no audit, a failed attempt, and zero findings are different
states. Ranking data must retain its Search Console versus scraper provenance.

Website changes belong in a DJFreddyWebPage task using its own instructions,
validation and PR workflow. Verify each finding against the rendered page and
current source before selecting a fix. Image-format heuristics can miss modern
`picture` sources; missing dimension attributes need a layout check. An absent
explicit AI-bot rule is a policy choice, not automatically an SEO defect. Do not
change robots policy or business copy just to improve the score. Rerun equivalent
checks against the changed target and retain the baseline. A local score does not
measure Google visibility. Production deployment requires separate authorization.

Search Console authentication and read-only scope verification remain a separate
account-owner step. No provider credentials, CMS connection, or recurring monitor
is configured by this pilot.

## Validation

Before pushing boundary changes, run the read-only MCP protocol check, the focused
scheduler test, TypeScript, lint on changed code, and the Docker build/runtime checks.
The existing broad regression, browser, WordPress and Docker gates remain in CI.
Use a fresh read-only Astra reviewer at high effort for this security/data boundary.

```sh
node scripts/mcp-readonly-check.mjs
pnpm exec tsx scripts/local-audit-check.ts
pnpm exec vitest run src/lib/scheduler.test.ts
pnpm typecheck
```

Acceptance on 2026-09-12: Docker Engine 29.7.2 / Compose 5.3.1; dashboard bound to
127.0.0.1:3100 with password access; all nine tools answered against the shared DB;
client 1 audit 1 completed with five pages, score 96, four findings at
11:46:50 UTC; identical MCP results after dashboard restart. Google and CMS were
unconnected. Raw acceptance responses remain private in `.local/`.

## Connecting Search Console

This pilot uses `SEO_GOOGLE_GSC_ONLY=1`: Google authorization requests only
`webmasters.readonly`, `userinfo.email`, and `openid`, without incremental grants.
The callback rejects missing, insufficient, or broader granted scopes before
storing tokens. Use a dedicated OAuth client; this mode does not revoke or narrow
any tokens stored before it was enabled.

Open `/settings/google`. Create a Google Cloud OAuth Web application client with
the exact displayed loopback redirect URI, enable the Search Console API, and add
your account as a test user. The owner handles Google terms and credential creation
and approves the final Google consent. Save credentials locally, then start a new
connection. Each login uses random state bound to a ten-minute HttpOnly browser
cookie; callbacks without the matching state cannot store tokens.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
and [Search Console authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing).

## Native daily monitoring (optional)

For explicitly authorized recurring collection, set in the private `.env`:

```dotenv
SEO_DISABLE_SCHEDULER=0
SEO_SCHEDULER_MODE=monitoring
SEO_MONITOR_CLIENT_ID=1
```

Rebuild and recreate only the dashboard with `docker compose up -d --build seo`.
Keep the same project and persistent volume; back up the database before upgrading.
The server starts two collection jobs automatically, without a browser visit:
all saved keywords and active page monitors belonging to the selected client.
Each runs when due, 24 hours after its last successful completion. The first
run starts about ten seconds after boot; downtime is caught up on the next start.
Docker and the computer must be running. This is not a fixed wall-clock schedule.

This mode does not run the central agent, reports, notifications, CMS actions,
automation rules, cleanup or backup jobs. Results stay in the existing ranking
and page history, with source/device/date preserved. A missing position is not
a proven ranking loss. Collection failures do not overwrite page snapshots or
insert failed rankings; the scheduler records affected IDs and retries after
30 minutes. Other entries in a partially failed batch may be collected again.
Settings → Automations shows each job's last success and error. Invalid mode or
client configuration fails closed. `SEO_DISABLE_SCHEDULER=1` remains the master
off switch; read-only MCP always keeps scheduling off. Default `full` mode retains
upstream behavior and is **not** the appropriate mode for this limited pilot.

After verifying saved results from a boot-triggered run, pause any overlapping
Codex heartbeat to avoid duplicate checks. This collection-only mode does not
replace the heartbeat's natural-language analysis or change notifications.

Focused monitoring verification (synthetic temporary database, no external requests):
`pnpm exec vitest run --config vitest.monitoring.config.ts`.
