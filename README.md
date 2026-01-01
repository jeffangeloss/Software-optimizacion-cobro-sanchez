# Helados Donofrio POS (PWA)

Aplicacion web instalable para gestionar pedidos, cierres/cobros y ajustes de sobras con control de errores, trazabilidad y operacion rapida en tablet o PC.

## Alcance funcional
- Pedido (manana) con reloj, buscador, navegacion por teclado y confirmacion con tabla completa.
- Cierre/Cobro (tarde) con captura de D.D., validaciones, confirmacion y reabrir boleta (Admin).
- Seleccion de vendedores con estado (verde = pedido guardado, rojo = sin pedido) y hora de registro.
- Ajuste inicial de sobras 31/12/2025 con PIN, columna de producto fija, encabezado fijo y limpieza por vendedor.
- Admin: productos, precios, vendedores, reportes y export CSV.
- Altas con codigo automatico V### y nuevos productos al final del catalogo.
- Boleta imprimible en ventana nueva.

## Flujo operativo
1) **Pedido (manana)**  
   Selecciona vendedor, revisa sobras de ayer y registra el pedido del dia.
2) **Cierre/Cobro (tarde)**  
   Ingresa D.D., valida montos y cierra como COBRADO o A CUENTA.
3) **Ajuste inicial 31/12/2025**  
   Carga sobras iniciales con PIN antes de iniciar operaciones.
4) **Admin**  
   Mantiene catalogo, precios, vendedores y reportes.

## Reglas de calculo
- `vendidas = pedido_hoy + sobras_ayer - sobras_hoy`
- `subtotal = vendidas * precio_usado`
- `total = suma(subtotales) + bateria`
- Si `sobras_hoy > sobras_ayer + pedido_hoy`, se solicita confirmacion y motivo.

## Continuidad y casos especiales (boleta pendiente)
- Si el vendedor no entrega D.D. el mismo dia, no se cierra la boleta.
- Al iniciar un nuevo dia, el sistema continua la boleta abierta del vendedor.
- Para sumar un nuevo pedido, agrega cantidades sobre las existentes.
- Cuando el vendedor entregue D.D., cierra la boleta con el monto recibido total
  (incluye pagos previos a cuenta).
- Si el vendedor no trabaja ni pide, no se genera boleta nueva.

## Roles y acceso
- OPERADOR: Pedido, Cierre/Cobro y historial basico del vendedor.
- ADMIN: todo lo anterior + productos, precios, vendedores, reportes y configuracion.
- PIN:
  - Jeff (ADMIN): `1414`
  - Papa/Mama (OPERADOR): `0000`
- Ajuste inicial de sobras: `INIT_LEFTOVERS_PIN` (default `1617`).

## Fotos de vendedores (opcional)
- Coloca las fotos en `public/vendors/<CODIGO>.jpg` o `public/vendors/<CODIGO>.png`.
- Ejemplo: `public/vendors/V003.jpg`.

## Instalacion rapida (npm)
```bash
npm install
cp .env.example .env.local
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

## Instalacion rapida (pnpm)
```bash
pnpm install
cp .env.example .env.local
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

En `.env.local` puedes ajustar `SESSION_SECRET`, `DATABASE_URL` e `INIT_LEFTOVERS_PIN`.

Abre `http://localhost:3000` y listo.

## Admin: precios y reportes
- Actualiza precios con fecha efectiva; solo aplican a boletas futuras.
- Reporte del dia incluye totales, bateria, boletas pagadas/deuda y top productos.
- Export CSV por rango de fechas.

## PWA y modo kiosko
- La app genera `manifest.json` y se puede instalar desde el navegador.
- SQLite es local, por lo que funciona offline de manera basica.

## Comandos utiles
```bash
npm run prisma:migrate
npm run prisma:seed
npm run dev
```
