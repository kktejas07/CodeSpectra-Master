FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN adduser --disabled-password --gecos '' --uid 1001 appuser
COPY --chown=appuser:appuser . .
# Commit 480dab3 (multi-domain engine) imports `from backend.core...` but this
# image keeps modules at /app root. Alias `backend` -> /app so those imports
# resolve without rewriting 141 import lines.
# ponytail: if the engine is later restructured, delete this alias and fix imports.
RUN mkdir -p /app/backend && \
    for d in core domains routers services models migrations; do ln -sfn /app/$d /app/backend/$d; done && \
    for f in server ai_client rag; do ln -sfn /app/$f.py /app/backend/$f.py; done && \
    touch /app/backend/__init__.py && \
    chown -R appuser:appuser /app/backend
USER appuser
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
