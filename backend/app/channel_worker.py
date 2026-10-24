"""Durable channel delivery worker for Docker/local deployments."""
import signal
from threading import Event
from .channels import dispatch
from .config import Settings
from .repository import create_repository
from .seed import empty_state


def main():
    stopped = Event()
    for name in (signal.SIGINT, signal.SIGTERM):
        signal.signal(name, lambda *_: stopped.set())
    settings = Settings.from_env()
    repository = create_repository(settings, empty_state)
    try:
        repository.initialize()
        while not stopped.is_set():
            try:
                result = dispatch(repository, settings, limit=10)
                if result['processed']:
                    print(f"Channel deliveries processed: {result['processed']}", flush=True)
            except Exception:
                # Do not log exception text that could include a database URL/token.
                print("Channel dispatcher unavailable; will retry", flush=True)
            stopped.wait(5)
    finally:
        repository.close()


if __name__ == '__main__':
    main()
