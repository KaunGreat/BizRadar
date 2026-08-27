"""
Быстрая проверка интеграции GigaChat.

Запуск:  python backend/scripts/test_gigachat.py   (из корня репозитория)
   или:  cd backend && python scripts/test_gigachat.py

Сценарии:
  * LLM_PROVIDER=stub (или нет ключа) -> напечатается эвристический отчёт-заглушка
  * LLM_PROVIDER=gigachat + ключ в .env -> напечатается реальный отчёт GigaChat
В обоих случаях скрипт завершается кодом 0: fallback не считается ошибкой.
"""

import sys
from pathlib import Path

# backend/ — корень для импортов (services, catalog)
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

try:  # подтягиваем .env, если он есть (backend/.env или корневой)
    from dotenv import load_dotenv

    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv()  # .env в cwd — для docker-окружения и корневого файла
except ImportError:
    pass

from services.ai_service import RussianLLMService  # noqa: E402


def main() -> None:
    svc = RussianLLMService()

    report = svc.generate_business_report(
        niche='Кофейня формата "кофе с собой"',
        region="Томская область, г. Томск",
        market_data={
            "competitors_count": 42,
            "density_per_100k": 8.1,
            "competition_level": "средняя",
            "avg_income": 48_500,
            "budget": 1_500_000,
        },
    )

    print("=" * 62)
    print(f"Провайдер:        {svc.provider}")
    print(f"Модель:           {svc.model}")
    print(f"Ключ GigaChat:    {'задан' if svc.auth_key else 'НЕ задан'}")
    print(f"Источник отчёта:  {svc.last_report_source}")
    print("=" * 62)
    print()
    print(report)

    # Контракт для main.py: метод всегда возвращает непустую строку
    assert isinstance(report, str) and report.strip(), "контракт нарушен: отчёт пуст"
    print()
    print("OK: контракт соблюдён — вернулась непустая строка.")


if __name__ == "__main__":
    main()
