# Gastos - Expense Tracking Web App

> Personal expense-tracking web app deployed on **Azure Static Web Apps (SWA)** integrated with an **n8n webhook backend** that writes to a Google Sheets/Excel-like ledger.

---

## 🎯 Goals

- Continue improving the frontend at <https://gastos.blanquicet.com.co/registrar-movimiento>
- Ensure end-to-end flow: **Mobile-friendly form → POST to n8n webhook → row appended to "Gastos" table**
- Keep the current data model decisions: payments of debt stay in "Gastos" with `Tipo=PAGO_DEUDA`; direction is inferred using `Pagador` and `Contraparte`

---

## 🏗️ Current Deployment / Infrastructure

### Frontend: Azure Static Web Apps (SWA)

| Setting | Value |
|---------|-------|
| Custom domain | `gastos.blanquicet.com.co` |
| DNS | Cloudflare (DNS-only, **not proxied**) |
| App path | `/registrar-movimiento` |
| Build | None (pure static HTML/CSS/JS) |
| Deploy | GitHub Actions on push |

> **Important:** SWA must find `index.html` in `app_location`, so `app_location` is `/registrar-movimiento` and `skip_app_build=true`. The `staticwebapp.config.json` handles route rewrites.

### Backend: n8n on VM behind Caddy

| Setting | Value |
|---------|-------|
| Domain | `https://n8n.blanquicet.com.co` |
| Webhook endpoint | `POST https://n8n.blanquicet.com.co/webhook/movimientos/reportar` |
| CORS origin | `https://gastos.blanquicet.com.co` |
| Auth | Header Auth via `X-API-Key` |

> **Important:** CORS must include `X-API-Key` in `Access-Control-Allow-Headers`, otherwise browser preflight will fail.

---

## ✅ End-to-End Verified

```bash
curl -X POST https://n8n.blanquicet.com.co/webhook/movimientos/reportar \
  -H "X-API-Key: mov-2025-registrar-9f3a7c2d8e41" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Returns: {"ok":true,"message":"Movimiento registrado"}
```

