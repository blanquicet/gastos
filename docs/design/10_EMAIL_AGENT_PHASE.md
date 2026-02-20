# Phase 10: Email Agent + Chat Financiero

**Estado:** 📋 PLANIFICACIÓN  
**Prioridad:** Alta  
**Dependencias:** Backend existente (Phases 1-9)

---

## 🎯 Objetivo

Agregar dos capacidades al backend Go existente:

### A) Automatización de Gastos (Email Processing)
1. Leer automáticamente los emails de notificaciones de Bancolombia
2. Extraer datos con regex (monto, fecha, tarjeta, comercio)
3. Enviar la frase completa del email + lista de categorías del household al LLM para categorización inteligente
4. Crear movimientos/ingresos en el backend automáticamente

### B) Chat Financiero
1. Endpoint `/chat` donde el usuario pregunta en lenguaje natural
2. El backend usa function calling (Azure OpenAI) para consultar datos financieros
3. Responde con información precisa: "Has gastado $345.000 en gasolina este mes"

**Alcance inicial:**
- Emails: Solo compras con tarjeta (crédito/débito) + ingresos a cuenta de ahorros
- Emails: Solo Bancolombia (`alertasynotificaciones@an.notificacionesbancolombia.com`)
- Chat: Solo consultas de lectura (no crear/editar movimientos por chat)

---

## 🏗️ Arquitectura

**Todo en el Go backend** — sin container Python separado.

```
┌──────────────┐     ┌──────────────────────────────────────────────────┐
│   Gmail API  │────▶│  Go Backend (existente + nuevos módulos)         │
│  (read-only) │     │                                                  │
└──────────────┘     │  ┌──────────────┐  ┌────────────────────────┐    │
                     │  │ Email        │  │ Chat Handler           │    │
                     │  │ Processor    │  │ POST /chat             │    │
                     │  │ (goroutine)  │  │                        │    │
                     │  └──────┬───────┘  └──────────┬─────────────┘    │
                     │         │                      │                  │
                     │         ▼                      ▼                  │
                     │  ┌──────────────────────────────────────────┐    │
                     │  │ internal/ai/                              │    │
                     │  │ - Azure OpenAI client (GPT-4o-mini)      │    │
                     │  │ - Function calling (tools)                │    │
                     │  │ - Email categorization                    │    │
                     │  └──────────────────────────────────────────┘    │
                     │         │                      │                  │
                     │         ▼                      ▼                  │
                     │  ┌──────────────────────────────────────────┐    │
                     │  │ PostgreSQL (existente)                    │    │
                     │  │ + processed_emails table                  │    │
                     │  │ + merchant_categories table (cache LLM)  │    │
                     │  └──────────────────────────────────────────┘    │
                     └──────────────────────────────────────────────────┘
                                            ▲
                                            │
                     ┌──────────────────────────────────────────────────┐
                     │  Frontend                                        │
                     │  + /chat page (nueva)                            │
                     └──────────────────────────────────────────────────┘
```

### ¿Por qué todo en Go y no un agente Python separado?

| Aspecto | Python separado | Todo en Go |
|---------|----------------|------------|
| **LLM call** | `openai` Python SDK | `azopenai` Go SDK (maduro, con function calling) |
| **Gmail** | `google-api-python-client` | `google.golang.org/api/gmail/v1` (oficial) |
| **Acceso a datos** | HTTP al backend (necesita API key) | Directo a DB (sin overhead de red) |
| **Auth para chat** | Proxy a través de Go backend | Endpoint directo (usa auth existente) |
| **Deployment** | 2 containers + comunicación interna | 1 container (ya existe) |
| **Categorización** | LLM call + HTTP al backend por categorías | LLM call + query directo a DB |
| **Complejidad** | Alta (2 servicios, proxy, API keys) | Baja (módulos nuevos en backend existente) |

