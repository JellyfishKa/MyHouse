import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Определяем базовую директорию проекта (backend/)
BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """
    Application settings and configuration.
    """
    DB_USER: str
    DB_PASSWORD: str
    DB_NAME: str
    DB_PORT: int

    REDIS_PASSWORD: str | None = None
    NODE_ENV: str = "development"
    BACKEND_PORT: int = 8000
    ELECTRICITY_TARIFF: float = 5.0

    @property
    def DATABASE_URL(self) -> str:
        """
        Returns the PostgreSQL connection string.
        """
        return (
            f"postgresql+psycopg2://{self.DB_USER}:"
            f"{self.DB_PASSWORD}@localhost:{self.DB_PORT}/{self.DB_NAME}"
        )

    # Указываем абсолютный путь к .env файлу
    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env"),
        env_ignore_empty=True,
        extra="ignore"
    )


settings = Settings()
