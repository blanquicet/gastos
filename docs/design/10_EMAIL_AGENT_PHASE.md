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
    merchant_name TEXT PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES categories(id),
    confidence TEXT NOT NULL,  -- 'high', 'medium', 'low'
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Si "BAJO FUEGO SAS" ya fue categorizado, se reutiliza sin llamar al LLM.

**Tamaño del cache:** Un usuario típico visita ~50-100 comercios diferentes por mes. En un año: ~200-500 comercios únicos (muchos se repiten). Cada fila es solo: nombre (TEXT) + category_id (UUID) + confidence (TEXT). Es decir, ~500 filas máximo — trivialmente pequeño. Propósito: evitar llamar al LLM de nuevo cuando "EXITO" ya fue categorizado como "Mercado" la semana pasada.

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

## 🔐 Autenticación

- **Email processor**: Corre dentro del backend → llamadas directas a servicios (no necesita auth HTTP)
- **Chat**: Usa la auth de sesión existente (misma cookie que el frontend)

El email processor necesita saber qué usuario está vinculado a cada cuenta bancaria. Esto se configura via variables de entorno:

```env
EMAIL_PROCESSOR_USER_ID=uuid-del-usuario
```

Con este user_id:
- Se filtran payment methods por `owner_id` (para mapear tarjetas por last4)
- Se encuentran las cuentas de ahorros del usuario (para ingresos)
- Se establece quién es el pagador en los movimientos creados

---

## 🗂️ Estructura de Nuevos Módulos

```
backend/internal/
├── ai/                        # NUEVO - Azure OpenAI integration
│   ├── client.go              # Azure OpenAI client wrapper
│   ├── categorizer.go         # Email categorization logic
│   ├── chat.go                # Chat function calling logic
│   └── tools.go               # Tool definitions for function calling
├── emailprocessor/            # NUEVO - Email processing
│   ├── types.go               # ParsedTransaction, etc.
│   ├── gmail.go               # Gmail API client
│   ├── parser.go              # Regex parser for Bancolombia
│   ├── processor.go           # Main processing loop
│   ├── repository.go          # processed_emails + merchant_categories DB
│   └── scheduler.go           # Background goroutine
└── ...existing packages...

backend/migrations/
├── 034_create_processed_emails.up.sql
└── 035_create_merchant_categories.up.sql

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
2. Crear `internal/ai/chat.go`:
   - Function calling loop:
     a. Recibe mensaje del usuario
     b. Llama Azure OpenAI con tools definidos
     c. Si LLM pide ejecutar un tool → ejecuta y envía resultado
     d. Repite hasta que LLM genere respuesta final
   - System prompt como asistente financiero en español
3. Crear handler `POST /chat`:
   - Auth: sesión existente (misma cookie que el resto del frontend)
   - Body: `{"message": "¿Cuánto gasté en gasolina?"}`
   - Response: `{"message": "Has gastado $345.000 en gasolina este mes..."}`
   - Rate limiting: 20 mensajes/minuto/usuario
4. Tests

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
2. Crear `internal/emailprocessor/processor.go`:
   - Loop principal:
     a. Buscar nuevos emails (Gmail API)
     b. Filtrar ya procesados (tabla `processed_emails`)
     c. Parsear con regex
     d. Si es compra: categorizar con LLM (o cache)
     e. Resolver `card_last4` → `payment_method_id` (filtrado por user `owner_id`)
     f. Si es ingreso: resolver cuenta de ahorros del usuario
     g. Crear movimiento o ingreso (llamada directa al servicio, sin HTTP)
     h. Marcar email como procesado
3. Crear `internal/emailprocessor/repository.go`:
   - Tabla `processed_emails`: email_id, status, created_resource_id, error
   - Tabla `merchant_categories`: cache de categorización LLM
4. Crear `internal/emailprocessor/scheduler.go`:
   - Background goroutine (como recurring movements scheduler)
   - Configurable: intervalo de polling (default 5 minutos)
5. Migraciones: `034_create_processed_emails.up.sql`, `035_create_merchant_categories.up.sql`
6. Tests con emails de ejemplo

### Fase 6: Deployment + Gmail Setup

**Objetivo:** Configurar todo para producción.

**Tareas:**
1. Agregar variables de entorno al backend:
   ```env
   AZURE_OPENAI_ENDPOINT=https://xxx.openai.azure.com
   AZURE_OPENAI_API_KEY=xxx
   AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
   GMAIL_CREDENTIALS_JSON='{...}'  # O path a archivo
   GMAIL_TOKEN_JSON='{...}'        # Almacenar en DB o archivo
   EMAIL_PROCESSOR_ENABLED=true
   EMAIL_PROCESSOR_INTERVAL=300    # segundos
   ```
2. Setup de Google Cloud Console (documentación)
3. Primera ejecución: OAuth2 consent en browser
4. Deployment a Azure Container Apps (mismo container del backend)

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

1. **Gmail**: Solo read-only (scope `gmail.readonly`)
2. **Chat**: Rate limited (20 msgs/min), autenticado via sesión existente
3. **LLM**: No se envían datos sensibles más allá de montos y nombres de comercios
4. **Auditoría**: Todos los movimientos/ingresos creados quedan en audit_logs
5. **Email processor**: user_id configurado via env var (determina tarjetas y cuentas)

---

## ✅ Criterios de Éxito

### Email Processing
- [ ] Emails de Bancolombia se leen automáticamente
- [ ] Compras con tarjeta → movimientos HOUSEHOLD con categoría correcta
- [ ] Ingresos a cuenta → income records
- [ ] LLM categoriza usando frase completa + categorías del household
- [ ] Cache de categorización funciona (comercios repetidos no llaman al LLM)
- [ ] No hay duplicados (emails procesados se trackean)
- [ ] Tarjetas se mapean por últimos 4 dígitos (filtradas por usuario)
- [ ] Cuenta de ahorros del usuario se detecta automáticamente

### Chat Financiero
- [ ] Endpoint `/chat` funcional
- [ ] Function calling consulta datos reales de la DB
- [ ] Respuestas en español con formato colombiano
- [ ] Página de chat en el frontend

### Infraestructura
- [ ] Todo corre en el mismo backend (sin container extra)
- [ ] Costos < $1 USD/mes adicional

---

## 🔮 Expansiones Futuras (No en esta fase)

1. **Acciones por chat**: "Agrega un gasto de $50.000 en mercado"
2. **Más tipos de email**: Transferencias, pagos PSE, retiros
3. **Más bancos**: Davivienda, Nequi, Nu
4. **Notificaciones**: Telegram/email cuando se crea un movimiento
5. **Aprendizaje**: El agente aprende de correcciones del usuario
6. **Historial de chat**: Persistir conversaciones para contexto multi-turno
7. **Análisis de tendencias**: "¿Cómo han cambiado mis gastos en los últimos 6 meses?"