**Conclusión:** El agente Python sería una capa fina que solo orquesta llamadas a servicios externos (Gmail, Azure OpenAI) y al backend. Go puede hacer exactamente lo mismo con acceso directo a la DB, sin overhead de comunicación inter-servicio.

### Componentes

| Componente | Tecnología | Descripción |
|------------|-----------|-------------|
| **Gmail Reader** | Go + `gmail/v1` SDK | Lee emails con OAuth2 read-only |
| **Email Parser** | Go + regex | Extrae datos estructurados del texto del email |
| **AI Client** | Go + `azopenai` SDK | Categorización + chat con function calling |
| **Chat Handler** | Go HTTP handler | Endpoint `/chat` con function calling |
| **State Store** | PostgreSQL | Trackea emails procesados y cache de categorización |
| **Scheduler** | Go goroutine | Ejecuta email processing periódicamente (como recurring movements) |

### Modelo de IA

**GPT-4o-mini** en Azure OpenAI:
- Costo: ~$0.00015/1K tokens input, ~$0.0006/1K tokens output
- Usado para:
  1. **Categorización**: Recibe la frase completa del email + lista de categorías → devuelve categoría
  2. **Chat**: Function calling para responder preguntas financieras
- Costo estimado: ~$0.03/mes

### Rol del LLM en Categorización

El LLM recibe la **frase completa** del email (no solo el nombre del comercio) para mejor contexto:

```
System: Eres un asistente que categoriza gastos. Dada la notificación bancaria y la lista
de categorías disponibles, devuelve la categoría más apropiada en formato JSON.

User: 
Notificación: "Compraste COP22.000,00 en BAJO FUEGO SAS con tu T.Cred *1936, el 20/02/2026 a las 13:15"

Categorías disponibles:
- "Casa - Gastos fijos" (ID: uuid1) — Arriendo, servicios, etc.
- "Mercado" (ID: uuid2) — Supermercado, compras de comida
- "Salidas juntos" (ID: uuid3) — Restaurantes, bares, entretenimiento
- "Jose - Vida cotidiana" (ID: uuid4) — Gastos personales diarios
- "Uber/Gasolina/Peajes/Parqueaderos" (ID: uuid5) — Transporte

Responde SOLO en JSON: {"category_id": "uuid", "confidence": "high|medium|low"}
```

El LLM usa TODO el contexto (monto, hora, tipo de tarjeta, nombre del comercio) para una mejor categorización. Ejemplo: "BAJO FUEGO SAS" a las 13:15 con $22.000 → probablemente almuerzo → "Salidas juntos".

### Cache de Categorización

```sql
CREATE TABLE merchant_categories (
    merchant_name TEXT NOT NULL,
    household_id UUID NOT NULL REFERENCES households(id),
    category_id UUID NOT NULL REFERENCES categories(id),
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (merchant_name, household_id)
);
```

Si "BAJO FUEGO SAS" ya fue categorizado para este household, se reutiliza sin llamar al LLM.

**Tamaño del cache:** ~200-500 filas máximo por household (comercios únicos). Trivialmente pequeño.

### Processed Emails (idempotencia y deduplicación)

```sql
CREATE TABLE processed_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gmail_message_id TEXT NOT NULL,
    config_id UUID NOT NULL REFERENCES email_ingestion_configs(id),
    household_id UUID NOT NULL,
    user_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED', 'SKIPPED')),
    raw_fingerprint TEXT NOT NULL,            -- SHA256 of normalized extracted fields
    created_resource_type TEXT,               -- 'movement' or 'income'
    created_resource_id UUID,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gmail_message_id, config_id)
);
```

**Flujo idempotente:**
1. `INSERT INTO processed_emails (gmail_message_id, config_id, ..., status='PENDING') ON CONFLICT DO NOTHING`
2. Si insert fue no-op → email ya procesado → skip
3. Parsear email → extract fields → compute `raw_fingerprint`
4. Check fingerprint no existe con status='PROCESSED' (protege contra duplicados weird)
5. Crear movimiento/ingreso
6. `UPDATE processed_emails SET status='PROCESSED', created_resource_id=... WHERE id=...`
7. Si falla: `UPDATE SET status='FAILED', error_message=..., retry_count=retry_count+1`

