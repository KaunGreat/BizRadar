# BizRadar API — доступен ТОЛЬКО внутри docker-сети (expose, без ports).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Системные зависимости WeasyPrint (рендер PDF бизнес-плана):
# pango/cairo/gdk-pixbuf — типографика и растеризация,
# fonts-dejavu-core — шрифт с ПОЛНЫМ покрытием кириллицы (критично!),
# shared-mime-info — для корректной работы fontconfig/mime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libharfbuzz0b \
        libgdk-pixbuf-2.0-0 \
        libffi-dev \
        shared-mime-info \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

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
