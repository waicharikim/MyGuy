#!/usr/bin/env bash

if [[ -n "${BASH_VERSION:-}" ]]; then
  _SHAURI_DEV_FILE="${BASH_SOURCE[0]}"
else
  printf 'Source this helper from Bash.\n' >&2
  return 1 2>/dev/null || exit 1
fi

_SHAURI_ROOT="$(cd -- "$(dirname -- "$_SHAURI_DEV_FILE")" && pwd -P)"
_SHAURI_LOCAL="$_SHAURI_ROOT/.local"
_SHAURI_RUN="$_SHAURI_LOCAL/run"
_SHAURI_LOG="$_SHAURI_LOCAL/logs"
_SHAURI_API_PORT="${SHAURI_API_PORT:-3000}"
_SHAURI_PA_PORT="${SHAURI_PA_PORT:-5173}"
_SHAURI_START_TIMEOUT="${SHAURI_START_TIMEOUT:-120}"
_SHAURI_STOP_TIMEOUT="${SHAURI_STOP_TIMEOUT:-20}"

_shauri_pid_file() {
  printf '%s/%s.pid' "$_SHAURI_RUN" "$1"
}

_shauri_log_file() {
  printf '%s/%s.log' "$_SHAURI_LOG" "$1"
}

_shauri_process_start_time() {
  local pid="$1"
  [[ -r "/proc/$pid/stat" ]] || return 1
  sed 's/^.*) //' "/proc/$pid/stat" | awk '{print $20}'
}

_shauri_group_exists() {
  local pgid="$1"
  kill -0 -- "-$pgid" 2>/dev/null
}

_shauri_state() {
  local service="$1"
  local file pid start pgid actual_start
  file="$(_shauri_pid_file "$service")"

  if [[ ! -s "$file" ]]; then
    case "$service" in
      api)
        if curl --silent --fail --max-time 2 "http://127.0.0.1:$_SHAURI_API_PORT/health/live" >/dev/null 2>&1; then
          printf 'external'
        else
          printf 'stopped'
        fi
        ;;
      pa)
        if curl --silent --fail --max-time 2 "http://127.0.0.1:$_SHAURI_PA_PORT/" >/dev/null 2>&1; then
          printf 'external'
        else
          printf 'stopped'
        fi
        ;;
      worker)
        printf 'stopped'
        ;;
    esac
    return
  fi

  read -r pid start pgid <"$file"
  if [[ ! "$pid" =~ ^[0-9]+$ || ! "$pgid" =~ ^[0-9]+$ ]]; then
    printf 'stale'
    return
  fi
  actual_start="$(_shauri_process_start_time "$pid" 2>/dev/null || true)"
  if [[ -z "$actual_start" || "$actual_start" != "$start" ]] || ! _shauri_group_exists "$pgid"; then
    printf 'stale'
    return
  fi
  printf 'running'
}

_shauri_pid_is_ours() {
  local service="$1"
  local file pid start pgid actual_start
  file="$(_shauri_pid_file "$service")"
  [[ -s "$file" ]] || return 1
  read -r pid start pgid <"$file"
  [[ "$pid" =~ ^[0-9]+$ && "$pgid" =~ ^[0-9]+$ ]] || return 1
  actual_start="$(_shauri_process_start_time "$pid" 2>/dev/null || true)"
  [[ -n "$actual_start" && "$actual_start" == "$start" ]] && _shauri_group_exists "$pgid"
}

_shauri_load_env() {
  (
    cd "$_SHAURI_ROOT" || exit
    node -r dotenv/config -e '
      const key = process.argv[1];
      if (process.env[key]?.trim()) process.stdout.write(process.env[key].trim());
    ' "$1"
  )
}