Esto garantiza **exactly-once** incluso tras crashes o restarts.

---

## 📧 Formato de Emails de Bancolombia

### Compra con Tarjeta (Gasto)
```
De: alertasynotificaciones@an.notificacionesbancolombia.com

"Compraste COP22.000,00 en BAJO FUEGO SAS con tu T.Cred *1936, el 20/02/2026 a las 13:15"
```

**Datos extraídos por regex:**
- Tipo: Compra
- Monto: 22000.00
- Comercio: "BAJO FUEGO SAS"
- Tarjeta: "1936"
- Tipo tarjeta: Crédito (T.Cred)
- Fecha: 2026-02-20
- Hora: 13:15

### Ingreso a Cuenta (Income)
```
"Recibiste un pago por $23,378,619.00 de BRANCH OF MICRO a tu cuenta AHORROS, el 09:54 a las 13/02/2026."
```

**Datos extraídos por regex:**
- Tipo: Ingreso
- Monto: 23378619.00
- Origen: "BRANCH OF MICRO"
- Tipo cuenta: AHORROS
- Fecha: 2026-02-13
- Hora: 09:54

---

## 🔐 Autenticación y Configuración

- **Chat**: Usa la auth de sesión existente (misma cookie que el frontend)
- **Email processor**: Corre dentro del backend → llamadas directas a servicios (no necesita auth HTTP)

### Configuración de Email Ingestion (DB-backed)

En lugar de un `EMAIL_PROCESSOR_USER_ID` env var (no escala a múltiples usuarios/households), la configuración se almacena en DB:

```sql
CREATE TABLE email_ingestion_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gmail_account TEXT NOT NULL,          -- e.g. 'jose@gmail.com'
    sender_filter TEXT NOT NULL,          -- e.g. 'alertasynotificaciones@an.notificacionesbancolombia.com'
    gmail_token_encrypted BYTEA,          -- OAuth2 refresh token (encrypted at rest)
    is_enabled BOOLEAN DEFAULT true,
    polling_interval_secs INTEGER DEFAULT 300,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id, user_id, gmail_account)
);
```

Con `user_id` se determina:
- Qué tarjetas/cuentas son del usuario (`payment_methods.owner_id`, `accounts.owner_id`)
- Quién es el pagador en los movimientos creados
- A qué cuenta de ahorros van los ingresos

Para desarrollo/bootstrap, se puede seed via SQL. En producción se administra vía la app.

---

## 🗂️ Estructura de Nuevos Módulos

```
backend/internal/
├── ai/                        # NUEVO - Azure OpenAI integration
│   ├── client.go              # Azure OpenAI client wrapper
│   ├── categorizer.go         # Email categorization logic
│   ├── chat.go                # Chat function calling logic
│   ├── tools.go               # Tool definitions for function calling
│   └── format.go              # COP formatting, dates, timezone (America/Bogota)
├── emailprocessor/            # NUEVO - Email processing
│   ├── types.go               # ParsedTransaction, EmailIngestionConfig, etc.
│   ├── gmail.go               # Gmail API client
│   ├── parser.go              # Regex parser for Bancolombia
│   ├── processor.go           # Main processing loop (idempotent)
│   ├── repository.go          # processed_emails + merchant_categories + configs DB
│   └── scheduler.go           # Background goroutine with pg_advisory_lock
└── ...existing packages...

backend/migrations/
├── 034_create_email_ingestion_configs.up.sql
├── 035_create_processed_emails.up.sql
└── 036_create_merchant_categories.up.sql

frontend/pages/
└── chat.js                    # NUEVO - Chat page
```

---

## 📋 Plan de Implementación

