import json
import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Tuple


class ResistivityExportError(ValueError):
    """Raised when a .resistivity file cannot be exported safely."""


@dataclass(frozen=True)
class _TableLayout:
    region_column_index: int
    #: normalized rho column name -> token index within a data row
    rho_column_indices: Dict[str, int]
    #: column updated when a caller does not name one
    default_rho_column: str


_REGION_HEADERS = {"#", "region", "region#", "region-id", "regionid"}
_RHO_HEADERS = {"rho", "rho-z", "rho-h", "rho-xy"}
#: sentinel key for updates that do not name a rho column
_DEFAULT_COMPONENT = None
_LINE_ENDING_PATTERN = re.compile(r"(\r\n|\n|\r)$")


def _normalize_header_token(token: str) -> str:
    return token.strip().lower().replace("_", "-").rstrip(":")


def _format_rho(value: float) -> str:
    return f"{value:.10E}"


def _parse_region_id(value: Any) -> int:
    return int(float(value))


def _parse_rho_value(value: Any) -> float:
    rho = float(value)
    if not math.isfinite(rho) or rho <= 0:
        raise ResistivityExportError("Rho values must be positive finite numbers.")
    return rho


def _parse_flat_region_rho_updates(raw_updates: Any) -> Dict[int, float]:
    if isinstance(raw_updates, Mapping):
        items: Iterable[Tuple[Any, Any]] = raw_updates.items()
    elif isinstance(raw_updates, list):
        items = []
        for item in raw_updates:
            if not isinstance(item, Mapping):
                raise ResistivityExportError("region_rho_updates list items must be objects.")
            items.append((item.get("regionId"), item.get("rho")))
    else:
        raise ResistivityExportError("region_rho_updates must be an object or list.")

    updates: Dict[int, float] = {}
    for region_id, rho in items:
        try:
            updates[_parse_region_id(region_id)] = _parse_rho_value(rho)
        except (TypeError, ValueError) as exc:
            raise ResistivityExportError("region_rho_updates contains invalid values.") from exc

    return updates


def parse_region_rho_updates(raw_updates: Any) -> Dict[Any, Dict[int, float]]:
    """Parse region rho updates from JSON-compatible data.

    Accepts either a flat ``{region id: rho}`` mapping, which targets the
    file's first rho column, or an anisotropic ``{column name: {region id:
    rho}}`` mapping that names the column to update.
    """
    if isinstance(raw_updates, str):
        try:
            raw_updates = json.loads(raw_updates)
        except json.JSONDecodeError as exc:
            raise ResistivityExportError("region_rho_updates must be valid JSON.") from exc

    is_per_column = (
        isinstance(raw_updates, Mapping)
        and len(raw_updates) > 0
        and all(isinstance(value, Mapping) for value in raw_updates.values())
    )

    if is_per_column:
        updates_by_column: Dict[Any, Dict[int, float]] = {}
        for column, column_updates in raw_updates.items():
            normalized = _normalize_header_token(str(column))
            if normalized not in _RHO_HEADERS:
                raise ResistivityExportError(f"Unknown rho column: {column}")
            parsed = _parse_flat_region_rho_updates(column_updates)
            if parsed:
                updates_by_column[normalized] = parsed
    else:
        parsed = _parse_flat_region_rho_updates(raw_updates)
        updates_by_column = {_DEFAULT_COMPONENT: parsed} if parsed else {}

    if not updates_by_column:
        raise ResistivityExportError("No region rho updates provided.")

    return updates_by_column


def _detect_table_layout(line: str) -> _TableLayout | None:
    stripped = line.strip()
    if not stripped.startswith("!#"):
        return None

    header_tokens = stripped[2:].strip().split()
    normalized_tokens = [_normalize_header_token(token) for token in header_tokens]
    rho_header_indices = {
        token: index
        for index, token in enumerate(normalized_tokens)
        if token in _RHO_HEADERS
    }
    if not rho_header_indices:
        return None

    first_rho_index = min(rho_header_indices.values())
    region_header_index = next(
        (
            index
            for index in range(first_rho_index)
            if normalized_tokens[index] in _REGION_HEADERS
        ),
        None,
    )
    # Without a region header the leading region number is unnamed, so every
    # data token sits one position right of its header token.
    offset = 1 if region_header_index is None else 0

    return _TableLayout(
        region_column_index=0 if region_header_index is None else region_header_index,
        rho_column_indices={
            token: index + offset for token, index in rho_header_indices.items()
        },
        default_rho_column=next(
            token for token, index in rho_header_indices.items() if index == first_rho_index
        ),
    )


def _split_line_ending(line: str) -> Tuple[str, str]:
    match = _LINE_ENDING_PATTERN.search(line)
    if not match:
        return line, ""
    return line[: match.start()], match.group(1)


def _split_inline_comment(line: str) -> Tuple[str, str]:
    comment_index = line.find("!")
    if comment_index == -1:
        return line, ""
    return line[:comment_index].rstrip(), line[comment_index:]


def _replace_row_rho(
    line: str,
    layout: _TableLayout,
    updates_by_column: Mapping[Any, Mapping[int, float]],
) -> Tuple[str, bool]:
    line_without_ending, line_ending = _split_line_ending(line)
    data_part, comment = _split_inline_comment(line_without_ending)
    tokens = data_part.strip().split()
    if len(tokens) <= layout.region_column_index:
        return line, False

    try:
        region_id = _parse_region_id(tokens[layout.region_column_index])
    except (TypeError, ValueError):
        return line, False

    replaced = False
    for column, updates in updates_by_column.items():
        if region_id not in updates:
            continue

        resolved_column = (
            layout.default_rho_column if column is _DEFAULT_COMPONENT else column
        )
        token_index = layout.rho_column_indices.get(resolved_column)
        if token_index is None or token_index >= len(tokens):
            continue

        tokens[token_index] = _format_rho(updates[region_id])
        replaced = True

    if not replaced:
        return line, False

    leading_whitespace = re.match(r"\s*", data_part).group(0)
    updated_line = leading_whitespace + " ".join(tokens)
    if comment:
        updated_line += " " + comment.lstrip()

    return updated_line + line_ending, True


def build_exported_resistivity_text(
    source_text: str,
    region_rho_updates: Any,
) -> str:
    """Return .resistivity text with matching region Rho values replaced."""
    updates = parse_region_rho_updates(region_rho_updates)
    output_lines = []
    layout = None
    saw_rho_table = False
    updated_rows = 0

    for line in source_text.splitlines(keepends=True):
        detected_layout = _detect_table_layout(line)
        if detected_layout is not None:
            layout = detected_layout
            saw_rho_table = True
            missing = [
                column
                for column in updates
                if column is not _DEFAULT_COMPONENT
                and column not in layout.rho_column_indices
            ]
            if missing:
                raise ResistivityExportError(
                    f"Resistivity file has no {', '.join(sorted(missing))} column."
                )
            output_lines.append(line)
            continue

        if layout is not None:
            updated_line, was_updated = _replace_row_rho(line, layout, updates)
            if was_updated:
                updated_rows += 1
            output_lines.append(updated_line)
        else:
            output_lines.append(line)

    if not saw_rho_table:
        raise ResistivityExportError("Could not find a Rho table header.")
    if updated_rows == 0:
        raise ResistivityExportError("No matching regions found in resistivity file.")

    return "".join(output_lines)
