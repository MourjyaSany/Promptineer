# Promptineering backend — native-engine (light) image.
# Runs the full guardrail pipeline on the built-in regex/heuristic engines and
# calls Gemini for inference. The heavy ML engines (torch/NeMo/Presidio/
# LLMLingua) are intentionally NOT installed here — they need several GB of RAM
# and don't fit typical free/standard containers; the app degrades gracefully.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Hosts inject $PORT; default to 8000 for local `docker run`.
ENV PORT=8000
EXPOSE 8000

# Shell form so $PORT expands at runtime.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