**Orden: Chat primero (valor inmediato, no requiere Gmail), email processing después.**

### Fase 1: Azure OpenAI Integration

**Objetivo:** Módulo reutilizable para llamadas al LLM (base para chat y email).

**Tareas:**
1. Crear `internal/ai/client.go`:
   - Wrapper sobre `azopenai` SDK
   - Configuración: endpoint, deployment name, API key
   - Chat completions con function calling
2. Tests unitarios con mocks

### Fase 2: Chat Endpoint

**Objetivo:** Responder preguntas financieras con datos reales.

**Tareas:**
1. Crear `internal/ai/tools.go`:
   - Definir tools para function calling:
     - `get_movements_summary(month, category?)` — Gastos por categoría
     - `get_income_summary(month)` — Ingresos del mes
     - `get_budget_status(month)` — Presupuesto vs real
     - `get_top_expenses(month, limit?)` — Top N gastos
     - `compare_months(month1, month2, category?)` — Comparación
   - Cada tool consulta la DB directamente (no HTTP)
   - **Evidence pattern**: Cada tool retorna:
     - Totales (números, no formateados — el servidor formatea)
     - Evidence set: top N records (ID, descripción, monto, fecha)
     - Filtros aplicados (month range con timezone, category_id)
   - Ejemplo de retorno de `get_movements_summary`:
     ```json
     {
       "total": 2450000,
       "count": 42,
       "period": {"start": "2026-02-01", "end": "2026-02-28"},
       "by_category": [
         {"name": "Mercado", "total": 850000, "count": 12},
         {"name": "Salidas juntos", "total": 650000, "count": 8}
       ],
       "top_evidence": [
         {"id": "uuid", "description": "Exito Poblado", "amount": 245000, "date": "2026-02-15"}
       ]
     }
     ```
   - El LLM narra, la DB prueba.
2. Crear `internal/ai/chat.go`:
   - Function calling loop:
     a. Recibe mensaje del usuario
     b. Llama Azure OpenAI con tools definidos
     c. Si LLM pide ejecutar un tool → ejecuta y envía resultado
     d. Repite hasta que LLM genere respuesta final
   - System prompt como asistente financiero en español
   - **Guardrail**: Si un tool retorna vacío o error, el LLM debe responder "No tengo datos suficientes para responder eso" (no inventar)
3. Crear `internal/ai/format.go`:
   - **Utilidad centralizada de formateo** (fuera del LLM):
     - COP con separadores de miles, sin decimales salvo necesario: `$2.450.000`
     - Fechas: "Febrero 2026" o "15 de febrero de 2026"
     - Timezone: `America/Bogota` para definir "este mes"
   - **"month" = primer día a las 00:00 hasta último día a las 23:59:59 en America/Bogota**
   - Tools reciben y retornan `time.Time` con TZ correcta; formateo es responsabilidad del servidor
4. Crear handler `POST /chat`:
   - Auth: sesión existente (misma cookie que el resto del frontend)
   - Body: `{"message": "¿Cuánto gasté en gasolina?"}`
   - Response: `{"message": "Has gastado $345.000 en gasolina este mes, basado en 8 movimientos."}`
   - Rate limiting: 20 mensajes/minuto/usuario
5. Tests

### Fase 3: Frontend — Página de Chat

**Objetivo:** UI de chat en el frontend.

**Tareas:**
1. Crear `frontend/pages/chat.js`:
   - Input de texto + botón enviar
   - Lista de mensajes (usuario + asistente)
   - Loading state mientras espera respuesta
   - Auto-scroll al último mensaje
   - Diseño simple y limpio
2. Registrar ruta `/chat` en `app.js`
3. Agregar enlace en navegación principal

### Fase 4: Gmail Integration

**Objetivo:** Leer emails de Bancolombia desde Go.

