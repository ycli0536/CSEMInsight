import math
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


def _index_by_keys(
    rows: Iterable[Dict],
    keys: Sequence[str],
) -> Dict[Tuple, Dict]:
    indexed = {}
    for row in rows:
        try:
            key = tuple(row[k] for k in keys)
        except KeyError:
            continue
        indexed[key] = row
    return indexed


def _safe_float(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class ComparisonEngine:
    def __init__(self, match_by: Optional[Sequence[str]] = None):
        self.match_by = tuple(match_by) if match_by else ("Freq", "Tx_id", "Rx_id", "Type")

    def align_datasets(
        self,
        datasets: Sequence[List[Dict]],
        match_by: Optional[Sequence[str]] = None,
    ) -> List[List[Dict]]:
        keys = tuple(match_by) if match_by else self.match_by
        if not datasets:
            return []

        reference = _index_by_keys(datasets[0], keys)
        aligned = [datasets[0]]
        for dataset in datasets[1:]:
            current = _index_by_keys(dataset, keys)
            common_keys = reference.keys() & current.keys()
            aligned.append([current[k] for k in common_keys])
        return aligned

    def compute_difference(
        self,
        dataset_a: List[Dict],
        dataset_b: List[Dict],
        match_by: Optional[Sequence[str]] = None,
    ) -> List[Dict]:
        keys = tuple(match_by) if match_by else self.match_by
        indexed_a = _index_by_keys(dataset_a, keys)
        indexed_b = _index_by_keys(dataset_b, keys)
        differences = []

        for key in indexed_a.keys() & indexed_b.keys():
            row_a = indexed_a[key]
            row_b = indexed_b[key]
            value_a = _safe_float(row_a.get("Data"))
            value_b = _safe_float(row_b.get("Data"))
            if value_a is None or value_b is None:
                continue
            diff = value_a - value_b
            differences.append({
                "key": key,
                "Data": diff,
                "Data_a": value_a,
                "Data_b": value_b,
            })

        return differences

    def compute_statistics(
        self,
        dataset_a: List[Dict],
        dataset_b: List[Dict],
        match_by: Optional[Sequence[str]] = None,
    ) -> Dict[str, Optional[float]]:
        keys = tuple(match_by) if match_by else self.match_by
        indexed_a = _index_by_keys(dataset_a, keys)
        indexed_b = _index_by_keys(dataset_b, keys)

        values_a = []
        values_b = []
        for key in indexed_a.keys() & indexed_b.keys():
            value_a = _safe_float(indexed_a[key].get("Data"))
            value_b = _safe_float(indexed_b[key].get("Data"))
            if value_a is None or value_b is None:
                continue
            values_a.append(value_a)
            values_b.append(value_b)

        if not values_a:
            return {
                "count": 0,
                "rmse": None,
                "mae": None,
                "correlation": None,
            }

        diffs = [a - b for a, b in zip(values_a, values_b)]
        mse = sum(d * d for d in diffs) / len(diffs)
        rmse = math.sqrt(mse)
        mae = sum(abs(d) for d in diffs) / len(diffs)
        correlation = self._pearson_correlation(values_a, values_b)

        return {
            "count": len(values_a),
            "rmse": rmse,
            "mae": mae,
            "correlation": correlation,
        }

    @staticmethod
    def _pearson_correlation(values_a: List[float], values_b: List[float]) -> Optional[float]:
        if len(values_a) < 2:
            return None
        mean_a = sum(values_a) / len(values_a)
        mean_b = sum(values_b) / len(values_b)
        numerator = sum(
            (a - mean_a) * (b - mean_b) for a, b in zip(values_a, values_b)
        )
        denom_a = math.sqrt(sum((a - mean_a) ** 2 for a in values_a))
        denom_b = math.sqrt(sum((b - mean_b) ** 2 for b in values_b))
        if denom_a == 0 or denom_b == 0:
            return None
        return numerator / (denom_a * denom_b)
