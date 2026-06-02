# Contratos Publicos - Scraper + API + Frontend

Base de proyecto en TypeScript para consolidar scraping de contratos menores y licitaciones, almacenar historico en MySQL y exponer los datos por API para consumo desde frontend Vite.

## Estructura

- `apps/api`: backend Express en TypeScript, scraping con Puppeteer, scheduler con node-cron y persistencia MySQL.
- `apps/web`: frontend Vite con TypeScript.
- `docker-compose.yml`: orquesta MySQL + API + web en contenedores.
- `contratos_menores.js` y `licitaciones.js`: scripts legacy para referencia/migracion.

## Opcion A: Arranque con Docker (recomendado)

Desde la raiz:

```bash
npm run docker:up
```

URLs:

- Frontend: http://localhost:8080
- API: http://localhost:4000
- MySQL: localhost:3307

Parar contenedores:

```bash
npm run docker:down
```

Ver logs:

```bash
npm run docker:logs
```

La base de datos se inicializa automaticamente usando `apps/api/sql/init.sql`.

## Opcion B: Desarrollo local sin Docker

1. Copia `apps/api/.env.example` en `apps/api/.env` y ajusta credenciales.
2. Instala dependencias:

```bash
npm install
npm run install:apps
```

3. Arranca API y web en dos terminales:

```bash
npm run dev:api
npm run dev:web
```

URLs:

- Frontend: http://localhost:5173
- API: http://localhost:4000

## Endpoints API

- `GET /health`
- `GET /api/contracts?sourceType=contrato_menor|licitacion&limit=50&offset=0`
- `POST /api/scrape/run`
- `POST /api/import/historical`

Body para ejecutar scraping manual:

```json
{
  "sourceType": "all"
}
```

Valores validos para sourceType: all, contrato_menor, licitacion.

## Importar historico desde nuevos_datos

Con Docker levantado, tienes dos formas:

1. Desde frontend en `http://localhost:8080`: boton `Importar historicos`.
2. Por comando:

```bash
docker compose exec api npm run import:historical
```

El importador busca ficheros en `nuevos_datos` con sufijos `_contratos_menores.json` y `_licitaciones.json`, hace upsert por `(source_type, expediente)` y evita duplicados vacios.

## Lanzar scraping manual para anadir datos nuevos

Con Docker levantado:

1. Desde frontend: boton `Ejecutar scraping`.
2. O por API:

```bash
curl -X POST http://localhost:4000/api/scrape/run -H "Content-Type: application/json" -d "{\"sourceType\":\"all\"}"
```

## Siguientes pasos recomendados

1. Añadir tests de parser con fixtures HTML reales del portal.
2. Versionar cambios por expediente para trazabilidad historica.
3. Mover ejecuciones de scraping a cola de trabajos (BullMQ + Redis).
