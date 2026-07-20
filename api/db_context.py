import threading

_local = threading.local()


def set_db_alias(alias: str) -> None:
    """Almacena el alias de BD para el hilo actual."""
    _local.db_alias = alias


def get_db_alias() -> str:
    """
    Retorna el alias de BD del hilo actual.
    Default 'standard' (mínimo privilegio) para peticiones sin contexto establecido.
    """
    return getattr(_local, 'db_alias', 'standard')
