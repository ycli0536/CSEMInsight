import main as backend_main


def test_get_debug_flag_defaults_false(monkeypatch):
    monkeypatch.delenv("CSEMINSIGHT_DEBUG", raising=False)
    monkeypatch.delenv("FLASK_DEBUG", raising=False)

    assert backend_main._get_debug_flag() is False


def test_get_debug_flag_true_when_env_set(monkeypatch):
    monkeypatch.setenv("CSEMINSIGHT_DEBUG", "1")

    assert backend_main._get_debug_flag() is True
