CREATE TABLE tractos (
    id SERIAL PRIMARY KEY,
    no_eco VARCHAR(50) UNIQUE NOT NULL,
    anio SMALLINT NOT NULL,
    unidad VARCHAR(100) NOT NULL,
    placas VARCHAR(20) UNIQUE NOT NULL,
    tipo VARCHAR(50) NOT NULL
);

CREATE TABLE remolques (
    id SERIAL PRIMARY KEY,
    color VARCHAR(50),
    tipo VARCHAR(50) NOT NULL,
    placas VARCHAR(20) UNIQUE NOT NULL
);

CREATE TABLE choferes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    rfc VARCHAR(13) UNIQUE NOT NULL CHECK (char_length(rfc) >= 12),
    licencia VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE maniobras (
    id SERIAL PRIMARY KEY,
    ff INTEGER,
    solicita TEXT,
    agencia TEXT,
    codigo_pis TEXT,
    terminal TEXT,
    placas_pis TEXT,
    fecha_pis TEXT,
    horario TEXT,
    tipo_y_peso TEXT,
    contenedor TEXT,
    pedimento TEXT,
    cliente TEXT,
    origen TEXT,
    destino TEXT,
    asignacion_operador_status TEXT,
    unidad TEXT,
    folio TEXT,
    vacio_patio TEXT,
    status_vacio TEXT,
    fecha_entrega_mercancia TEXT,
    no_factura TEXT,
    ccp TEXT
);