**Tareas:**
1. Crear `internal/emailprocessor/gmail.go`:
   - OAuth2 con `google.golang.org/api/gmail/v1`
   - Buscar emails por sender + fecha
   - Extraer cuerpo del email (text/plain)
   - Refresh token automático
2. Documentar setup de Google Cloud Console
3. Almacenar OAuth token en DB o archivo de configuración

### Fase 5: Email Parser + Processor

**Objetivo:** Parsear emails y crear movimientos/ingresos.

**Tareas:**
1. Crear `internal/emailprocessor/parser.go`:
   - Regex para compras: `Compraste COP{monto} en {comercio} con tu T.{tipo} *{last4}, el {fecha} a las {hora}`
   - Regex para ingresos: `Recibiste un pago por \${monto} de {pagador} a tu cuenta {tipo_cuenta}, el {hora} a las {fecha}`
   - Retorna `ParsedTransaction` struct
   - Compute `raw_fingerprint` (SHA256 de campos normalizados)
2. Crear `internal/emailprocessor/processor.go`:
   - Loop principal:
     a. Leer `email_ingestion_configs` activos de la DB
     b. Para cada config: buscar nuevos emails (Gmail API, filtro por sender)
     c. Insert `processed_emails` con status=PENDING (ON CONFLICT DO NOTHING)
     d. Si insert fue no-op → skip (ya procesado)
     e. Parsear con regex → extraer campos
     f. Verificar fingerprint no duplicado
     g. Si es compra: categorizar con LLM (o cache en `merchant_categories`)
     h. Resolver `card_last4` → `payment_method_id` (filtrado por user `owner_id`)
     i. Si es ingreso: resolver cuenta de ahorros del usuario
     j. Crear movimiento o ingreso (llamada directa al servicio)
     k. Update status=PROCESSED + created_resource_id
     l. Si falla: Update status=FAILED + error_message + retry_count++
3. Crear `internal/emailprocessor/repository.go`:
   - CRUD para `processed_emails`, `merchant_categories`, `email_ingestion_configs`
4. Crear `internal/emailprocessor/scheduler.go`:
   - Background goroutine (mismo patrón que recurring movements)
   - **`pg_advisory_lock`** para garantizar singleton (safe con múltiples replicas)
   - Configurable: intervalo de polling (default desde config en DB, fallback 5 min)
5. Migraciones:
   - `034_create_email_ingestion_configs.up.sql`
   - `035_create_processed_emails.up.sql`
   - `036_create_merchant_categories.up.sql`
6. Tests con emails fixture

### Fase 6: Deployment + Gmail Setup

**Objetivo:** Configurar todo para producción.

**Tareas:**
1. Agregar variables de entorno al backend:
   ```env
   AZURE_OPENAI_ENDPOINT=https://xxx.openai.azure.com
   AZURE_OPENAI_API_KEY=xxx
   AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
   GMAIL_CREDENTIALS_JSON='{...}'    # OAuth2 client credentials (from Google Cloud Console)
   EMAIL_PROCESSOR_ENABLED=true
   ```
   Nota: Gmail tokens y polling intervals se almacenan en DB (`email_ingestion_configs`), no env vars.
2. Setup de Google Cloud Console (documentación)
3. Primera ejecución: OAuth2 consent en browser → token guardado en DB
4. Seed `email_ingestion_configs` para Jose (SQL)
5. Deployment a Azure Container Apps (mismo container del backend)

---

## 📊 Estimación de Costos

### Azure OpenAI (GPT-4o-mini)
- Categorización: ~30 emails/día × ~300 tokens = 9,000 tokens/día
- Con cache de comercios (~50% repetidos): ~4,500 tokens/día reales
- Chat: ~10 preguntas/día × ~500 tokens = 5,000 tokens/día
- Total: ~10,000 tokens/día ≈ **$0.05/mes**

### Gmail API
- Gratis (quota muy alta)

### Infraestructura adicional
- Ninguna — corre en el mismo container del backend

### Total estimado: **< $1 USD/mes adicional**

