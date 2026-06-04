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
    rho_column_index: int


_REGION_HEADERS = {"#", "region", "region#", "region-id", "regionid"}
_RHO_HEADERS = {"rho", "rho-z", "rho_h", "rho-h"}
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


def parse_region_rho_updates(raw_updates: Any) -> Dict[int, float]:
    """Parse region rho updates from JSON-compatible data."""
    if isinstance(raw_updates, str):
        try:
            raw_updates = json.loads(raw_updates)
        except json.JSONDecodeError as exc:
            raise ResistivityExportError("region_rho_updates must be valid JSON.") from exc

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

    if not updates:
        raise ResistivityExportError("No region rho updates provided.")

    return updates


def _detect_table_layout(line: str) -> _TableLayout | None:
    stripped = line.strip()
    if not stripped.startswith("!#"):
        return None

    header_tokens = stripped[2:].strip().split()
    normalized_tokens = [_normalize_header_token(token) for token in header_tokens]
    try:
        rho_header_index = next(
            index
            for index, token in enumerate(normalized_tokens)
            if token in _RHO_HEADERS
        )
    except StopIteration:
        return None

    region_header_index = next(
        (
            index
            for index in range(rho_header_index)
            if normalized_tokens[index] in _REGION_HEADERS
        ),
        None,
    )
    if region_header_index is None:
        return _TableLayout(region_column_index=0, rho_column_index=rho_header_index + 1)

    return _TableLayout(
        region_column_index=region_header_index,
        rho_column_index=rho_header_index,
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
    updates: Mapping[int, float],
) -> Tuple[str, bool]:
    line_without_ending, line_ending = _split_line_ending(line)
    data_part, comment = _split_inline_comment(line_without_ending)
    tokens = data_part.strip().split()
    if len(tokens) <= max(layout.region_column_index, layout.rho_column_index):
        return line, False

    try:
        region_id = _parse_region_id(tokens[layout.region_column_index])
    except (TypeError, ValueError):
        return line, False

    if region_id not in updates:
        return line, False

    tokens[layout.rho_column_index] = _format_rho(updates[region_id])
    leading_whitespace = re.match(r"\s*", data_part).group(0)
    updated_line = leading_whitespace + " ".join(tokens)
    if comment:
        updated_line += " " + comment.lstrip()

    return updated_line + line_ending, True


def build_exported_resistivity_text(
    source_text: str,
    region_rho_updates: Mapping[int, float],
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
