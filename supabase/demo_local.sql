-- ==========================================================
-- Local de demostración: "Licorería Demo" (Caracas)
-- Menú organizado por categorías con precios en USD tomados de
-- licoresmundiales.com (precio por botella suelta, oct. 2026) donde
-- había dato; el resto son referencias estimadas, y stock enlazado a cada producto
-- que se vende por unidad (así se descuenta solo al cobrar).
--
-- Reglas de la app que respeta:
--  · tipo 'suelto': precio_usd es el precio de una unidad.
--  · tipo 'combo' : precio_usd es el precio POR UNIDAD y
--                   unidades_combo cuántas trae (x12 a $0,85 = $10,20).
--  · Combos especiales: unidades_combo = 1 y precio_usd el del combo.
-- Se puede volver a correr: no duplica si el local ya existe.
-- ==========================================================
do $$
declare
  v_suc uuid;
begin
  if exists (select 1 from public.sucursales where nombre = 'Licorería Demo') then
    raise notice 'El local demo ya existe; no se hace nada.';
    return;
  end if;

  insert into public.sucursales (nombre, ciudad, direccion, app_nombre, activa)
  values ('Licorería Demo', 'Caracas', 'Av. Francisco de Miranda, Chacao', 'Bodega Demo', true)
  returning id into v_suc;

  -- nombre, categoria, tipo, precio_usd, unidades_combo, unidad, stock, minimo
  -- (stock null = no lleva inventario propio: tragos, copas y combos especiales)
  create temp table demo_items (
    nombre text, categoria text, tipo text, precio numeric, combo int, unidad text, stock numeric, minimo numeric
  ) on commit drop;

  insert into demo_items values
  -- Cerveza
  ('Polar Pilsen botella 220ml',        'Cerveza', 'suelto', 1.29, 1,  'tercio',  240, 72),
  ('Polar Light lata 355ml',           'Cerveza', 'suelto', 1.20, 1,  'lata',    144, 48),
  ('Solera Verde tercio 222ml',        'Cerveza', 'suelto', 1.00, 1,  'tercio',  120, 36),
  ('Solera Azul tercio 222ml',         'Cerveza', 'suelto', 1.10, 1,  'tercio',   96, 36),
  ('Zulia tercio 222ml',               'Cerveza', 'suelto', 1.10, 1,  'tercio',   48, 24),
  ('Regional Light lata 355ml',        'Cerveza', 'suelto', 1.00, 1,  'lata',     72, 24),
  ('Heineken botella 330ml',           'Cerveza', 'suelto', 2.00, 1,  'botella',  48, 24),
  ('Corona botella 355ml',             'Cerveza', 'suelto', 2.50, 1,  'botella',  18, 24),
  ('Tobo Polar Pilsen x12',            'Cerveza', 'combo',  1.20, 12, 'tercio',  null, null),
  ('Tobo Polar Light x12',             'Cerveza', 'combo',  1.10, 12, 'lata',    null, null),
  ('Tobo Solera Verde x12',            'Cerveza', 'combo',  0.95, 12, 'tercio',  null, null),
  -- Ron
  ('Ron Cacique 750ml',          'Ron', 'suelto',  11.00, 1, 'botella', 24, 6),
  ('Ron Carúpano 6',         'Ron', 'suelto', 7.00, 1, 'botella', 12, 4),
  ('Ron Santa Teresa Linaje 700ml','Ron','suelto', 16.90, 1, 'botella', 18, 6),
  ('Ron Roble Viejo Maestro 700ml','Ron', 'suelto', 19.90, 1, 'botella',  8, 4),
  ('Ron Pampero Aniversario 750ml',    'Ron', 'suelto', 23.00, 1, 'botella',  6, 3),
  ('Ron Diplomático Mantuano 700ml',   'Ron', 'suelto', 33.00, 1, 'botella',  6, 3),
  ('Ron Santa Teresa 1796 750ml',      'Ron', 'suelto', 32.00, 1, 'botella',  2, 3),
  ('Ron Diplomático Reserva Exclusiva 750ml','Ron','suelto',42.00,1,'botella', 4, 2),
  ('Trago de Ron Cacique',             'Ron', 'suelto',  2.00, 1, 'trago',  null, null),
  ('Tragos Ron Cacique x5',            'Ron', 'combo',   1.80, 5, 'trago',  null, null),
  -- Whisky
  ('Whisky Black & White 750ml',       'Whisky', 'suelto', 15.00, 1, 'botella', 12, 4),
  ('Whisky Something Special 750ml',   'Whisky', 'suelto', 24.50, 1, 'botella',  8, 3),
  ('Whisky Johnnie Walker Red 750ml',  'Whisky', 'suelto', 22.00, 1, 'botella', 10, 3),
  ('Whisky Old Parr 12 años 750ml',    'Whisky', 'suelto', 27.90, 1, 'botella',  6, 3),
  ('Whisky Buchanan''s 12 años 750ml', 'Whisky', 'suelto', 34.90, 1, 'botella',  6, 3),
  ('Whisky Chivas Regal 12 años 700ml','Whisky', 'suelto', 34.90, 1, 'botella',  1, 2),
  ('Whisky Johnnie Walker Black 750ml','Whisky', 'suelto', 28.90, 1, 'botella',  4, 2),
  ('Trago de Whisky Old Parr',         'Whisky', 'suelto',  4.50, 1, 'trago',  null, null),
  ('Tragos Old Parr x4',               'Whisky', 'combo',   4.00, 4, 'trago',  null, null),
  -- Vodka
  ('Vodka Gotland 750ml',              'Vodka', 'suelto',  6.00, 1, 'botella', 18, 6),
  ('Vodka Smirnoff 700ml',             'Vodka', 'suelto', 17.50, 1, 'botella', 10, 4),
  ('Vodka Absolut 1L',              'Vodka', 'suelto', 24.50, 1, 'botella',  6, 3),
  ('Trago de Vodka Smirnoff',          'Vodka', 'suelto',  2.00, 1, 'trago',  null, null),
  -- Ginebra
  ('Ginebra Gordon''s 700ml',          'Ginebra', 'suelto', 11.90, 1, 'botella', 6, 3),
  ('Ginebra Bombay Sapphire 750ml',    'Ginebra', 'suelto', 34.90, 1, 'botella', 4, 2),
  ('Gin tonic',                        'Ginebra', 'suelto',  4.00, 1, 'vaso',  null, null),
  -- Anís
  ('Anís Cartujo 1L',                  'Anís', 'suelto',  9.50, 1, 'botella', 12, 4),
  ('Cocuy Pecayero 750ml',             'Anís', 'suelto', 10.00, 1, 'botella',  6, 3),
  ('Trago de Anís Cartujo',            'Anís', 'suelto',  1.20, 1, 'trago',  null, null),
  -- Tequila
  ('Tequila José Cuervo Reposado 750ml','Tequila','suelto', 23.90, 1, 'botella', 6, 3),
  ('Tequila El Jimador Reposado 750ml',   'Tequila', 'suelto', 24.00, 1, 'botella', 4, 2),
  ('Trago de Tequila',                 'Tequila', 'suelto',  2.50, 1, 'trago',  null, null),
  ('Tragos de Tequila x4',             'Tequila', 'combo',   2.25, 4, 'trago',  null, null),
  -- Vino
  ('Vino Pomar Tinto Reserva 750ml',   'Vino', 'suelto', 10.00, 1, 'botella', 12, 4),
  ('Vino Gato Negro Cabernet 750ml',   'Vino', 'suelto',  8.00, 1, 'botella', 12, 4),
  ('Vino Casillero del Diablo 750ml',  'Vino', 'suelto', 14.00, 1, 'botella',  6, 3),
  ('Copa de vino tinto',               'Vino', 'suelto',  3.00, 1, 'copa',   null, null),
  -- Champán y espumantes
  ('Pomar Brut 750ml',                 'Champán', 'suelto', 12.00, 1, 'botella', 8, 3),
  ('Chandon Brut 750ml',               'Champán', 'suelto', 22.00, 1, 'botella', 4, 2),
  ('Moët & Chandon Brut Imperial 750ml',    'Champán', 'suelto', 99.50, 1, 'botella', 2, 1),
  -- Mezcladores
  ('Coca-Cola lata 355ml',             'Mezcladores', 'suelto', 1.00, 1, 'lata',    72, 24),
  ('Frescolita lata 355ml',            'Mezcladores', 'suelto', 1.00, 1, 'lata',    48, 24),
  ('Club soda 355ml',                  'Mezcladores', 'suelto', 1.00, 1, 'lata',    36, 12),
  ('Agua tónica 355ml',                'Mezcladores', 'suelto', 1.20, 1, 'lata',    24, 12),
  ('Agua Minalba 600ml',               'Mezcladores', 'suelto', 0.70, 1, 'botella', 48, 24),
  ('Maltín Polar 250ml',               'Mezcladores', 'suelto', 0.80, 1, 'botella', 10, 24),
  ('Red Bull 250ml',                   'Mezcladores', 'suelto', 3.00, 1, 'lata',    24, 12),
  ('Hielo bolsa 2kg',                  'Mezcladores', 'suelto', 1.50, 1, 'bolsa',   30, 10),
  -- Pasapalos
  ('Doritos 150g',                     'Pasapalos', 'suelto', 2.00, 1, 'bolsa', 20, 8),
  ('Pepito 80g',                       'Pasapalos', 'suelto', 1.00, 1, 'bolsa', 30, 10),
  ('Maní salado 100g',                 'Pasapalos', 'suelto', 1.50, 1, 'bolsa', 25, 10),
  ('Tostones de plátano 100g',         'Pasapalos', 'suelto', 1.50, 1, 'bolsa',  6, 10),
  -- Combos especiales (precio del combo completo)
  ('Combo Rumba: Cacique + 2 refrescos + hielo','Combos Especiales','combo', 13.50, 1, 'combo', null, null),
  ('Combo Pana: Black & White + 3 refrescos + hielo','Combos Especiales','combo', 18.50, 1, 'combo', null, null),
  ('Combo Celebración: Old Parr + 4 sodas + hielo','Combos Especiales','combo', 32.00, 1, 'combo', null, null),
  ('Combo Playero: tobo Polar x12 + hielo + pasapalo','Combos Especiales','combo', 15.50, 1, 'combo', null, null);

  with nuevos as (
    insert into public.menu (sucursal_id, nombre, tipo, precio_usd, unidades_combo, unidad, categoria, activo)
    select v_suc, nombre, tipo, precio, combo, unidad, categoria, true from demo_items
    returning id, nombre
  )
  insert into public.inventario (sucursal_id, menu_id, nombre, stock_actual, stock_minimo, unidad, por_caja, unidades_por_caja)
  select v_suc, n.id, d.nombre, d.stock, d.minimo,
         d.unidad,
         d.unidad in ('tercio', 'lata') and d.categoria = 'Cerveza',
         case when d.categoria <> 'Cerveza' then 1 when d.unidad = 'tercio' then 36 when d.unidad = 'lata' then 24 else 1 end
  from demo_items d join nuevos n on n.nombre = d.nombre
  where d.stock is not null;
end $$;
