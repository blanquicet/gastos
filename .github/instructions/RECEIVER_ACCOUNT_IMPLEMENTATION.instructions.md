# Implementación: Cuenta Receptora en Pagos de Préstamo

## Estado: ✅ COMPLETADO

## Problema
Cuando en un "Pago de préstamo" (DEBT_PAYMENT) el receptor es un miembro del household, no se podía especificar la **cuenta** (account) donde recibe el dinero. Esto es necesario porque el pago actúa como un ingreso para el receptor.

## Conceptos Clave

### Account vs Payment Method
- **Account (Cuenta)**: Donde el dinero VIVE (cuenta de ahorros, efectivo, cuenta corriente)
- **Payment Method (Método de Pago)**: Cómo GASTAS el dinero (tarjeta débito, tarjeta crédito, efectivo)

**Para ingresos:**
- ✅ Ingresos van A cuentas (accounts)
- ❌ Ingresos NO van a métodos de pago

**Para gastos:**
- ✅ Gastos se pagan CON métodos de pago
- ❌ Gastos NO se pagan con cuentas (indirectamente sí, a través de métodos de pago vinculados)

## Solución Implementada

### 1. Base de Datos
**Migración:** `024_add_receiver_account`

Se agregó la columna `receiver_account_id` a la tabla `movements`:
- **Tipo:** UUID (FK a `accounts`)
- **Nullable:** Sí (solo requerido para DEBT_PAYMENT cuando el receptor es miembro)
- **Índice:** Creado para optimizar consultas
- **Constraint:** ON DELETE RESTRICT

```sql
ALTER TABLE movements 
ADD COLUMN receiver_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT;

CREATE INDEX idx_movements_receiver_account 
ON movements(receiver_account_id) 
WHERE receiver_account_id IS NOT NULL;
```

### 2. Backend - Tipos (types.go)

#### Movement (struct)
Agregado:
```go
// Receiver account (only for DEBT_PAYMENT when counterparty is a household member)
// This represents where the income is received
ReceiverAccountID   *string `json:"receiver_account_id,omitempty"`
ReceiverAccountName *string `json:"receiver_account_name,omitempty"`
```

#### CreateMovementInput (struct)
Agregado:
```go
// Receiver account (optional for DEBT_PAYMENT when counterparty is a household member)
// Income is received in this account
ReceiverAccountID *string `json:"receiver_account_id,omitempty"`
```

#### UpdateMovementInput (struct)
Agregado:
```go
ReceiverAccountID *string `json:"receiver_account_id,omitempty"`
```

### 3. Backend - Repository (repository.go)

#### Create
- Actualizado INSERT para incluir `receiver_account_id`
- Actualizado RETURNING para recuperar el nuevo campo
- Actualizado Scan para leer el campo

#### GetByID
- Agregado JOIN con `accounts ra` para el nombre de la cuenta receptora
- Agregado campo en SELECT: `ra.name as receiver_account_name`
- Actualizado Scan para leer ambos campos (ID y nombre)

#### ListByHousehold
- Agregado mismo JOIN que GetByID
- Actualizado SELECT y Scan para incluir los nuevos campos

#### Update
- Agregado manejo de `ReceiverAccountID` en el UPDATE dinámico

### 4. Validación de Negocio (Pendiente)

**Cuándo es necesario:**
- Solo para movimientos tipo `DEBT_PAYMENT`
- Solo cuando el `counterparty` (receptor) es un `user_id` (miembro del household)
- No es necesario cuando el receptor es un `contact_id` (contacto externo)

**✅ Validación implementada en service.go:**

Validación en `Create()`:
```go
// Verify receiver account for DEBT_PAYMENT with household member receiver
if input.Type == TypeDebtPayment && input.CounterpartyUserID != nil {
    // Receiver account is required when counterparty is a household member
    if input.ReceiverAccountID == nil {
        return nil, errors.New("receiver_account_id is required for debt payment to household member")
    }

    // Verify account exists and belongs to household
    account, err := s.accountsRepo.GetByID(ctx, *input.ReceiverAccountID)
    if err != nil {
        if errors.Is(err, accounts.ErrAccountNotFound) {
            return nil, errors.New("receiver account not found")
        }
        return nil, err
    }
    if account.HouseholdID != householdID {
        return nil, ErrNotAuthorized
    }

    // Verify account type can receive income (only savings and cash)
    if !account.Type.CanReceiveIncome() {
        return nil, errors.New("receiver account must be of type savings or cash")
    }
}
```