The app writes rows to the "Gastos" table with computed `Mes` (YYYY-MM) and `Semana` (YYYY-W##).

---

## 📊 Data Model / Business Rules

### Tipos de Movimiento

| Tipo | Descripción | Campos visibles |
|------|-------------|-----------------|
| `FAMILIAR` | Gasto familiar | Método de pago, Categoría |
| `COMPARTIDO` | Gasto dividido entre participantes | Pagador, Método de pago (si Jose/Caro), Participantes |
| `PAGO_DEUDA` | Pago/cobro de deuda entre personas | Pagador + Tomador (lado a lado), Método de pago (si Jose/Caro), Categoría (si Jose/Caro) |

### Reglas de Deuda (`PAGO_DEUDA`)

- `Pagador=me` + `Contraparte=other` → **cash-out** (yo pago)
- `Pagador=other` + `Contraparte=me` → **cash-in** (me pagan)
- `Pagador ≠ Contraparte` (obligatorio)

### Reglas de Compartido (`COMPARTIDO`)

- Los participantes pueden dividirse **equitativamente** o por **porcentajes**
- La suma de porcentajes debe ser 100%
- Al cambiar pagador, los participantes se resetean completamente

---

## 👥 Usuarios

| Nombre | Familia |
|--------|---------|
| Jose | ✅ |
| Caro | ✅ |
| Maria Isabel | ❌ |
| Papá Caro | ❌ |
| Mamá Caro | ❌ |
| Daniel | ❌ |
| Yury | ❌ |
| Prebby | ❌ |
| Kelly Carolina | ❌ |

> El frontend usa `DEFAULT_USERS` con estos nombres (la ortografía exacta importa).

---

## 🏷️ Categorías

Campo **obligatorio** para:
- `FAMILIAR` (siempre)
- `PAGO_DEUDA` (solo si pagador es Jose o Caro)

Opciones disponibles:

```
Pago de SOAT/impuestos/mantenimiento
Carro - Seguro
Uber/Gasolina/Peajes/Parqueaderos
Casa - Gastos fijos
Casa - Cositas para casa
Casa - Provisionar mes entrante
Kellys
Mercado
Ahorros para SOAT/impuestos/mantenimiento
Ahorros para cosas de la casa
Ahorros para vacaciones
Ahorros para regalos
Salidas juntos
Vacaciones
Inversiones Caro
Inversiones Jose
Inversiones Juntos
Regalos
Caro - Gastos fijos
Caro - Vida cotidiana
Jose - Gastos fijos
Jose - Vida cotidiana
Gastos médicos
Caro - Imprevistos
Jose - Imprevistos
Casa - Imprevistos
Carro - Imprevistos
Préstamo
```

---

## 💳 Métodos de Pago

**Reglas:**
- `FAMILIAR`: Campo **siempre obligatorio**
- `COMPARTIDO` / `PAGO_DEUDA`: Campo **obligatorio** solo si `Pagador` es Jose o Caro. Si no, se oculta.

| Métodos disponibles (Jose y Caro) |
|-----------------------------------|
| Débito Jose |
| AMEX Jose |
| MasterCard Oro Jose |
| Débito Caro |
| Nu Caro |

> Ambos usuarios pueden seleccionar cualquier método (para pagos cruzados).

---

## 📁 Estructura del Frontend

```
registrar-movimiento/
├── index.html
├── styles.css
├── app.js
└── staticwebapp.config.json
```

---

## 📱 Responsiveness

- Layout mobile-first: 1 columna por defecto
- Grid de 2 columnas solo en `@media (min-width: 769px)`
- `font-size: 16px` en inputs/selects para evitar zoom en iOS
- Safe-area padding con `max(24px, env(safe-area-inset-*))` para notch/bordes

---

## 🔐 Autenticación

### En el Frontend

El API key se gestiona mediante **GitHub Secrets** para no exponerlo en el código fuente:

1. En `app.js` se usa un placeholder:
   ```javascript
   const X_API_KEY = "__X_API_KEY__";
   ```

2. El workflow de GitHub Actions reemplaza el placeholder antes del deploy:
   ```yaml
   - name: Replace API Key
     run: |
       sed -i 's/__X_API_KEY__/${{ secrets.N8N_API_KEY }}/g' registrar-movimiento/app.js
   ```

3. Todas las peticiones POST incluyen:
   ```http
   X-API-Key: <valor-del-secret>
   ```

### En n8n

- CORS debe permitir el header `X-API-Key` en `Access-Control-Allow-Headers`
- El webhook valida el header antes de procesar

---

## 🐛 Issues Conocidos / TODO

- [x] ~~Remover feature "Agregar nuevo usuario"~~
- [x] ~~Agregar dropdown de Categoría requerido~~
- [x] ~~Hacer Método de pago requerido si pagador es Jose o Caro~~
- [x] ~~Asegurar layout móvil limpio (una columna)~~
- [x] ~~Mover X_API_KEY a GitHub Secrets~~
- [x] ~~Ocultar pagador para tipo FAMILIAR~~
- [x] ~~Pagador + Tomador lado a lado para PAGO_DEUDA~~
- [ ] Evitar `undefined` en columnas: usar fallbacks como `categoria || ""`
- [ ] Mantener endpoints estables:
  - SWA: `/registrar-movimiento`
  - n8n: `/webhook/movimientos/reportar`

---

## 🤖 Instrucciones para Claude

- Hacer ediciones **mínimas y seguras**
- Mantener nombres, endpoints y auth header **exactamente como se especifican**
- Proveer cambios estilo patch o ediciones archivo por archivo
- **No introducir frameworks**; mantener vanilla HTML/CSS/JS
- Asegurar que CORS preflight funcione con `X-API-Key`
- **NUNCA** incluir el valor real del API key en el código; usar placeholder `__X_API_KEY__`
