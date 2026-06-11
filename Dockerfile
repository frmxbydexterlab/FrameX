# ──────────────────────────────────────────────────────────────────
#  FrameX — Dockerfile for Google Cloud Run
#
#  Multi-stage build:
#    Stage 1 (builder): install Python deps into a clean venv
#    Stage 2 (runtime): copy only the venv + app files — no build tools
#
#  Result: lean ~250 MB image instead of ~600 MB
# ──────────────────────────────────────────────────────────────────

# ── Stage 1: build dependencies ───────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build tools needed by some packages (e.g. cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy only the requirements first so Docker cache is reused when
# code changes but requirements don't.
COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime image ────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Copy installed packages from builder stage
COPY --from=builder /install /usr/local

# Copy application source
COPY server.py        ./server.py
COPY src/             ./src/
COPY web/             ./web/
COPY configs/         ./configs/
COPY ["tests/My Test Project.wex", "./tests/My Test Project.wex"]
COPY ["join preview images/", "./join preview images/"]

# Create output directory (needed by /api/export)
RUN mkdir -p output

# ── Security: run as non-root user ────────────────────────────────
RUN adduser --disabled-password --gecos "" appuser \
 && chown -R appuser:appuser /app
USER appuser

# Cloud Run injects PORT env var (default 8080).
# We read it at runtime so the same image works locally too.
ENV PORT=8080

EXPOSE 8080

# Uvicorn reads $PORT at startup via the shell form of CMD
CMD uvicorn server:app --host 0.0.0.0 --port $PORT --workers 1
