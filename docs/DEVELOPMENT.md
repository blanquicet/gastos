# Gastos - Guía de Desarrollo Local

Esta guía explica cómo configurar y ejecutar la aplicación Gastos completa en tu máquina local para desarrollo y testing.

---

## 📋 Prerequisitos

- **Docker** y **Docker Compose** (para PostgreSQL)
- **Go 1.21+** (para el backend)
- **Python 3** (para servir frontend standalone, opcional)
- **golang-migrate** (para ejecutar migraciones de base de datos)

### Instalar golang-migrate

```bash
# Linux
curl -L https://github.com/golang-migrate/migrate/releases/download/v4.17.0/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/

# Verificar instalación
migrate -version
```

---

## 🚀 Setup Inicial

### 1. Clonar el repositorio

```bash
git clone https://github.com/blanquicet/gastos.git
cd gastos
```

### 2. Iniciar PostgreSQL

```bash
# Ir al directorio backend
cd backend

# Iniciar PostgreSQL en Docker
docker compose up -d

# Verificar que esté corriendo y healthy
docker compose ps
```

Esto crea:

- **Contenedor**: `gastos-postgres`
- **Puerto**: `5432`
- **Usuario**: `gastos`
- **Password**: `gastos_dev_password`
- **Base de datos**: `gastos`

### 3. Configurar el backend

```bash
# Ya estamos en el directorio backend/

# Copiar el archivo de ejemplo (ya tiene valores que funcionan)
cp .env.example .env
```

El archivo `.env` viene pre-configurado con los valores correctos para desarrollo local.

### 4. Ejecutar migraciones

**Nota:** Este paso solo se ejecuta **una vez** para crear las tablas en la base de datos.

```bash
# Desde el directorio backend/
# Definir variable para facilitar uso
export DB_URL="postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable"

migrate -path ./migrations -database "$DB_URL" up
```

Deberías ver:

```text
1/u create_users (41.234ms)
2/u create_sessions (18.567ms)
3/u create_password_resets (15.423ms)
```

**Verificar tablas creadas:**

```bash
# El puerto 5432 está expuesto en localhost
psql "$DB_URL" -c "\dt"
```

Salida esperada:

```sql
 Schema |       Name        | Type  | Owner
--------+-------------------+-------+--------
 public | password_resets   | table | gastos
 public | schema_migrations | table | gastos
 public | sessions          | table | gastos
 public | users             | table | gastos
```

---

## 🏃 Ejecutar la Aplicación

**Nota:** Para los comandos de verificación de base de datos, define esta variable primero:

```bash
export DB_URL="postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable"
```

### Opción 1: Backend sirviendo frontend (RECOMENDADO)

El backend puede servir los archivos estáticos del frontend, simplificando el desarrollo.

```bash
# Desde el directorio backend/
go run cmd/api/main.go
```

**Abrir en el navegador:**

```text
http://localhost:8080
```

**Ventajas:**

- ✅ Un solo servidor (puerto 8080)
- ✅ Sin problemas de CORS
- ✅ Configuración más simple

### Opción 2: Solo frontend (desarrollo de UI)

Si solo quieres trabajar en HTML, CSS y JavaScript **sin backend**, puedes servir el frontend standalone:

```bash
cd frontend/registrar-movimiento
python3 -m http.server 8000
```

**Abrir en el navegador:**

```text
http://localhost:8000
```

**Nota:** Esta opción **no se conectará al backend**. Es útil solo para probar cambios visuales. Para probar autenticación, usa la Opción 1.

---

## 🧪 Testing Local

### 1. Verificar salud del backend

```bash
curl http://localhost:8080/health
```

**Respuesta esperada:**

```json
{"status":"healthy"}
```

### 2. Probar el registro de usuario

1. Abrir `http://localhost:8080` en el navegador
2. Click en **"Registrarse"**
3. Ingresar email y contraseña (mínimo 8 caracteres)
4. Click en **"Registrarse"**
5. Deberías ser autenticado automáticamente y ver la app

### 3. Verificar sesión en base de datos

```bash
psql "$DB_URL" -c "SELECT email, created_at FROM users ORDER BY created_at DESC;"
```

### 4. Verificar sesiones activas

```bash
psql "$DB_URL" -c "SELECT u.email, COUNT(s.id) as session_count FROM users u LEFT JOIN sessions s ON u.id = s.user_id GROUP BY u.email;"
```

