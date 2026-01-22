# Migración Producción → Dev - 2026-01-25

## Contexto

La base de datos de desarrollo tenía 523 movimientos sin `category_id` debido a problemas con migraciones duplicadas (020 y 030).

## Proceso de Migración

1. **Backup de dev**: `/tmp/dev_backup_20260125_203856.sql`
2. **Drop completo** del esquema dev (tablas, secuencias, enums)
3. **Export de producción** (solo lectura): `pg_dump`
4. **Import a dev**: Todos los datos de producción

## Resultados

### Datos Migrados
| Tabla | Registros |
|-------|-----------|
| users | 2 |
| households | 1 |
| movements | 318 |
| categories | 28 |
| budgets | 56 |

### Estado de Categorías
- **305 movimientos** (96%) tienen category_id
- **13 movimientos** (4%) sin categoría (probablemente préstamos)

### Top 5 Categorías
1. Salidas juntos - 54 movimientos
2. Uber/Gasolina/Peajes/Parqueaderos - 45
3. Mercado - 37
4. Jose - Vida cotidiana - 34
5. Regalos - 20

## Errores Ignorados

Los siguientes errores son normales y no afectan:
- `ERROR: role "azure_pg_admin" does not exist`
- `ERROR: role "gastosadmin" does not exist`

Son errores de ownership/permisos que no existen en dev local.

## Verificación

✅ Todas las tablas creadas
✅ Datos importados correctamente
✅ Constraints y foreign keys funcionando
✅ Índices creados

## Próximos Pasos

1. Probar crear nuevo movimiento → verificar que tiene category_id
2. Probar filtro de categorías → debe funcionar sin "Cargando..."
3. Verificar que movimientos se muestran con sus nombres de categoría

## Post-Migration: Missing Migrations

### Problema Encontrado

Después de importar los datos de producción, el frontend mostraba errores 500:
```
ERROR: column m.generated_from_template_id does not exist
ERROR: relation "recurring_movement_templates" does not exist
```

### Causa

- **Producción** tiene migraciones hasta la **versión 29**
- **Dev** tenía código que esperaba **versión 33** (migraciones 031-033 de recurring movements)
- Al importar prod → dev, se sobrescribió schema_migrations con versión 29

### Solución

Ejecutadas las migraciones pendientes:
```bash
migrate -path ./migrations -database "$DB_URL" force 30
migrate -path ./migrations -database "$DB_URL" up
```

Aplicadas:
- **031**: create_recurring_movement_templates
- **032**: add_generated_from_template_id_to_movements
- **033**: create_recurring_movement_participants

### Resultado

✅ Base de datos dev ahora en versión **33**
✅ Tablas `recurring_movement_templates` y `recurring_movement_participants` creadas
✅ Columna `generated_from_template_id` añadida a `movements`
✅ Backend funciona correctamente

### Nota para Producción

Cuando se desplieguen las migraciones 031-033 a producción, será necesario:
1. Ejecutar las migraciones en prod
2. Desplegar el nuevo código del backend que usa estas tablas