**Nota:** No se valida que el owner de la cuenta coincida con el counterparty porque cualquier miembro del household puede usar cualquier cuenta del household (las cuentas se comparten entre miembros).

Similar validación implementada en `Update()` con manejo de valores existentes.

## Próximos Pasos

### Backend
1. ~~**Agregar validación en service.go**~~ ✅ COMPLETADO
2. ~~**Validar que la cuenta pertenezca al household**~~ ✅ COMPLETADO
3. ~~**Validar que el tipo de cuenta pueda recibir ingresos**~~ ✅ COMPLETADO
4. **Tests unitarios** (pendiente)

### Frontend
1. ~~**Actualizar formulario de DEBT_PAYMENT**~~ ✅ COMPLETADO
2. ~~**Condicionar visibilidad**~~ ✅ COMPLETADO
3. ~~**Filtrar cuentas**~~ ✅ COMPLETADO
4. **Actualizar tipos TypeScript** (si aplica)
5. **Actualizar vista de detalle** para mostrar la cuenta receptora

## Estado Actual

✅ **Completado:**
- Migración de base de datos aplicada en producción
- Tipos actualizados en backend (usando `receiver_account_id` en lugar de `receiver_payment_method_id`)
- Repository actualizado (Create, GetByID, ListByHousehold, Update)
- Backend compila correctamente
- Índices y constraints creados
- **Validación de negocio en service.go:**
  - Require receiver_account_id cuando DEBT_PAYMENT tiene counterparty_user_id
  - Valida que la cuenta exista y pertenezca al household
  - Valida que el tipo de cuenta sea 'savings' o 'cash' (usando CanReceiveIncome())
  - Advertencia en logs si el owner de la cuenta no coincide con counterparty
  - Validación implementada tanto en Create() como en Update()
- Frontend: Campo HTML agregado (cuentaReceptoraWrap)
- Frontend: Event listeners para tomador (receiver) implementados
- Frontend: Función onTomadorChange() para mostrar/ocultar campo
- Frontend: Función renderCuentaReceptoraSelect() para poblar cuentas filtradas
- Frontend: Payload building actualizado para incluir receiver_account_id
- Frontend: Control de visibilidad en onTipoChange()
- Frontend: Modo edición completado - carga receiver_account_id al editar

⏳ **Pendiente:**
- Tests end-to-end de la funcionalidad
- Tests unitarios
- Documentación de API

## Ejemplo de Uso

### Request para crear DEBT_PAYMENT con receptor miembro:
```json
{
  "type": "DEBT_PAYMENT",
  "description": "Pago préstamo personal",
  "amount": 500000,
  "movement_date": "2026-01-13",
  "payer_user_id": "user-123",
  "counterparty_user_id": "user-456",
  "payment_method_id": "pm-abc",
  "receiver_account_id": "account-xyz"
}
```

**Explicación:**
- `payer_user_id`: Jose paga
- `payment_method_id`: Jose paga CON su Débito Jose
- `counterparty_user_id`: Caro recibe
- `receiver_account_id`: Caro recibe EN su Cuenta de Ahorros Bancolombia

### Response:
```json
{
  "id": "mov-789",
  "type": "DEBT_PAYMENT",
  "payer_name": "Jose",
  "counterparty_name": "Caro",
  "payment_method_name": "Débito Jose",
  "receiver_account_name": "Cuenta de Ahorros Bancolombia",
  ...
}
```

## Notas Técnicas

1. El campo es **opcional** a nivel de base de datos para mantener compatibilidad con movimientos existentes
2. La validación de negocio se debe hacer en la capa de servicio
3. El JOIN es LEFT para no romper queries de movimientos antiguos sin este campo
4. El índice es parcial (WHERE NOT NULL) para optimizar espacio
5. Solo cuentas tipo `savings` y `cash` pueden recibir ingresos según el diseño de Phase 4

## Migración de Datos Existentes

No se requiere migración de datos. Los movimientos DEBT_PAYMENT existentes seguirán funcionando sin el campo. Se puede agregar opcionalmente en futuras ediciones.

## Corrección Importante

Esta implementación corrige un error inicial donde se había agregado `receiver_payment_method_id` en lugar de `receiver_account_id`. La diferencia es crítica:

- ❌ **Incorrecto:** `receiver_payment_method_id` - Los métodos de pago son para GASTOS, no ingresos
- ✅ **Correcto:** `receiver_account_id` - Las cuentas son donde el dinero VIVE y pueden recibir ingresos

Gracias por la corrección temprana antes de que se propagara al frontend.
