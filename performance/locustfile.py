"""
Locust Load Testing Script — TTS Web App
==========================================
Run from the tts_webapp directory:
    locust -f performance/locustfile.py --host=http://localhost:5000

Then open http://localhost:8089 in browser to configure and run load tests.

For headless (CLI) mode:
    locust -f performance/locustfile.py --host=http://localhost:5000 \
        --headless -u 10 -r 2 --run-time 60s --csv=performance/results
"""

from locust import HttpUser, task, between


class TTSUser(HttpUser):
    """Simulates a user interacting with the TTS web app."""

    # Wait 1-3 seconds between tasks (simulates real user)
    wait_time = between(1, 3)

    @task(1)
    def health_check(self):
        """Test health endpoint (lightweight)."""
        self.client.get("/api/health")

    @task(1)
    def system_info(self):
        """Test system info endpoint."""
        self.client.get("/api/system")

    @task(1)
    def performance_log(self):
        """Test performance log endpoint."""
        self.client.get("/api/performance")

    @task(5)
    def synthesize_short(self):
        """Synthesize a short sentence (most common operation)."""
        self.client.post("/api/synthesize", json={
            "text": "Hello world, this is a short test.",
            "voice": "M1",
            "lang": "en",
        })

    @task(3)
    def synthesize_medium(self):
        """Synthesize a medium-length paragraph."""
        self.client.post("/api/synthesize", json={
            "text": (
                "The quick brown fox jumps over the lazy dog. "
                "A gentle breeze moved through the open window "
                "while everyone listened to the story."
            ),
            "voice": "M1",
            "lang": "en",
        })

    @task(1)
    def synthesize_long(self):
        """Synthesize a longer text (stress test)."""
        self.client.post("/api/synthesize", json={
            "text": (
                "Artificial intelligence has transformed the way we interact with "
                "technology. From voice assistants on our phones to recommendation "
                "systems on streaming platforms, AI is deeply embedded in our daily "
                "lives. Machine learning models continue to grow more capable, yet "
                "the push for efficient edge deployment ensures that even small "
                "devices can leverage these powerful algorithms."
            ),
            "voice": "M1",
            "lang": "en",
        })

    @task(1)
    def load_homepage(self):
        """Test loading the main page."""
        self.client.get("/")
