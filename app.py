import os
import sys
import time
import json
import uuid
import platform
import threading
from datetime import datetime
from collections import deque

# Force the model to download to your D: drive project folder instead of C:
os.environ["XDG_CACHE_HOME"] = os.path.join(os.getcwd(), "model_cache")
os.environ["HF_HOME"] = os.path.join(os.getcwd(), "model_cache")

import psutil
from flask import (
    Flask, render_template, request, jsonify, send_from_directory, url_for
)
from flask_cors import CORS

from config import get_config, detect_environment

# ---------------------------------------------------------------------------
# App Initialization
# ---------------------------------------------------------------------------
app = Flask(__name__)
config = get_config()

app.config.from_object(config)
CORS(app, origins=config.CORS_ORIGINS)

# Ensure audio output directory exists
os.makedirs(config.AUDIO_OUTPUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Performance Logger  (Thread-safe, in-memory ring buffer)
# ---------------------------------------------------------------------------
perf_lock = threading.Lock()
perf_log = deque(maxlen=config.PERFORMANCE_LOG_SIZE)


def log_performance(entry: dict):
    """Append a performance entry with timestamp."""
    entry["timestamp"] = datetime.utcnow().isoformat() + "Z"
    with perf_lock:
        perf_log.append(entry)


def get_performance_logs():
    """Return a snapshot of the performance log."""
    with perf_lock:
        return list(perf_log)


# ---------------------------------------------------------------------------
# System Info Helper
# ---------------------------------------------------------------------------
def get_system_info():
    """Collect current system metrics."""
    vm = psutil.virtual_memory()
    cpu_freq = psutil.cpu_freq()
    return {
        "environment": config.ENV_NAME,
        "env_label": config.ENV_LABEL,
        "hostname": platform.node(),
        "platform": platform.platform(),
        "architecture": platform.machine(),
        "python_version": platform.python_version(),
        "cpu_count": psutil.cpu_count(logical=True),
        "cpu_freq_mhz": round(cpu_freq.current, 1) if cpu_freq else "N/A",
        "cpu_usage_pct": psutil.cpu_percent(interval=0.3),
        "ram_total_mb": round(vm.total / (1024 ** 2)),
        "ram_used_mb": round(vm.used / (1024 ** 2)),
        "ram_usage_pct": vm.percent,
    }


# ---------------------------------------------------------------------------
# TTS Model Loader (lazy — loads on first request)
# ---------------------------------------------------------------------------
tts_model = None
model_load_time = None


def get_tts_model():
    """Lazy-load the Supertonic TTS model."""
    global tts_model, model_load_time
    if tts_model is None:
        print("[TTS] Loading Supertonic 3 model (first request)...")
        load_start = time.time()

        from supertonic import TTS
        tts_model = TTS(auto_download=True)

        model_load_time = round(time.time() - load_start, 3)
        print(f"[TTS] Model loaded in {model_load_time}s")

        log_performance({
            "type": "model_load",
            "duration_s": model_load_time,
            "status": "success",
        })
    return tts_model


# ---------------------------------------------------------------------------
# Routes — Pages
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Render the main TTS web interface."""
    return render_template("index.html", config=config)


# ---------------------------------------------------------------------------
# Routes — API
# ---------------------------------------------------------------------------
@app.route("/api/synthesize", methods=["POST"])
def api_synthesize():
    """
    Synthesize speech from text.
    POST JSON: { "text": "...", "voice": "M1", "lang": "en" }
    Returns:   { "audio_url": "...", "duration": ..., "latency": ..., "perf": {...} }
    """
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    voice = data.get("voice", config.VOICE_NAME)
    lang = data.get("lang", "en")

    if not text:
        return jsonify({"error": "Text is required."}), 400
    if len(text) > config.MAX_TEXT_LENGTH:
        return jsonify({
            "error": f"Text exceeds max length ({config.MAX_TEXT_LENGTH} chars)."
        }), 400

    # --- System metrics BEFORE inference ---
    vm_before = psutil.virtual_memory()
    cpu_before = psutil.cpu_percent(interval=0.1)

    try:
        model = get_tts_model()
        style = model.get_voice_style(voice_name=voice)

        # ---- Inference with timer ----
        infer_start = time.time()
        wav, duration = model.synthesize(text, voice_style=style, lang=lang)
        infer_end = time.time()
        
        # Ensure duration and latency are standard floats (fixes numpy __round__ error)
        duration = float(duration)
        latency = round(infer_end - infer_start, 4)

        # Save audio
        filename = f"tts_{uuid.uuid4().hex[:10]}.wav"
        filepath = os.path.join(config.AUDIO_OUTPUT_DIR, filename)
        model.save_audio(wav, filepath)

        # File size
        file_size_kb = round(os.path.getsize(filepath) / 1024, 2)

        # --- System metrics AFTER inference ---
        vm_after = psutil.virtual_memory()
        cpu_after = psutil.cpu_percent(interval=0.1)

        perf = {
            "type": "inference",
            "latency_s": latency,
            "audio_duration_s": round(duration, 3),
            "realtime_factor": round(duration / latency, 2) if latency > 0 else 0,
            "text_length": len(text),
            "file_size_kb": file_size_kb,
            "voice": voice,
            "lang": lang,
            "cpu_before_pct": cpu_before,
            "cpu_after_pct": cpu_after,
            "ram_before_mb": round(vm_before.used / (1024 ** 2)),
            "ram_after_mb": round(vm_after.used / (1024 ** 2)),
            "ram_delta_mb": round((vm_after.used - vm_before.used) / (1024 ** 2)),
            "status": "success",
        }
        log_performance(perf)

        return jsonify({
            "audio_url": url_for("static", filename=f"audio/{filename}"),
            "duration": round(duration, 3),
            "latency": latency,
            "perf": perf,
        })

    except Exception as e:
        log_performance({
            "type": "inference",
            "status": "error",
            "error": str(e),
            "text_length": len(text),
        })
        return jsonify({"error": str(e)}), 500


@app.route("/api/performance", methods=["GET"])
def api_performance():
    """Return the full performance log."""
    return jsonify({
        "logs": get_performance_logs(),
        "system": get_system_info(),
        "model_load_time_s": model_load_time,
    })


@app.route("/api/system", methods=["GET"])
def api_system():
    """Return live system metrics."""
    return jsonify(get_system_info())


@app.route("/api/health", methods=["GET"])
def api_health():
    """Health-check endpoint (useful for Docker/AWS)."""
    return jsonify({
        "status": "healthy",
        "environment": config.ENV_NAME,
        "version": config.VERSION,
        "uptime_s": round(time.time() - APP_START_TIME, 1),
    })


@app.route("/api/voices", methods=["GET"])
def api_voices():
    """List available TTS voices."""
    try:
        model = get_tts_model()
        voices = model.get_voice_list() if hasattr(model, "get_voice_list") else ["M1", "F1"]
        return jsonify({"voices": voices})
    except Exception as e:
        return jsonify({"voices": ["M1", "F1"], "note": str(e)})


# ---------------------------------------------------------------------------
# Cleanup old audio files (runs every 10 min in background)
# ---------------------------------------------------------------------------
def cleanup_audio():
    """Remove audio files older than 30 minutes."""
    while True:
        time.sleep(600)
        cutoff = time.time() - 1800
        try:
            for f in os.listdir(config.AUDIO_OUTPUT_DIR):
                fp = os.path.join(config.AUDIO_OUTPUT_DIR, f)
                if os.path.isfile(fp) and os.path.getmtime(fp) < cutoff:
                    os.remove(fp)
        except Exception:
            pass


cleanup_thread = threading.Thread(target=cleanup_audio, daemon=True)
cleanup_thread.start()

# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
APP_START_TIME = time.time()

if __name__ == "__main__":
    env = detect_environment()
    print(f"\n{'='*60}")
    print(f"  TTS Web App — {config.ENV_LABEL}")
    print(f"  http://{config.HOST}:{config.PORT}")
    print(f"  Environment : {config.ENV_NAME}")
    print(f"  Debug       : {config.DEBUG}")
    print(f"  Workers     : {config.WORKERS}")
    print(f"{'='*60}\n")

    app.run(
        host=config.HOST,
        port=config.PORT,
        debug=config.DEBUG,
    )