_shauri_prepare_env() {
  if [[ ! -f "$_SHAURI_ROOT/.env" ]]; then
    printf 'Missing %s/.env. Copy .env.example to .env and fill in Shauri provider/database settings.\n' "$_SHAURI_ROOT" >&2
    return 1
  fi
  chmod 600 "$_SHAURI_ROOT/.env" || return

  (
    cd "$_SHAURI_ROOT" || exit
    node <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const file = ".env";
const source = fs.readFileSync(file, "utf8");
const values = dotenv.parse(source);
let changed = false;

if (!values.PA_SESSION_SECRET?.trim()) {
  const value = crypto.randomBytes(48).toString("hex");
  fs.appendFileSync(file, `\n# PA browser-session signing secret (generated locally)\nPA_SESSION_SECRET=${value}\n`);
  changed = true;
}
if (!values.PA_ALLOWED_ORIGINS?.trim()) {
  fs.appendFileSync(file, "PA_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\n");
  changed = true;
}
if (changed) console.log("Added missing PA local-development settings to .env (secret value not displayed).");

const updated = dotenv.parse(fs.readFileSync(file, "utf8"));
const missing = ["DATABASE_URL", "REDIS_HOST"].filter((name) => !updated[name]?.trim());
const missingMessaging = [
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
].filter((name) => !updated[name]?.trim());
const hasModelProvider = [
  "ANTHROPIC_API_KEY",
  "AWS_BEDROCK_MODEL_ID",
  "DASHSCOPE_API_KEY",
  "NEBIUS_API_KEY",
].some((name) => Boolean(updated[name]?.trim()));
if (!hasModelProvider) missing.push("one configured model provider key");
if (!updated.TAVILY_API_KEY?.trim()) missing.push("TAVILY_API_KEY");
if ((updated.PA_SESSION_SECRET?.trim().length ?? 0) < 32) missing.push("PA_SESSION_SECRET (at least 32 characters)");
if (updated.NODE_ENV === "production") missing.push("development helper cannot use NODE_ENV=production");

const apiPort = process.env.SHAURI_API_PORT || "3000";
const paPort = process.env.SHAURI_PA_PORT || "5173";
const origins = (updated.PA_ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
const requiredOrigins = [
  `http://127.0.0.1:${paPort}`,
  ...(paPort === "5173" ? ["http://localhost:5173"] : []),
];
const missingOrigins = requiredOrigins.filter((origin) => !origins.includes(origin));
if (missingOrigins.length) {
  fs.appendFileSync(file, `${fs.readFileSync(file, "utf8").endsWith("\n") ? "" : "\n"}PA_ALLOWED_ORIGINS=${[...origins, ...missingOrigins].join(",")}\n`);
  console.log("Added the selected local PA origin(s) to .env (no secret values displayed).");
}
if (!/^\d+$/.test(apiPort) || Number(apiPort) < 1 || Number(apiPort) > 65535) missing.push("SHAURI_API_PORT (valid TCP port)");
if (!/^\d+$/.test(paPort) || Number(paPort) < 1 || Number(paPort) > 65535) missing.push("SHAURI_PA_PORT (valid TCP port)");
if (missing.length) {
  console.error(`Missing required local configuration: ${missing.join(", ")}`);
  process.exitCode = 1;
} else if (missingMessaging.length) {
  console.warn(`Warning: PA account linking over WhatsApp is unavailable until configured: ${missingMessaging.join(", ")}`);
}
NODE
  ) || return
}

_shauri_ensure_dependencies() {
  if [[ ! -x "$_SHAURI_ROOT/node_modules/.bin/nest" || ! -x "$_SHAURI_ROOT/node_modules/.bin/prisma" ]]; then
    printf 'Shauri dependencies are missing. Run npm ci from %s.\n' "$_SHAURI_ROOT" >&2
    return 1
  fi
  if [[ ! -x "$_SHAURI_ROOT/apps/pa/node_modules/.bin/vite" ]]; then
    printf 'Installing PA dependencies from its lockfile...\n'
    (cd "$_SHAURI_ROOT" && npm ci --prefix apps/pa) || return
  fi
}

_shauri_port_available() {
  local port="$1"
  node - "$port" <<'NODE'
const net = require("node:net");
const port = Number(process.argv[2]);
const server = net.createServer();
server.once("error", () => process.exit(1));
server.listen(port, "127.0.0.1", () => server.close(() => process.exit(0)));
NODE
}

_shauri_start_process() {
  local service="$1"
  shift
  local pid start pgid
  mkdir -p "$_SHAURI_RUN" "$_SHAURI_LOG"

  if [[ "$(_shauri_state "$service")" == "running" ]]; then
    printf '%s is already running under this helper.\n' "$service"
    return 0
  fi

  if [[ "$(_shauri_state "$service")" == "external" ]]; then
    printf '%s already responds on port %s but is not owned by this helper; refusing to start a duplicate.\n' \
      "$service" "$([[ "$service" == "api" ]] && printf '%s' "$_SHAURI_API_PORT" || printf '%s' "$_SHAURI_PA_PORT")" >&2
    return 1
  fi

  rm -f "$(_shauri_pid_file "$service")"
  setsid bash -c 'cd "$1" || exit; shift; exec "$@"' _ "$_SHAURI_ROOT" "$@" \
    >>"$(_shauri_log_file "$service")" 2>&1 </dev/null &
  pid=$!
  pgid="$pid"

  for _ in {1..20}; do
    start="$(_shauri_process_start_time "$pid" 2>/dev/null || true)"
    if [[ -n "$start" ]]; then
      printf '%s %s %s\n' "$pid" "$start" "$pgid" >"$(_shauri_pid_file "$service")"
      printf 'Started %s (PID %s, log %s)\n' "$service" "$pid" "$(_shauri_log_file "$service")"
      return 0
    fi
    sleep 0.1
  done

  printf 'Could not record the %s process started by setsid. See %s\n' \
    "$service" "$(_shauri_log_file "$service")" >&2
  return 1
}

_shauri_wait_ready() {
  local service="$1" url="$2" started="$SECONDS"
  while (( SECONDS - started < _SHAURI_START_TIMEOUT )); do
    if [[ "$(_shauri_state "$service")" != "running" ]]; then
      printf '%s exited during startup. Recent log output:\n' "$service" >&2
      tail -n 40 "$(_shauri_log_file "$service")" >&2 2>/dev/null || true
      return 1
    fi
    if curl --silent --fail --max-time 2 "$url" >/dev/null 2>&1; then
      printf '%s is ready at %s\n' "$service" "$url"
      return 0
    fi
    sleep 1
  done
  printf '%s did not become ready within %s seconds. Recent log output:\n' "$service" "$_SHAURI_START_TIMEOUT" >&2
  tail -n 40 "$(_shauri_log_file "$service")" >&2 2>/dev/null || true
  return 1
}

_shauri_stop_one() {
  local service="$1"
  local file pid start pgid actual_start elapsed
  file="$(_shauri_pid_file "$service")"
  if [[ ! -s "$file" ]]; then
    if [[ "$(_shauri_state "$service")" == "external" ]]; then
      printf '%s is running outside this helper; leaving it untouched.\n' "$service"
    else
      printf '%s is not running under this helper.\n' "$service"
    fi
    return 0
  fi

  read -r pid start pgid <"$file"
  actual_start="$(_shauri_process_start_time "$pid" 2>/dev/null || true)"
  if [[ -z "$actual_start" || "$actual_start" != "$start" ]]; then
    rm -f "$file"
    printf 'Removed stale %s PID file.\n' "$service"
    return 0
  fi

  if ! _shauri_group_exists "$pgid"; then
    rm -f "$file"
    printf '%s has already stopped.\n' "$service"
    return 0
  fi

  printf 'Stopping %s gracefully...\n' "$service"
  kill -TERM -- "-$pgid" 2>/dev/null || {
    printf 'Could not signal process group %s for %s.\n' "$pgid" "$service" >&2
    return 1
  }

  elapsed=0
  while _shauri_group_exists "$pgid" && (( elapsed < _SHAURI_STOP_TIMEOUT )); do
    sleep 1
    ((elapsed += 1))
  done

  if _shauri_group_exists "$pgid"; then
    printf '%s did not exit after %ss; sending SIGKILL to its managed process group.\n' \
      "$service" "$_SHAURI_STOP_TIMEOUT" >&2
    kill -KILL -- "-$pgid" 2>/dev/null || true
    for _ in {1..10}; do
      _shauri_group_exists "$pgid" || break
      sleep 0.2
    done
  fi

  if _shauri_group_exists "$pgid"; then
    printf 'Process group %s for %s is still present; PID file retained for inspection.\n' "$pgid" "$service" >&2
    return 1
  fi

  rm -f "$file"
  printf 'Stopped %s.\n' "$service"
}

_shauri_rollback_start() {
  local started_pa="$1" started_api="$2" started_worker="$3"
  if [[ "$started_pa" == "1" ]]; then _shauri_stop_one pa; fi
  if [[ "$started_api" == "1" ]]; then _shauri_stop_one api; fi
  if [[ "$started_worker" == "1" ]]; then _shauri_stop_one worker; fi
}

shauri_setup() {
  _shauri_prepare_env || return
  _shauri_ensure_dependencies || return
  printf 'Local settings and dependencies look ready. Secret values were not displayed.\n'
}

shauri_adopt_api() {
  local pid="$1" pgid start members member cwd command
  if [[ ! "$pid" =~ ^[0-9]+$ || "$pid" -le 1 ]]; then
    printf 'Usage: shauri_adopt_api <PID>\n' >&2
    return 2
  fi
  if [[ "$(_shauri_state api)" != "external" ]]; then
    printf 'The API is not an unmanaged external service.\n' >&2
    return 1
  fi
  if ! curl --silent --fail --max-time 3 "http://127.0.0.1:$_SHAURI_API_PORT/health/ready" >/dev/null; then
    printf 'The API is not ready; refusing to adopt it.\n' >&2
    return 1
  fi

  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  command="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)"
  if [[ "$cwd" != "$_SHAURI_ROOT" || "$pgid" != "$pid" ||
        ( "$command" != *"npm run start:dev"* &&
          "$command" != *"nest start --watch"* &&
          "$command" != *"$_SHAURI_ROOT/dist/src/main"* ) ]]; then
    printf 'PID %s is not a recognizable Shauri API process group leader in %s; refusing to adopt it.\n' \
      "$pid" "$_SHAURI_ROOT" >&2
    return 1
  fi

  members="$(ps -eo pid=,pgid= | awk -v group="$pgid" '$2 == group {print $1}')"
  while IFS= read -r member; do
    [[ -n "$member" ]] || continue
    cwd="$(readlink "/proc/$member/cwd" 2>/dev/null || true)"
    command="$(tr '\0' ' ' <"/proc/$member/cmdline" 2>/dev/null || true)"
    if [[ "$cwd" != "$_SHAURI_ROOT" ||
          ( "$command" != *"npm run start:dev"* &&
            "$command" != *"nest start --watch"* &&
            "$command" != *"$_SHAURI_ROOT/dist/src/main"* ) ]]; then
      printf 'Process %s in group %s is outside the recognized Shauri API; refusing to adopt the group.\n' \
        "$member" "$pgid" >&2
      return 1
    fi
  done <<<"$members"

  start="$(_shauri_process_start_time "$pid" 2>/dev/null || true)"
  if [[ -z "$start" ]]; then
    printf 'Could not verify the API process start time.\n' >&2
    return 1
  fi
  mkdir -p "$_SHAURI_RUN"
  printf '%s %s %s\n' "$pid" "$start" "$pgid" >"$(_shauri_pid_file api)"
  printf 'Adopted verified Shauri API process group %s. shauri_down can now stop it gracefully.\n' "$pgid"
}

shauri_configure_whatsapp() {
  local name value
  local -a entries=()
  local missing

  _shauri_prepare_env || return
  missing="$(
    cd "$_SHAURI_ROOT" || exit
    node -r dotenv/config -e '
      const names = ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"];
      for (const name of names) if (!process.env[name]?.trim()) console.log(name);
    '
  )"
  if [[ -z "$missing" ]]; then
    printf 'WhatsApp webhook and delivery settings are already configured.\n'
    return 0
  fi

  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    IFS= read -r -s -p "$name: " value || return 1
    printf '\n'
    if [[ -z "$value" ]]; then
      printf '%s cannot be empty.\n' "$name" >&2
      unset value
      return 1
    fi
    entries+=("$name=$value")
    unset value
  done <<<"$missing"

  printf '%s\0' "${entries[@]}" | (
    cd "$_SHAURI_ROOT" || exit
    node -e '
      const fs = require("node:fs");
      const dotenv = require("dotenv");
      const input = fs.readFileSync(0, "utf8").split("\0").filter(Boolean);
      const entries = Object.fromEntries(input.map((item) => {
        const separator = item.indexOf("=");
        return [item.slice(0, separator), item.slice(separator + 1)];
      }));
      const allowed = new Set(["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]);
      if (Object.keys(entries).some((key) => !allowed.has(key))) throw new Error("Unexpected configuration key.");
      let source = fs.readFileSync(".env", "utf8");
      const lines = source.split(/\r?\n/).filter((line) =>
        !/^\s*(?:export\s+)?(?:WHATSAPP_PHONE_NUMBER_ID|WHATSAPP_TOKEN|WHATSAPP_APP_SECRET|WHATSAPP_VERIFY_TOKEN)\s*=/.test(line)
      );
      const cleanSource = lines.join("\n").replace(/\n*$/, "\n");
      const updated = `${cleanSource}${Object.entries(entries).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n")}\n`;
      fs.writeFileSync(".env", updated, { mode: 0o600 });
      fs.chmodSync(".env", 0o600);
      console.log(`Saved ${Object.keys(entries).length} missing WhatsApp setting(s) to .env without displaying values.`);
    '
  ) || return
  unset entries missing
}

shauri_up() {
  local started_api=0 started_worker=0
  _shauri_prepare_env || return
  _shauri_ensure_dependencies || return

  if [[ "$(_shauri_state api)" == "stopped" || "$(_shauri_state api)" == "stale" ]]; then
    _shauri_port_available "$_SHAURI_API_PORT" || {
      printf 'Port %s is occupied by an unmanaged process; refusing to stop or replace it.\n' "$_SHAURI_API_PORT" >&2
      return 1
    }
  fi
  if [[ "$(_shauri_state pa)" == "stopped" || "$(_shauri_state pa)" == "stale" ]]; then
    _shauri_port_available "$_SHAURI_PA_PORT" || {
      printf 'Port %s is occupied by an unmanaged process; refusing to stop or replace it.\n' "$_SHAURI_PA_PORT" >&2
      return 1
    }
  fi

  printf 'Generating Prisma client and applying pending migrations...\n'
  (cd "$_SHAURI_ROOT" && npm run prisma:generate && npx prisma migrate deploy && npm run build) || return

  if [[ "$(_shauri_state api)" == "external" ]]; then
    if ! curl --silent --fail --max-time 3 "http://127.0.0.1:$_SHAURI_API_PORT/health/ready" >/dev/null; then
      printf 'An unmanaged API responds on port %s but is not ready; refusing to use it.\n' "$_SHAURI_API_PORT" >&2
      return 1
    fi
    printf 'Using already-running external Shauri API on port %s; it will not be stopped by shauri_down.\n' "$_SHAURI_API_PORT"
  else
    PORT="$_SHAURI_API_PORT" _shauri_start_process api npm run start:dev || return
    started_api=1
    _shauri_wait_ready api "http://127.0.0.1:$_SHAURI_API_PORT/health/ready" || {
      _shauri_stop_one api
      started_api=0
      return 1
    }
  fi

  if [[ "$(_shauri_state worker)" != "running" ]]; then
    if ! _shauri_start_process worker npm run start:worker; then
      _shauri_rollback_start 0 "$started_api" 0
      return 1
    fi
    started_worker=1
    sleep 2
    if [[ "$(_shauri_state worker)" != "running" ]]; then
      printf 'Worker exited during startup. Recent log output:\n' >&2
      tail -n 40 "$(_shauri_log_file worker)" >&2 2>/dev/null || true
      _shauri_rollback_start 0 "$started_api" "$started_worker"
      return 1
    fi
  fi

  if [[ "$(_shauri_state pa)" == "external" ]]; then
    printf 'Using already-running external PA server on port %s; it will not be stopped by shauri_down.\n' "$_SHAURI_PA_PORT"
  else
    if ! SHAURI_API_TARGET="http://127.0.0.1:$_SHAURI_API_PORT" \
      _shauri_start_process pa npm run pa:dev -- -- --host 127.0.0.1 --port "$_SHAURI_PA_PORT" --strictPort; then
      _shauri_rollback_start 0 "$started_api" "$started_worker"
      return 1
    fi
    _shauri_wait_ready pa "http://127.0.0.1:$_SHAURI_PA_PORT/" || {
      _shauri_stop_one pa
      _shauri_rollback_start 0 "$started_api" "$started_worker"
      return 1
    }
  fi

  printf '\nPA:       http://127.0.0.1:%s/\nShauri:   http://127.0.0.1:%s/health/ready\nLogs:     %s\n' \
    "$_SHAURI_PA_PORT" "$_SHAURI_API_PORT" "$_SHAURI_LOG"
}

shauri_down() {
  local failed=0
  _shauri_stop_one pa || failed=1
  _shauri_stop_one api || failed=1
  _shauri_stop_one worker || failed=1
  return "$failed"
}

shauri_restart() {
  shauri_down || return
  shauri_up
}

shauri_status() {
  local service state
  printf '%-10s %-10s %s\n' SERVICE STATUS DETAILS
  for service in api worker pa; do
    state="$(_shauri_state "$service")"
    case "$service" in
      api) printf '%-10s %-10s %s\n' "$service" "$state" "http://127.0.0.1:$_SHAURI_API_PORT/health/ready" ;;
      worker) printf '%-10s %-10s %s\n' "$service" "$state" "$(_shauri_log_file "$service")" ;;
      pa) printf '%-10s %-10s %s\n' "$service" "$state" "http://127.0.0.1:$_SHAURI_PA_PORT/" ;;
    esac
  done
}

