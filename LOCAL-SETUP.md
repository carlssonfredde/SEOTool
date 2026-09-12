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
`SEO_DISABLE_SCHEDULER=1`. The scheduler switch also blocks dashboard-triggered
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
pages maximum, depth one, robots enabled, static HTML, and private hosts refused.
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
