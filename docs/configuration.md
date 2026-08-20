# Backend Configuration

The Flask backend reads the following environment variables at startup. All of
them have working defaults, so none is required for normal use.

| Variable | Default | Purpose |
|---|---|---|
| `CSEMINSIGHT_PORT` | `3354` | Port the API listens on. The `--port` CLI argument takes precedence. |
| `CSEMINSIGHT_DEBUG` | off | Enables Flask debug mode and echoes full tracebacks in API error responses. |
| `CSEMINSIGHT_MAX_UPLOAD_MB` | `512` | Upload size ceiling in megabytes. |
| `CSEMINSIGHT_ALLOWED_ORIGINS` | localhost (any port) and the Tauri webview | Comma-separated list of browser origins allowed to call the API. |

The frontend reads one build-time variable, `VITE_API_BASE_URL`, described
under [Ports](#ports).

## `CSEMINSIGHT_DEBUG`

Accepts `1`, `true`, `yes` or `on` (case-insensitive); `FLASK_DEBUG` works as an
alias. When enabled, API error responses carry an extra `traceback` field.

Leave it off outside local debugging: the traceback exposes local file paths and
internal module structure to anything that can reach the API.

## `CSEMINSIGHT_MAX_UPLOAD_MB`

Requests with a body larger than this are rejected with HTTP 413 before
Werkzeug buffers them, which keeps an oversized file from exhausting memory.
Values that are not positive integers fall back to the default.

Raise it if you routinely work with survey files above the limit:

```bash
CSEMINSIGHT_MAX_UPLOAD_MB=1024 python main.py
```

## `CSEMINSIGHT_ALLOWED_ORIGINS`

The backend binds to `127.0.0.1` only, but any page open in the user's browser
can still reach a localhost port. CORS is therefore restricted to the origins
this app actually ships with:

- `http://localhost:<port>` and `http://127.0.0.1:<port>` — the Vite dev server
  and `vite preview`. The port is not pinned because Vite falls back to another
  one when 5173 is taken.
- `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost` — the
  desktop webview, which uses a custom scheme on macOS/iOS and a virtual host
  elsewhere.

Setting this variable **replaces** the defaults rather than adding to them, so
include every origin you need:

```bash
CSEMINSIGHT_ALLOWED_ORIGINS="http://localhost:5173,tauri://localhost" python main.py
```

## Error response format

Every API error is JSON, never an HTML page:

```json
{
  "error": "Could not parse 'survey.data' as a MARE2DEM data file.",
  "hint": "Verify the file has the expected Tx/Rx/Data blocks and that the header format matches MARE2DEM's .data/.emdata/.resp specification.",
  "detail": "ValueError: Invalid data type: None"
}
```

- `error` — what failed, in one sentence.
- `hint` — the suggested next step. Present on most errors.
- `detail` — a one-line `ExceptionType: message` summary, on unexpected failures.
- `traceback` — the full stack, only when `CSEMINSIGHT_DEBUG` is enabled.

## Ports

The backend listens on 3354 by default. Nothing hard-codes that number as a
requirement, so two copies of the app can run side by side.

**Backend.** Precedence is `--port`, then `CSEMINSIGHT_PORT`, then 3354. Values
that are not a valid port fall through to the next source instead of crashing
at startup.

```bash
python main.py --port 4100
```

**Desktop app.** The Tauri shell picks the port itself, per window: it takes
3354 when free and otherwise asks the OS for any free port, passes it to the
backend as `--port`, and exposes it to the frontend through the `get_api_port`
command. A second instance of the app therefore gets its own backend rather
than colliding with the first. On exit the shell kills the specific child
process it started, so quitting one instance leaves the other running.

**Browser.** The frontend targets `http://127.0.0.1:3354` unless
`VITE_API_BASE_URL` is set at build time:

```bash
VITE_API_BASE_URL=http://127.0.0.1:4100 bun run dev
```

All API calls go through `apiUrl()` in `frontend/src/lib/apiConfig.ts`; there
are no per-call URLs to keep in sync.