shauri_logs() {
  local service="${1:-all}"
  case "$service" in
    api|worker|pa)
      mkdir -p "$_SHAURI_LOG"
      touch "$(_shauri_log_file "$service")"
      tail -n 100 -f "$(_shauri_log_file "$service")"
      ;;
    all)
      mkdir -p "$_SHAURI_LOG"
      touch "$(_shauri_log_file api)" "$(_shauri_log_file worker)" "$(_shauri_log_file pa)"
      tail -n 100 -f "$(_shauri_log_file api)" "$(_shauri_log_file worker)" "$(_shauri_log_file pa)"
      ;;
    *)
      printf 'Usage: shauri_logs [api|worker|pa|all]\n' >&2
      return 2
      ;;
  esac
}

shauri_urls() {
  printf 'PA:       http://127.0.0.1:%s/\nShauri:   http://127.0.0.1:%s/health/ready\n' \
    "$_SHAURI_PA_PORT" "$_SHAURI_API_PORT"
}

shauri_help() {
  cat <<'HELP'
Source dev.sh once in bash, then use:

  shauri_setup       Generate the PA session secret if missing and check dependencies
  shauri_adopt_api <PID>
                     Adopt a verified, unmanaged Shauri API process group
  shauri_configure_whatsapp
                     Prompt locally for missing WhatsApp settings (input is hidden)
  shauri_up          Generate Prisma client, apply migrations, build, and start API/worker/PA
  shauri_down        Gracefully stop managed PA/API/worker process groups
  shauri_restart     Stop managed services, then start them again
  shauri_status      Show managed/external/stopped service state
  shauri_logs [name] Tail logs (api, worker, pa, or all)
  shauri_urls        Print local URLs
  shauri_help        Show this help

Optional overrides before sourcing:
  SHAURI_API_PORT=3000 SHAURI_PA_PORT=5173 SHAURI_STOP_TIMEOUT=20

Logs and PID files stay under the ignored .local/ directory. A service already
running outside this helper is never killed or replaced.
HELP
}

shauri-help() { shauri_help "$@"; }
shauri-up() { shauri_up "$@"; }
shauri-down() { shauri_down "$@"; }
shauri-restart() { shauri_restart "$@"; }
shauri-status() { shauri_status "$@"; }
shauri-logs() { shauri_logs "$@"; }

unset _SHAURI_DEV_FILE
