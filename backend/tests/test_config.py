import pytest

import main as backend_main


@pytest.fixture(autouse=True)
def _clear_port_env(monkeypatch):
    monkeypatch.delenv("CSEMINSIGHT_PORT", raising=False)


def test_get_port_defaults_to_3354():
    assert backend_main._get_port([]) == backend_main.DEFAULT_PORT


def test_get_port_reads_env(monkeypatch):
    monkeypatch.setenv("CSEMINSIGHT_PORT", "4100")

    assert backend_main._get_port([]) == 4100


def test_get_port_cli_argument_wins_over_env(monkeypatch):
    """Tauri passes the port it reserved; that must beat a stale env var."""
    monkeypatch.setenv("CSEMINSIGHT_PORT", "4100")

    assert backend_main._get_port(["--port", "5200"]) == 5200


def test_get_port_accepts_equals_form():
    assert backend_main._get_port(["--port=5200"]) == 5200


def test_get_port_ignores_unrelated_arguments():
    assert backend_main._get_port(["--frozen", "extra"]) == backend_main.DEFAULT_PORT


@pytest.mark.parametrize("value", ["0", "-1", "70000", "abc", ""])
def test_get_port_rejects_invalid_values(value, monkeypatch):
    monkeypatch.setenv("CSEMINSIGHT_PORT", value)

    assert backend_main._get_port([]) == backend_main.DEFAULT_PORT


@pytest.mark.parametrize("value", ["0", "99999", "abc"])
def test_get_port_rejects_invalid_cli_values(value):
    assert backend_main._get_port(["--port", value]) == backend_main.DEFAULT_PORT


def test_get_debug_flag_defaults_false(monkeypatch):
    monkeypatch.delenv("CSEMINSIGHT_DEBUG", raising=False)
    monkeypatch.delenv("FLASK_DEBUG", raising=False)

    assert backend_main._get_debug_flag() is False


def test_get_debug_flag_true_when_env_set(monkeypatch):
    monkeypatch.setenv("CSEMINSIGHT_DEBUG", "1")

    assert backend_main._get_debug_flag() is True
