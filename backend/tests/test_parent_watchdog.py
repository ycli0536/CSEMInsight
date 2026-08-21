"""Tests for shutting the backend down when the process that started it dies."""

import subprocess
import sys
import time

import psutil
import pytest

import main as backend_main


@pytest.fixture()
def dummy_process():
    """A real child process to stand in for the desktop shell."""
    process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    yield process
    if process.poll() is None:
        process.kill()
    process.wait()


class TestParentPidArgument:
    """The shell passes its own PID next to --port."""

    def test_defaults_to_zero_when_absent(self):
        assert backend_main._get_parent_pid([]) == 0

    def test_reads_separate_value_form(self):
        assert backend_main._get_parent_pid(["--parent-pid", "4242"]) == 4242

    def test_reads_equals_form(self):
        assert backend_main._get_parent_pid(["--parent-pid=4242"]) == 4242

    def test_coexists_with_port(self):
        arguments = ["--port", "4100", "--parent-pid", "4242"]

        assert backend_main._get_port(arguments) == 4100
        assert backend_main._get_parent_pid(arguments) == 4242

    @pytest.mark.parametrize("value", ["0", "-3", "abc", ""])
    def test_invalid_values_mean_unsupervised(self, value):
        assert backend_main._get_parent_pid(["--parent-pid", value]) == 0


class TestParentIsGone:
    """A dead or unreapable parent counts as gone; a hiccup does not."""

    def test_running_process_is_not_gone(self, dummy_process):
        parent = psutil.Process(dummy_process.pid)

        assert backend_main._parent_is_gone(parent) is False

    def test_exited_process_is_gone(self, dummy_process):
        parent = psutil.Process(dummy_process.pid)
        dummy_process.kill()
        dummy_process.wait()

        assert backend_main._parent_is_gone(parent) is True

    def test_zombie_counts_as_gone(self, dummy_process):
        """On POSIX a killed but unreaped parent still 'runs'; it is not coming back."""
        parent = psutil.Process(dummy_process.pid)
        dummy_process.kill()
        # Deliberately not reaping, so the process lingers as a zombie.
        deadline = time.time() + 5
        while time.time() < deadline and not backend_main._parent_is_gone(parent):
            time.sleep(0.05)

        assert backend_main._parent_is_gone(parent) is True

    def test_transient_error_is_not_treated_as_gone(self):
        """An AccessDenied blip must not take the backend down with it."""

        class Flaky:
            def is_running(self):
                raise psutil.AccessDenied(1)

        assert backend_main._parent_is_gone(Flaky()) is False


class TestWatchParent:
    """The watchdog exits this process, not just its own thread."""

    def test_exits_once_the_parent_stops(self, dummy_process):
        exits = []

        def stop_watching():
            dummy_process.kill()
            dummy_process.wait()

        stop_watching()
        backend_main._watch_parent(
            dummy_process.pid,
            poll_seconds=0.01,
            exit_process=lambda: exits.append(True),
        )

        assert exits == [True]

    def test_exits_when_the_parent_never_existed(self):
        exits = []
        # PID 0 is not addressable; use a PID that is almost certainly free.
        missing_pid = 2**22 - 1

        backend_main._watch_parent(
            missing_pid,
            poll_seconds=0.01,
            exit_process=lambda: exits.append(True),
        )

        assert exits == [True]

    def test_keeps_serving_while_the_parent_lives(self, dummy_process):
        exits = []
        watcher = backend_main._start_parent_watchdog(
            dummy_process.pid,
            poll_seconds=0.01,
            exit_process=lambda: exits.append(True),
        )

        assert watcher is not None
        time.sleep(0.2)
        assert exits == []

    def test_no_watchdog_without_a_parent_pid(self):
        assert backend_main._start_parent_watchdog(0) is None
