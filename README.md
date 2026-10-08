# IBIT to BTC

Conversor de cuotas de IBIT y CEDEAR de IBIT a Bitcoin, satoshis y su valor en moneda. Incluye un cálculo del costo equivalente por BTC a partir del precio promedio de compra.

| Versión | Dirección | Idioma | Unidades disponibles |
| --- | --- | --- | --- |
| Internacional | [ezevillo.com/ibit-to-btc/](https://ezevillo.com/ibit-to-btc/) | Inglés | IBIT, BTC, satoshis y USD |
| Argentina | [ezevillo.com/ibit-to-btc/ar/](https://ezevillo.com/ibit-to-btc/ar/) | Español argentino | CEDEAR, IBIT, BTC, satoshis, ARS, USD MEP y USD CCL |

El selector del encabezado navega entre esas URLs. Cada URL determina la versión, sin redirecciones por IP o idioma. Las cantidades y los costos permanecen en la página actual; la preferencia de tema se comparte en el mismo dominio.

La interfaz muestra las fuentes y fechas de los datos, los ajustes por redondeo y los avisos de antigüedad o problemas de actualización. Tiene temas claro, oscuro y de sistema, diseño responsive y navegación por teclado.

## Dominio y ruta de la aplicación

La configuración de publicación usa `https://ezevillo.com/ibit-to-btc/`. El dominio puede alojar una página principal y otros proyectos con rutas diferentes. El conversor usa estas variables:

```dotenv
SITE_URL=https://ezevillo.com
APP_BASE_PATH=/ibit-to-btc/
VITE_RATES_API_URL=https://ibit-rates-gateway.TU-SUBDOMINIO.workers.dev/ibit-to-btc/api/rates
```

Reemplazar `TU-SUBDOMINIO` por el subdominio del Worker desplegado. Las credenciales privadas se configuran por separado, siguiendo [.env.example](.env.example) y [la guía de despliegue](docs/gateway-deployment.md).

`SITE_URL` es el origen público HTTPS, sin ruta. `APP_BASE_PATH` es una ruta local y se normaliza con barras inicial y final; por ejemplo `/tools/converter/`. Su valor predeterminado es `/ibit-to-btc/`; `/` permite publicar en la raíz. Se rechazan URLs externas, segmentos `..`, parámetros y caracteres que puedan escapar del directorio de publicación. El frontend usa la base que incorpora Vite al build; las variables no se leen dinámicamente en el navegador. Cambiar el dominio o la ruta requiere un build y despliegue nuevos.

Para desarrollo, copiar `.env.example` a `.env`. En Netlify, `SITE_URL`, `APP_BASE_PATH` y `VITE_RATES_API_URL` son variables de build. `FINNHUB_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` y `CLOUDFLARE_KV_API_TOKEN` son variables de la función privada; no hacen falta durante el build. El Worker público no recibe credenciales de Finnhub ni de la API de administración de Cloudflare. Los archivos `.env`, el estado local de Wrangler y los snapshots de desarrollo se ignoran en Git.

El build coloca los archivos estáticos en `dist/ibit-to-btc/` (o la ruta elegida), dejando `dist/` como directorio de publicación. Genera `dist/_redirects` solo para las URLs sin barra final y `dist/_headers` para CSP, caché de assets e indexación de previews. El navegador consulta `VITE_RATES_API_URL` directamente en Cloudflare; la CSP permite exactamente su origen. No existe una API pública de cotizaciones en Netlify. El sitemap se publica en `/ibit-to-btc/sitemap.xml`.

### Varios proyectos con repositorios independientes

El sitio principal de Netlify se vincula a `ezevillo.com`. Este conversor se despliega como otro sitio del mismo equipo, con las variables anteriores. Copiar las reglas de [hosting/netlify-hub.example.toml](hosting/netlify-hub.example.toml) al `netlify.toml` del sitio principal y reemplazar el nombre de sitio de ejemplo por el subdominio real del conversor. Las reglas mantienen `/ibit-to-btc/` en ambos sitios y usan rewrites `200`, por lo que el navegador conserva `ezevillo.com`. Eliminar cualquier regla anterior que apunte a `/.netlify/functions/rates`; tampoco agregar un proxy hacia el gateway: las consultas deben ir directamente a Cloudflare. Las reglas de cada proyecto deben ir antes de cualquier regla general del sitio principal. Si se cambia la ruta, actualizar también `APP_BASE_PATH` del gateway.

El `robots.txt` del sitio principal debe incluir `Sitemap: https://ezevillo.com/ibit-to-btc/sitemap.xml`, además de los sitemaps de otros proyectos. El dominio, los DNS y las reglas del sitio principal se configuran en el hosting. La plantilla de este repositorio permite servir el conversor bajo la misma ruta del dominio principal.

## Cotización internacional y configuración de producción

El precio estadounidense de IBIT se consulta en la API documentada de Finnhub: `GET https://finnhub.io/api/v1/quote?symbol=IBIT`. El campo `c` contiene el precio por cuota; `t` contiene el timestamp del proveedor. Se conservan por separado la fecha de cotización y la hora de consulta. No se deriva el precio del CEDEAR, del NAV ni de Bitcoin spot. La interfaz muestra la fuente, la fecha en UTC y la actualización de 15 minutos; no promete tiempo real.

1. Crear una clave en [Finnhub](https://finnhub.io/dashboard) con acceso a la cotización de IBIT y un plan adecuado para publicar los datos en una web pública.
2. Para desarrollo, copiar `.env.example` a `.env`, configurar `FINNHUB_API_KEY` y ejecutar `npm run refresh:local` una vez. El servidor de desarrollo solo lee `work/rates-snapshot.json`; abrir la página o reintentar nunca consulta fuentes. **Nunca usar `VITE_FINNHUB_API_KEY` ni poner una clave en el código, HTML, navegador o URL pública.** La autenticación viaja en el header privado `X-Finnhub-Token`.
3. Configurar `SITE_URL=https://ezevillo.com` y `APP_BASE_PATH=/ibit-to-btc/`. En un despliegue independiente sin dominio principal se puede omitir `SITE_URL` para usar la variable automática `URL` de Netlify. Si se sirve bajo el sitio principal, configurar explícitamente el origen público para que el SEO apunte a `ezevillo.com`.
4. Configurar y desplegar el gateway, cargar el primer snapshot y configurar la tarea privada siguiendo [la guía de despliegue](docs/gateway-deployment.md). `npm run refresh:cloudflare` es una carga manual explícita, no un endpoint público.
5. Ejecutar `npm run check:production` para verificar ambos mercados a través del gateway. El comando no consulta proveedores ni necesita sus credenciales: valida el snapshot, las cotizaciones, sus horas de actualización y la antigüedad del informe/cotización estadounidense.
6. Ejecutar `npm run verify` y publicar el frontend junto con `netlify/functions/refresh-rates.ts`. El build de producción valida que la URL del gateway sea HTTPS y no sea un proxy de Netlify; no consume Finnhub ni depende de la disponibilidad de los proveedores.

`npm run build` genera HTML propio para la raíz de la aplicación y su subruta `ar/`, incluyendo idioma, título, descripción y mensaje sin JavaScript. Con un dominio configurado genera canonical por página, alternates `en`, `es-AR` y `x-default`, sitemap y robots. Los Deploy Previews de Netlify llevan `noindex`.

El gateway admite `GET /ibit-to-btc/api/rates?market=global` y `?market=ar`, con el prefijo configurable. Omitir `market` equivale a `ar`; otros parámetros, mercados duplicados y métodos de actualización se rechazan. Las respuestas se cachean por mercado, pero un único Durable Object privado coordina la lectura del snapshot de ambos mercados: 100 solicitudes simultáneas sin caché comparten una sola lectura de KV. La consulta internacional no depende del éxito de Comafi o Data912. Si nunca hubo una cotización USD válida se deshabilita esa conversión; si hubo una y su actualización falla se conserva con su timestamp original y un aviso de antigüedad. No se inventan precios ni se actualizan sus fechas al reutilizarlos.

```text
BTC_por_IBIT = BTC_del_fondo / cuotas_en_circulación
Desde USD:
IBIT_teóricos = USD / precio_IBIT_USD
IBIT_utilizados = redondear al entero más cercano (0,5 hacia arriba)
BTC = IBIT_utilizados × BTC_por_IBIT
sats = BTC × 100000000
USD_utilizados = IBIT_utilizados × precio_IBIT_USD
Ajuste = USD_utilizados - USD_ingresados
```

Desde USD, todos los resultados usan las cuotas enteras y se muestra cuánto sobra o falta cuando hay un ajuste. IBIT también se ingresa en unidades enteras en la internacional. Las equivalencias fraccionarias obtenidas desde BTC/sats son teóricas; al elegir IBIT como origen, se redondea al entero más cercano, se explica y se recalcula. En Argentina se mantienen las entradas fraccionarias de IBIT y el redondeo de monedas a CEDEAR enteros.

La internacional usa punto decimal en USD y precio promedio; Argentina usa coma. Las entradas siguen sin permitir separadores de miles. Los resultados sí agrupan según cada versión (`1,234.50` / `1.234,50`). **BTC usa siempre punto decimal y ocho decimales; sats sigue sin agrupación y sin decimales.** Ambas versiones conservan el guard de escritura/pegado, límites y precisión de Decimal.js.

## Regla obligatoria de traducciones

`src/messages.json` es el catálogo común, con cada mensaje en español e inglés, incluyendo metodología, ayudas, errores, metadatos, accesibilidad y WebMCP. Los textos específicos de cada mercado también tienen las dos traducciones y se muestran solo cuando corresponden.

`src/translations.lock.json` registra los hashes de los dos textos revisados. `npm run i18n:check`, incluido en el build, bloquea traducciones nuevas, eliminadas o desactualizadas, textos vacíos y parámetros diferentes. Para cambiar un mensaje existente hay que **actualizar ambos idiomas y revisar su equivalencia**, luego ejecutar `npm run i18n:review`; ese comando rechaza una modificación en un solo idioma. El control verifica integridad y actualización, no puede juzgar automáticamente la calidad semántica de una traducción.

## Comportamiento de la versión argentina

Conversor de **CEDEAR de IBIT ↔ cuotas de IBIT ↔ BTC ↔ satoshis ↔ ARS ↔ USD MEP ↔ USD CCL**. Una cantidad editable y seis resultados. Bitcoin puede expresarse en BTC o en satoshis (sats).

También permite agregar un precio promedio de compra y calcular su equivalente por BTC, en la moneda ingresada.

## Ejecutar

Usar Node.js 24, la versión configurada para el build de Netlify.

```sh
git clone https://github.com/EzeVillo/ibit-to-btc.git
cd ibit-to-btc
npm ci
cp .env.example .env
```

Configurar `FINNHUB_API_KEY` en `.env` con una clave de [Finnhub](https://finnhub.io/dashboard) que tenga acceso a IBIT. Para usar los datos locales, dejar `VITE_RATES_API_URL` vacío. Luego:

```sh
npm run refresh:local
npm run dev
```

Abrir `http://127.0.0.1:5173/ibit-to-btc/` (o la ruta configurada en `APP_BASE_PATH`). Con `VITE_RATES_API_URL` vacío se usa el snapshot local. Volver a ejecutar `npm run refresh:local` cuando se quieran actualizar sus datos. Sin un snapshot inicial, la API local responde `503`; no se utilizan fixtures ni se consultan proveedores como fallback.

```sh
npm run verify
npm run build
npm run preview
```

`npm run verify` ejecuta los tests, verifica traducciones y TypeScript, genera el build y prueba el gateway en el runtime de Cloudflare. `npm run build` permite regenerar solo el frontend; `npm run preview` lo sirve en `http://127.0.0.1:4173/ibit-to-btc/`.

## Referencias y fórmulas

- Ratio CEDEAR/IBIT: programa de Banco Comafi, consultado automáticamente.
- BTC por cuota: BTC del fondo / cuotas en circulación. Ambos salen del mismo CSV fechado de iShares; no se mezclan días.
- Satoshis: 1 BTC = 100000000 sats. Se calculan directamente desde BTC, sin consultar otra cotización.
- ARS: último precio de referencia de la especie **IBIT** (CEDEAR en pesos).
- USD MEP: último precio de referencia de **IBITD** (el CEDEAR con liquidación en dólares locales). Internamente corresponde a `asset: usd` y `cedearUsd`.
- USD CCL: último precio de referencia de **IBITC** (el CEDEAR con liquidación en dólares cable). Corresponde a `asset: usd_ccl` y `cedearUsdCcl`.
- Cotizaciones locales: API pública de Data912. Es un proveedor de datos de referencia, sin garantía de tiempo real ni fecha/hora de la última operación. La UI lo indica y no presenta la hora de consulta como hora de mercado.

«¿Cómo se calcula?» explica que las operaciones de IBIT en bolsa transfieren cuotas entre compradores y vendedores, mientras que la creación y el rescate cambian tanto los activos del fondo como las cuotas en circulación. Las entradas de dinero no aumentan por sí mismas los BTC por cuota. Los BTC y sats por cuota tienden a disminuir gradualmente por las comisiones y gastos del fondo; los sats por CEDEAR siguen esa variación según el ratio CEDEAR/IBIT. La equivalencia se toma del informe disponible y el precio de mercado de IBIT puede tener una prima o descuento respecto de sus activos.

Todo se convierte mediante una cantidad equivalente de CEDEAR:

```text
CEDEAR = IBIT × ratio
CEDEAR = BTC / BTC_por_IBIT × ratio
CEDEAR = (sats / 100000000) / BTC_por_IBIT × ratio
CEDEAR = ARS / precio_IBIT_ARS
CEDEAR = USD_MEP / precio_IBITD_USD
CEDEAR = USD_CCL / precio_IBITC_USD

Si el origen es ARS, USD MEP o USD CCL:
CEDEAR_utilizados = redondear CEDEAR al entero más cercano (0,5 hacia arriba)
Los demás resultados usan CEDEAR_utilizados.

IBIT = CEDEAR / ratio
BTC = IBIT × BTC_por_IBIT
sats = BTC × 100000000
ARS = CEDEAR × precio_IBIT_ARS
USD_MEP = CEDEAR × precio_IBITD_USD
USD_CCL = CEDEAR × precio_IBITC_USD
```

Se usa el precio del CEDEAR en cada especie, sin consultar un tipo de cambio genérico ni BTC spot. Los montos valúan CEDEAR y no incluyen comisiones ni spread. Desde ARS, USD MEP o USD CCL, se divide el monto por el precio de la especie elegida y luego se redondea la cantidad de CEDEAR a unidades enteras. El redondeo es sobre la fracción de CEDEAR, no sobre los centavos del monto ingresado. Cuando hay un ajuste, la UI muestra las unidades utilizadas, su valor y cuánto sobra o falta en la moneda de origen. La regla de redondeo se explica en «¿Cómo se calcula?». Desde CEDEAR, IBIT, BTC o satoshis se mantienen las equivalencias fraccionarias, identificadas como teóricas.

## Arquitectura

- Frontend: Vite + TypeScript, HTML semántico y CSS. Tipografías alojadas con la aplicación.
- Cálculos: Decimal.js con 50 dígitos de precisión. Desde monedas, el redondeo a IBIT enteros en la internacional o CEDEAR enteros en Argentina afecta todos los resultados. El redondeo visual restante solo afecta su presentación.
- Actualización privada: `netlify/functions/refresh-rates.ts`, cada 15 minutos, sin URL pública. Consulta Finnhub, iShares, Comafi y Data912 una vez cada uno, sin reintentos automáticos. El CSV de iShares se comparte entre mercados.
- Datos: un snapshot validado de ambos mercados en Cloudflare KV, conservando los últimos valores válidos y sus fechas.
- API pública: Worker de Cloudflare, caché de respuestas de 30 segundos, parámetros normalizados y límite de 60 solicitudes por minuto por IP y ubicación de Cloudflare. CORS restringe navegadores al origen configurado, pero no autentica bots o clientes sin `Origin`.
- Coordinación: un Durable Object con SQLite, compatible con Workers Free, une las lecturas simultáneas de KV entre todas las instancias y regiones. Su caché persiste entre reinicios; ante fallos de KV se espera un minuto antes de intentar otra lectura y se conserva el snapshot válido anterior.
- Actualización al abrir, cada 15 minutos mientras la página está visible y al volver a la pestaña si corresponde. Botón de reintento.
- Si falla una cotización monetaria, las conversiones entre los activos siguen funcionando. Si falla una fuente esencial, se muestra un error explícito. No se incorporan ratios de ejemplo como respaldo silencioso.
- Si falla una actualización después de cargar datos, se mantienen los datos ya visibles indicando que la actualización falló.
- La interfaz distingue navegador sin conexión, problemas de conexión, timeout, errores del servidor, fuentes esenciales no disponibles y respuestas inválidas. Indica si se puede continuar con los últimos datos o si hay que esperar a la primera carga; los avisos de informes/cotizaciones antiguos permanecen visibles tras un error.
- Si desaparece la cotización de la moneda seleccionada, conserva el importe y muestra junto al campo cómo reintentar o elegir otro origen disponible e ingresar una nueva cantidad. No cambia la unidad del importe automáticamente. El aviso desaparece cuando se recupera la cotización o se elige un origen disponible.
- Las visitas, los reintentos del navegador y los vencimientos de caché solo leen datos guardados. Nunca disparan actualizaciones ni llamadas a Netlify o a proveedores. La propagación de KV y los TTL pueden retrasar la visibilidad de un snapshot nuevo; la interfaz conserva las fechas y avisa si una actualización lleva más de 30 minutos sin confirmarse.
- Las cantidades ingresadas permanecen en memoria del navegador. El almacenamiento del servidor contiene solo datos públicos de mercado, sin cantidades, precios personales, cookies, cuentas ni analítica. Solo se guarda la preferencia manual de tema en localStorage.

## Precio promedio de compra

El bloque independiente de costo equivalente por BTC, debajo del conversor, muestra siempre la entrada del precio promedio y su resultado:

- **Internacional:** costo en USD por cuota para los orígenes IBIT y USD, o por BTC para BTC y satoshis.
- **Argentina:** costo por CEDEAR para los orígenes CEDEAR, ARS, USD MEP y USD CCL; por cuota para IBIT; y por BTC para BTC y satoshis. El selector de moneda admite ARS, USD MEP y USD CCL. Al elegir un origen monetario, se selecciona inicialmente esa misma moneda.

Cambiar entre activos adapta la unidad del promedio; cambiar de moneda en Argentina recupera un borrador independiente y no convierte costos históricos con tipos de cambio actuales.

```text
BTC_por_CEDEAR = BTC_por_IBIT / ratio
Costo_por_BTC = Costo_por_CEDEAR / BTC_por_CEDEAR
Costo_por_BTC = Costo_por_IBIT / BTC_por_IBIT
```

El bloque muestra únicamente el costo por 1 BTC, en la moneda ingresada. Los resultados usan la equivalencia del informe fechado de IBIT, y no las cotizaciones monetarias ni la cantidad ingresada. La fecha del informe aparece junto al costo por BTC. Para un precio promedio ingresado por CEDEAR o cuota de IBIT, se usa el informe más reciente disponible para expresar el costo por BTC de exposición actual. Si cada CEDEAR o cuota pasa a representar menos BTC por las comisiones y gastos del fondo, el costo equivalente por BTC aumenta aunque no haya nuevas compras; el precio promedio de compra sigue siendo el mismo. El monto principal continúa convirtiéndose a cotizaciones actuales. El cálculo de costo no reconstruye el precio de BTC ni el dólar en las fechas de compra. Para eso se necesitaría el historial de operaciones.

Para un costo ingresado por CEDEAR o IBIT, el resultado expresa el costo por BTC de exposición con ese informe. La metodología aclara que es una referencia y no un precio exacto de BTC para recuperar la inversión: también influyen la prima o descuento de IBIT, la cotización local del CEDEAR, la moneda y los costos de compra y venta.

Todos los importes fiat se ingresan y muestran con un máximo de dos decimales, incluido el precio promedio aunque se exprese por BTC. El promedio acepta punto decimal en la internacional y coma en Argentina. Cada borrador conserva su valor y unidad originales; cambiar de origen o actualizar el informe no acumula redondeos. Al editar un promedio adaptado se adopta el nuevo valor y unidad. La presentación avisa cuando redondea a dos decimales. Las comisiones solo se incluyen si forman parte del precio ingresado. El botón de limpieza elimina la cantidad y todos los promedios; el bloque permanece visible y vuelve a pedir el precio promedio. Los costos permanecen en memoria del navegador y no se envían a la API ni se guardan en almacenamiento persistente.

## Despliegue

El despliegue usa Netlify para el frontend y la tarea privada de actualización, y Cloudflare para el gateway, KV y el Durable Object. [La guía de despliegue](docs/gateway-deployment.md) detalla la configuración de cuentas, credenciales, almacenamiento, gateway y actualización programada.

Para instalar esta versión en producción:

1. Crear el namespace de KV y reemplazar `REPLACE_WITH_KV_NAMESPACE_ID` en `gateway/wrangler.jsonc`.
2. Configurar el origen permitido y la ruta del gateway, ejecutar `npm run gateway:test` y desplegar con `npm run gateway:deploy`.
3. Configurar las credenciales privadas y `VITE_RATES_API_URL` con la URL HTTPS del gateway, cargar el snapshot inicial con `npm run refresh:cloudflare` y verificarlo con `npm run check:production`.
4. Conectar este repositorio a Netlify y configurar las variables de build y de la función privada. `netlify.toml` ejecuta `npm run verify` y publica `dist/`. La función `refresh-rates` declara una ejecución cada 15 minutos; verificar en Netlify que figure como **Scheduled**.
5. Aplicar las reglas del sitio principal cuando se sirva bajo `ezevillo.com/ibit-to-btc/` y verificar el acceso a ambas versiones y las fechas de sus datos.

El frontend se genera en `dist/`, bajo la ruta configurada. El navegador consulta directamente el gateway de Cloudflare. El build verifica la configuración de producción cuando `CONTEXT=production`; no consulta proveedores. `npm run check:production` verifica ambos mercados mediante el gateway desplegado y requiere cotizaciones recientes. El servidor de Vite sirve para desarrollo o revisión local.

Las fuentes deben ser accesibles desde la región del hosting. Las cotizaciones de Data912 son de referencia; el proveedor se aísla en `server/sources.ts` para permitir su sustitución.

## Entrada y UX

- Los cuatro orígenes de la internacional y los siete de Argentina se eligen con tarjetas en desktop y un select nativo en mobile, conservando las mismas opciones, descripciones y reglas de conversión. En mobile, las equivalencias aparecen juntas debajo de la cantidad, sin destacar una en particular; la explicación del origen queda después de los resultados. Un único campo editable evita recalcular mientras el usuario escribe en varias entradas.
- Cada resultado ofrece “Usar como origen”. Al pasar a ARS, USD MEP o USD CCL, se aplica el redondeo a CEDEAR enteros y se muestra el ajuste solo si cambia la cantidad: cuando la equivalencia ya es entera, incluido cero, no aparece el aviso. Al salir de una moneda, se conserva la cantidad de CEDEAR ya redondeada. Al elegir BTC, las equivalencias se redondean a ocho decimales, se explica el ajuste y los resultados se recalculan con el valor visible. Una equivalencia superior a 21.000.000 BTC no se utiliza como entrada y muestra un error.
- El umbral de 0,5 se evalúa con precisión decimal. Los montos menores a medio CEDEAR redondean a cero y muestran el sobrante; redondear hacia arriba puede requerir dinero adicional, que se indica en la moneda de origen.
- Internacional: IBIT entero y USD con punto decimal. Argentina: CEDEAR entero; IBIT, ARS, USD MEP y USD CCL con coma decimal. BTC usa punto decimal tanto en la entrada como en los resultados, sin agrupación de miles, en ambas versiones.
- La cantidad y el precio promedio validan el valor completo al escribir o pegar, considerando el texto seleccionado. Bloquean letras, signos, símbolos, negativos, notación científica, espacios internos, separadores incorrectos o repetidos, exceso de decimales y valores que superan el máximo. Cada rechazo conserva el valor anterior y muestra un mensaje específico; no se extraen dígitos ni se redondea una entrada inválida. Los espacios exteriores de un número pegado se recortan; pegar solo espacios no borra la selección. Los dos campos comparten las reglas de formato con sus funciones de validación.
- Se puede borrar el campo o empezar una fracción con el separador permitido, sin mostrar errores por un número todavía incompleto. Autocompletado, arrastre, teclados que omiten `beforeinput` y cambios de historial se comprueban también en `input`; una entrada inválida se revierte junto con su selección. La composición de texto se valida al terminar. Las herramientas del navegador mantienen una validación estricta.
- Los avisos de entrada bloqueada desaparecen después de 5 segundos. Un nuevo intento inválido reinicia ese plazo; editar correctamente, cambiar de origen o moneda y limpiar el campo los oculta de inmediato.
- Al cambiar desde una equivalencia fraccionaria al origen CEDEAR, se redondea a unidades enteras y se explica el ajuste junto a los resultados. Así la entrada nunca se completa con una fracción que no admite.
- Entrada BTC: punto decimal, hasta ocho decimales (también se cuentan los ceros finales) y un máximo total de 21.000.000 BTC. Se aceptan cero y un satoshi (`0.00000001`); se rechazan negativos, valores fuera del rango y formatos inválidos, también desde la herramienta del navegador. Los otros orígenes conservan sus límites.
- Satoshis: entrada solo de dígitos, sin comas, puntos ni decimales; máximo `2100000000000000` sats, equivalente al límite de BTC. Los resultados también se muestran sin agrupación ni decimales, con indicador de aproximación si se redondean. La precisión interna se conserva; al elegir “Usar como origen”, se redondea al entero más cercano (0,5 hacia arriba), se explica el ajuste y se recalcula con la entrada visible. Una equivalencia superior al máximo no se utiliza como entrada. Las equivalencias positivas que redondearían a cero muestran `< 1`.
- Resultados BTC: ocho decimales, con indicador de aproximación; las equivalencias teóricas conservan su precisión interna y las cantidades positivas menores a la unidad visible se muestran con `<` en lugar de ocultarse como cero.
- Radios nativos con navegación por teclado, foco visible, errores vinculados al campo y anuncio de resultados para lectores de pantalla.
- Diseño responsive y respeto por la preferencia de movimiento reducido.
- Selector de tema en el encabezado: Sistema (predeterminado), Claro y Oscuro. Sistema sigue la preferencia del sistema o del navegador (`prefers-color-scheme`) y se adapta al cambiarla con la página abierta. La elección manual se recuerda en el navegador y se restaura antes de cargar la aplicación. También se adaptan los controles nativos y el color de la interfaz del navegador cuando lo admite. Volver a Sistema elimina la preferencia guardada. Si el navegador bloquea el almacenamiento, el selector sigue funcionando durante la visita.
