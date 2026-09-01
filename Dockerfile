FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if required
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy application files
COPY backend /app/backend
COPY frontend /app/frontend

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

# Environment configuration
ENV PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/frontend \
    DB_PATH=/app/data/focusmate.db

EXPOSE 8000

WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