**Resultado esperado:**

- Cada registro debe crear **1 sesión**
- Después de logout, el usuario debe tener **0 sesiones**

### 5. Probar logout

1. Click en **"Salir"** en la app
2. Deberías volver a la pantalla de login
3. Verificar que la sesión fue eliminada (query del paso 4)

### 6. Probar login

1. Usar las mismas credenciales del registro
2. Deberías autenticarte correctamente
3. La app debe mostrar tu email

---

## 🔍 Verificar Cookies

Abrir **DevTools del navegador** → **Application** → **Cookies** → `http://localhost:8080`

Deberías ver:

| Name             | Value    | HttpOnly | Secure     | SameSite | Expires |
|------------------|----------|----------|------------|----------|---------|
| `gastos_session` | `<uuid>` | ✅       | ❌ (local) | Lax      | 30 días |

---

## 🛠️ Comandos Útiles

### PostgreSQL

```bash
# Conectarse a PostgreSQL directamente
psql "$DB_URL"

# O usando docker exec
docker exec -it gastos-postgres psql -U gastos -d gastos

# Ver logs de PostgreSQL (desde directorio backend/)
cd backend
docker compose logs -f postgres

# Detener PostgreSQL
docker compose down

# Borrar datos y empezar de cero
docker compose down -v
docker compose up -d
# Volver a ejecutar migraciones (paso 4 del setup)
```

### Migraciones

```bash
# Ver versión actual
migrate -path ./migrations -database "$DB_URL" version

# Rollback última migración
migrate -path ./migrations -database "$DB_URL" down 1

# Rollback todas las migraciones
migrate -path ./migrations -database "$DB_URL" down

# Re-aplicar todas
migrate -path ./migrations -database "$DB_URL" up
```

---

## 🐛 Troubleshooting

### PostgreSQL no inicia

**Solución:**

```bash
# Ver logs (desde directorio backend/)
cd backend
docker compose logs postgres

# Reiniciar
docker compose restart postgres

# Si el puerto 5432 está ocupado
docker compose down
# Cambiar puerto en docker-compose.yml: "5433:5432"
# Actualizar DATABASE_URL en .env
docker compose up -d
```

### Migraciones fallan

**Solución:**

```bash
# Verificar conexión
psql "$DB_URL" -c "SELECT 1;"

# Forzar versión (CUIDADO: solo si sabes lo que haces)
migrate -path ./migrations -database "$DB_URL" force 0
migrate -path ./migrations -database "$DB_URL" up
```

### Backend no recarga cambios en frontend

**Causa:** El backend cachea los archivos estáticos al inicio.

**Solución:**

```bash
# Ctrl+C para detener backend
# Reiniciar
go run cmd/api/main.go

# En el navegador: Ctrl+Shift+R (hard refresh)
```

---

## 📚 Documentación Adicional

- **Migraciones**: `backend/migrations/README.md`
- **Infraestructura**: `infra/README.md`
- **Arquitectura Auth**: `.github/CLAUDE_AUTH_PHASE.md`
- **Contexto General**: `.github/CLAUDE.md`

---

## ✅ Checklist de Testing Local

Antes de hacer push:

- [ ] PostgreSQL corriendo (desde `backend/`: `docker compose ps`)
- [ ] Variable `DB_URL` exportada (ver sección "Ejecutar la Aplicación")
- [ ] Migraciones aplicadas una vez (`migrate -path ./migrations -database "$DB_URL" version`)
- [ ] Backend inicia sin errores en puerto 8080
- [ ] `curl http://localhost:8080/health` retorna `{"status":"healthy"}`
- [ ] Acceder a `http://localhost:8080` muestra la pantalla de login
- [ ] Puedes registrar un usuario nuevo
- [ ] Solo se crea 1 sesión en el registro (verificar con `psql "$DB_URL"`)
- [ ] Login funciona correctamente
- [ ] Logout elimina la sesión de la DB
- [ ] Cookie `gastos_session` se crea y elimina correctamente

---

## 🚢 Próximos Pasos

Una vez que todo funciona localmente:

1. **Push a GitHub**: Los workflows de CI/CD desplegarán automáticamente
2. **Verificar en producción**: `https://gastos.blanquicet.com.co`
3. **Consultar logs**: Azure Portal o `az containerapp logs`
