# ============================================================
# Dockerfile — TTS Web App (Cloud Deployment: AWS / GCP)
# ============================================================
# Lightweight Python image for production
FROM python:3.11-slim

# Environment variables
ENV TTS_ENV=CLOUD
ENV DOCKER_CONTAINER=1
ENV PORT=8080
ENV WORKERS=4
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- ADD THIS LINE TO PRE-DOWNLOAD THE MODEL ---
RUN python -c "from supertonic import TTS; TTS(auto_download=True)"



# Copy application code
COPY . .

# Create audio output directory
RUN mkdir -p /app/static/audio

# Expose port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/api/health')" || exit 1

# Run with Gunicorn (production WSGI server)
CMD gunicorn app:app \
    --bind 0.0.0.0:${PORT} \
    --workers ${WORKERS} \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
