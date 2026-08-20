# Backend Configuration

The Flask backend reads the following environment variables at startup. All of
them have working defaults, so none is required for normal use.

| Variable | Default | Purpose |
|---|---|---|
| `CSEMINSIGHT_DEBUG` | off | Enables Flask debug mode and echoes full tracebacks in API error responses. |
| `CSEMINSIGHT_MAX_UPLOAD_MB` | `512` | Upload size ceiling in megabytes. |
| `CSEMINSIGHT_ALLOWED_ORIGINS` | localhost (any port) and the Tauri webview | Comma-separated list of browser origins allowed to call the API. |

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

The backend port (3354) is currently hard-coded in `backend/main.py`, in the
frontend API calls, and in the Tauri shell. It is not configurable via an
environment variable.
