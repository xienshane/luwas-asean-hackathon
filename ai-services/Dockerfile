# LUWAS ai-services — one Hugging Face Space (Docker SDK), free CPU tier (2 vCPU / 16GB).
FROM python:3.12-slim

# libgomp1 is required by the torch CPU wheel.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # TabPFN/HuggingFace weight cache must be writable (Spaces runs as uid 1000).
    HF_HOME=/tmp/huggingface

WORKDIR /app

# CPU-only torch first so requirements.txt doesn't pull multi-GB CUDA wheels.
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data ./data

# Hugging Face Spaces routes traffic to app_port (see README frontmatter).
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