---

## 🔒 Seguridad

### Autenticación
1. **Gmail**: Solo read-only (scope `gmail.readonly`)
2. **Chat**: Rate limited (20 msgs/min), autenticado via sesión existente
3. **Email processor**: Configuración por household/usuario en DB

### Prompt Injection & Validación de LLM
4. **Categorización**: El output del LLM se valida con JSON strict parsing — se acepta SOLO `{"category_id": "uuid", "confidence": "high|medium|low"}`. Cualquier otra cosa se rechaza y se marca como FAILED.
5. **category_id**: Se valida contra la lista de categorías del household — el LLM no puede inventar categorías.
6. **Chat tools**: Los tools retornan datos estructurados (no SQL libre). El LLM nunca ejecuta queries arbitrarios.

### Data Minimization
7. **No se almacenan cuerpos de email completos** — solo se guardan campos extraídos (monto, comercio, fecha, last4, fingerprint).
8. **Gmail tokens**: Encriptados en DB (`gmail_token_encrypted`).
9. **Audit logs**: No incluyen raw email content ni tokens de OAuth.
10. **LLM**: Recibe solo la frase de transacción + nombres de categorías (no cuerpo completo del email HTML).

### Concurrencia (multi-replica)
11. **DB advisory lock**: El scheduler usa `pg_advisory_lock(hash)` para garantizar que solo una instancia ejecute el polling a la vez. Mismo patrón que recurring movements scheduler.

---

## ✅ Criterios de Éxito

### Email Processing
- [ ] Emails de Bancolombia se leen automáticamente
- [ ] Compras con tarjeta → movimientos HOUSEHOLD con categoría correcta
- [ ] Ingresos a cuenta → income records
- [ ] LLM categoriza usando frase de transacción + categorías del household
- [ ] Output del LLM se valida estrictamente (JSON schema + category_id en lista permitida)
- [ ] Cache de categorización funciona (comercios repetidos no llaman al LLM)
- [ ] No hay duplicados (processed_emails con gmail_message_id único + fingerprint)
- [ ] Tarjetas se mapean por últimos 4 dígitos (filtradas por usuario)
- [ ] Cuenta de ahorros del usuario se detecta automáticamente
- [ ] Configuración por household/usuario en DB (no hardcoded)
- [ ] Singleton lock con pg_advisory_lock (safe con múltiples replicas)
- [ ] Retries con backoff para emails FAILED

### Chat Financiero
- [ ] Endpoint `/chat` funcional
- [ ] Function calling consulta datos reales de la DB
- [ ] Tools retornan evidence (IDs, descripciones, montos) para que el LLM cite fuentes
- [ ] Respuestas en español con formato colombiano ($X.XXX, timezone America/Bogota)
- [ ] Formateo de montos y fechas centralizado en el servidor (no delegado al LLM)
- [ ] Guardrail: LLM responde "No tengo datos suficientes" si tools fallan o retornan vacío
- [ ] Página de chat en el frontend
- [ ] Rate limiting (20 msgs/min)

### Infraestructura
- [ ] Todo corre en el mismo backend (sin container extra)
- [ ] Costos < $1 USD/mes adicional
- [ ] No se almacenan cuerpos de email completos (solo campos extraídos)
- [ ] Audit logs no contienen tokens ni PII de emails

---

## 🔮 Expansiones Futuras (No en esta fase)

1. **Acciones por chat**: "Agrega un gasto de $50.000 en mercado"
2. **Más tipos de email**: Transferencias, pagos PSE, retiros
3. **Más bancos**: Davivienda, Nequi, Nu
4. **Notificaciones**: Telegram/email cuando se crea un movimiento
5. **Aprendizaje**: El agente aprende de correcciones del usuario
6. **Historial de chat**: Persistir conversaciones para contexto multi-turno
7. **Análisis de tendencias**: "¿Cómo han cambiado mis gastos en los últimos 6 meses?"

