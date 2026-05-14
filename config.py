"""
Environment Configuration for TTS Web Application.
Detects deployment environment and adjusts settings accordingly.

Environments:
  - LOCAL   : Laptop / Desktop (localhost development)
  - CLOUD   : AWS / GCP Docker container deployment
  - EDGE    : Raspberry Pi / Microprocessor deployment
"""

import os
import platform
import psutil


def detect_environment():
    """Auto-detect the deployment environment."""
    env = os.environ.get("TTS_ENV", "").upper()
    if env in ("LOCAL", "CLOUD", "EDGE"):
        return env

    # Auto-detect based on system characteristics
    machine = platform.machine().lower()
    total_ram_gb = psutil.virtual_memory().total / (1024 ** 3)

    if machine in ("aarch64", "armv7l", "armv6l"):
        return "EDGE"
    elif os.path.exists("/.dockerenv") or os.environ.get("DOCKER_CONTAINER"):
        return "CLOUD"
    else:
        return "LOCAL"


class BaseConfig:
    """Base configuration shared across all environments."""
    SECRET_KEY = os.environ.get("SECRET_KEY", "tts-webapp-dev-key-2024")
    AUDIO_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "static", "audio")
    MAX_TEXT_LENGTH = 1000
    PERFORMANCE_LOG_SIZE = 100  # Keep last N performance entries
    VERSION = "1.0.0"


class LocalConfig(BaseConfig):
    """Laptop / Desktop localhost configuration."""
    ENV_NAME = "LOCAL"
    ENV_LABEL = "💻 Laptop (Localhost)"
    DEBUG = True
    HOST = "0.0.0.0"
    PORT = 5001
    WORKERS = 1
    VOICE_NAME = "M1"
    # Allow access from mobile on same network
    CORS_ORIGINS = "*"


class CloudConfig(BaseConfig):
    """AWS / GCP Docker container configuration."""
    ENV_NAME = "CLOUD"
    ENV_LABEL = "☁️ Cloud (AWS/GCP)"
    DEBUG = False
    HOST = "0.0.0.0"
    PORT = int(os.environ.get("PORT", 8080))
    WORKERS = int(os.environ.get("WORKERS", 4))
    VOICE_NAME = "M1"
    CORS_ORIGINS = "*"
    MAX_TEXT_LENGTH = 2000  # Cloud can handle more


class EdgeConfig(BaseConfig):
    """Raspberry Pi / Edge device configuration."""
    ENV_NAME = "EDGE"
    ENV_LABEL = "🔧 Edge (Raspberry Pi)"
    DEBUG = False
    HOST = "0.0.0.0"
    PORT = 5000
    WORKERS = 1
    VOICE_NAME = "M1"
    CORS_ORIGINS = "*"
    MAX_TEXT_LENGTH = 500  # Limit for low-resource devices


CONFIG_MAP = {
    "LOCAL": LocalConfig,
    "CLOUD": CloudConfig,
    "EDGE": EdgeConfig,
}


def get_config():
    """Return the appropriate config based on detected environment."""
    env = detect_environment()
    return CONFIG_MAP.get(env, LocalConfig)()
