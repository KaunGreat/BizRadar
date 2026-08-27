# BizRadar API — доступен ТОЛЬКО внутри docker-сети (expose, без ports).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# зависимости — отдельным слоем, чтобы не переустанавливать при изменении кода
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# точка входа: ждёт БД -> alembic upgrade head -> uvicorn
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://localhost:8000/api/health', timeout=4).status == 200 else 1)"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
