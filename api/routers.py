from api.db_context import get_db_alias


class RoleBasedRouter:
    """
    Enruta las queries de Django ORM al alias de BD correspondiente
    según el rol del usuario autenticado, almacenado en thread-local
    por RoleRoutingMiddleware.

    Reglas:
    - Lectura y escritura: alias del hilo actual ('default' o 'standard')
    - Migraciones: siempre 'default' (requiere superuser para DDL)
    - Relaciones entre objetos: permitidas en cualquier alias
    """

    def db_for_read(self, model, **hints):
        return get_db_alias()

    def db_for_write(self, model, **hints):
        return get_db_alias()

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # Las migraciones SOLO corren contra 'default' (superuser)
        return db == 'default'
