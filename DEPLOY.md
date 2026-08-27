# BizRadar — продакшн-деплой (Docker + Caddy, авто-HTTPS)

## Итоговое дерево репозитория

```
bizradar/
├── docker-compose.yml        # 3 сервиса: api, frontend, caddy + volumes
├── Caddyfile                 # один сайт {$SITE_ADDRESS} → frontend:3000
├── .env.production           # ШАБЛОН: секреты и настройки (в .gitignore)
├── .gitignore
├── DEPLOY.md                 # этот файл
│
├── backend/                  # FastAPI — модульный монолит
│   ├── Dockerfile            # expose 8000, healthcheck, без ports
│   ├── .dockerignore
│   ├── main.py               # /api/health · /api/niches · /api/report
│   ├── database.py           # SQLite: путь из DATABASE_PATH, mkdir при старте
│   ├── catalog.py            # каталог ниш со скорингом v1 + market_data
│   ├── requirements.txt      # fastapi, uvicorn, gigachat, python-dotenv
│   ├── .env.example          # локальный запуск БЕЗ Docker
│   ├── services/
│   │   ├── __init__.py
│   │   └── ai_service.py     # RussianLLMService: GigaChat → fallback на заглушку
│   └── scripts/
│       └── test_gigachat.py  # проверка интеграции и fallback-веток
│
├── frontend/                 # Next.js (App Router, standalone)
│   ├── Dockerfile            # multistage: deps → build → runner (server.js)
│   ├── .dockerignore
│   ├── package.json
│   ├── next.config.js        # rewrites /api/* → BACKEND_INTERNAL_URL
│   ├── tsconfig.json · next-env.d.ts · postcss.config.mjs
│   └── app/
│       ├── layout.tsx        # шрифты Unbounded + Golos Text, metadata
│       ├── globals.css
│       ├── page.tsx          # схема трафика, живые статусы из /api/health
│       └── niches/page.tsx   # каталог + генерация отчёта через /api/report
│
└── (корень также содержит Vite-прототип радара: index.html, src/, package.json —
   локальный демо-стенд, в прод-контейнеры не входит)
```

## Маршрутизация (принципиально)

```
браузер ──HTTPS──▶ caddy :80/:443 (ACME, caddy:2-alpine)
                       │  reverse_proxy
                       ▼
                 frontend :3000 (Next.js, expose — без ports)
                       │  rewrites: /api/* → ${BACKEND_INTERNAL_URL}
                       ▼
                 api :8000 (FastAPI, expose — без ports)
                       │  DATABASE_PATH=/data/bizradar/bizradar.db
                       ▼
                 volume db-data
```

Браузер видит один домен. Порты 8000 и 3000 наружу **не проброшены** — снаружи
доступен только Caddy.

## Команды

### Прод на чистом VPS (Docker + Docker Compose v2 уже стоят)

```bash
git clone <repo> && cd bizradar

# 1) секреты: домен и ключ GigaChat (placeholder уже в шаблоне)
nano .env.production
#    SITE_ADDRESS=radar.example.com        <- ваш реальный домен (A-запись на VPS)
#    LLM_PROVIDER=gigachat                 <- или stub, чтобы начать без ключа
#    GIGACHAT_AUTH_KEY=MzMz...             <- developers.sber.ru

# 2) одна команда — и сайт работает
docker compose --env-file .env.production up -d --build

# 3) статус и логи
docker compose ps
docker compose logs -f caddy api
```

### Локально БЕЗ Docker

```bash
# бэкенд (терминал 1)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # по желанию
uvicorn main:app --reload --port 8000               # http://localhost:8000/api/health

# фронтенд (терминал 2): BACKEND_INTERNAL_URL по умолчанию = http://localhost:8000
cd frontend
npm install
npm run dev                                         # http://localhost:3000

# проверка интеграции LLM
python backend/scripts/test_gigachat.py
```

### Локальный прогон compose без домена

```bash
SITE_ADDRESS=:80 docker compose --env-file .env.production up -d --build
# сайт: http://localhost  (HTTPS не нужен, ACME не вызывается)
```

## Чек-лист после деплоя

1. **Контейнеры**: `docker compose ps` — все три `Up`, у `api` статус `(healthy)`.
2. **HTTPS**: `curl -sI https://<ваш-домен> | head -1` → `HTTP/2 200`; в
   `docker compose logs caddy` строка `certificate obtained successfully`.
3. **Главная**: открыть `https://<домен>/` — схема трафика, чип `api 0.5.0 · онлайн`
   зелёный, «LLM-провайдер» показывает gigachat/заглушку, «База данных» — «SQLite на месте».
4. **Радар ниш**: `https://<домен>/niches` — 16 ниш из `GET /api/niches`.
5. **Отчёт**: выбрать нишу → «Сгенерировать отчёт» → приходит Markdown со структурой
   Выживаемость/Риски/Точки роста/Рекомендация; бейдж источника:
   **GigaChat** (ключ рабочий) или **эвристика (заглушка)** (без ключа — тоже норма,
   см. `docker compose logs api`: warn про fallback).
6. **Бэкенд скрыт**: `curl http://<ip-сервера>:8000/api/health` → connection refused
   (порт не проброшен), а `curl https://<домен>/api/health` → 200 JSON.
7. **Персистентность**: `docker compose exec api ls -l /data/bizradar` — есть
   `bizradar.db`; после `docker compose up -d --build` файл и данные на месте
   (`docker volume ls` → `bizradar_db-data`).
8. **Секреты**: `git status` — `.env.production` и `.env` не отслеживаются.

## Troubleshooting

- **Caddy не получает сертификат**: A-запись домена не указывает на VPS, либо закрыт
  порт 80 (нужен для http-01). За DNS/CDN используйте dns-01 challenge.
- **frontend отдаёт 500 на /api/***: `BACKEND_INTERNAL_URL` должен быть именно
  `http://api:8000` (имя сервиса), не `localhost` — внутри контейнера localhost это он сам.
- **GigaChat отдаёт ошибку TLS вне России/Госуслуг**: в SDK уже стоит
  `verify_ssl_certs=False` (цепочка российского УЦ); при иных сбоях сервис
  автоматически вернёт заглушку — эндпоинт не падает.
- **Смена секрета**: правка `.env.production` → `docker compose --env-file .env.production up -d`
  (api перечитает окружение; volume с БД не трогается).
