# HydraCode — Resumen de cambios y guía de pruebas

Este documento resume todo lo revisado y corregido en esta sesión: una auditoría completa de errores (código estático + pruebas en vivo) y varias mejoras funcionales pedidas durante la sesión. Todo está verificado con `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (43/43) y `npm run build` en verde.

---

## 1. Bugs de compilación/transpilación

- **Palabras en español dentro de strings o comentarios ya no se traducían mal.** Antes, `"es para probar"` podía volverse `"is for probar"`. Ahora el transpilador distingue código real de texto literal.
- **6 de 12 patrones matemáticos de Java rotos** (`potencia`, `raiz`, `maximo`, `minimo`, `piso`, `techo`) — una `\b` de más en la expresión regular hacía que nunca matchearan. `Math.pow`/`Math.sqrt`/etc. ahora se generan bien.
- **`matematicas.abs`** usaba una sintaxis distinta a sus hermanos (`matematicas.abs.x` en vez de `matematicas.abs.(x)`); unificado.
- **`nulo` estaba definido dos veces** (como tipo `Void` y como literal `null`); el literal siempre ganaba, dejando `Void` inalcanzable y produciendo Java inválido si se usaba como tipo. Ahora solo existe como literal.
- **C++ no heredaba las palabras clave de C** (`ir_a`, `auto`, `registrar` no funcionaban en modo C++). Ahora C++ deriva su mapeo de C.
- **El JSON de ejemplo `java-es.json`** (el que se instala desde el panel de Extensiones) estaba desincronizado del código fuente real — al instalarlo, corrompía identificadores del usuario (p. ej. `subsistema` → `subSystem`). Corregido y sincronizado.
- **`principal` no mapeaba a `main`** en Java/C/C++ — el propio ejemplo de bienvenida de la app generaba código sin punto de entrada válido. Agregado en los 3 lenguajes.

## 2. Bugs de infraestructura interna (no visibles directamente, pero afectaban estabilidad)

- Copy-paste bug en el sistema de grid (`maximumWidth` devolvía `maximumHeight`).
- Conflictos de atajos de teclado se resolvían por orden de registro, no por especificidad/peso.
- `localize()` nunca sustituía `{0}`/`{1}` en mensajes de error del parser de `when`-clauses.
- `Delayer.cancel()` dejaba promesas colgadas para siempre en vez de rechazarlas.
- Fugas de memoria en varios listeners de `document` (dropdowns del menú, resize handles) que nunca se limpiaban.

## 3. Bugs de interfaz (encontrados en la revisión inicial)

- El sidebar se desincronizaba del botón "Toggle Sidebar" del menú (había que hacer doble clic).
- El overlay "Ir a archivo" se cerraba solo al hacer clic en su propio campo de búsqueda.
- El ícono de la activity bar se quedaba "activo" visualmente después de colapsar su sección.
- Tamaños mínimos de layout hardcodeados que no coincidían con lo declarado por cada parte.

## 4. Bugs de extensiones / voz / ejecución (revisión inicial)

- Grabaciones de voz dobles si se hacía doble clic rápido en el botón de micrófono.
- El panel de extensiones se recreaba sin limpiar listeners anteriores (fuga de memoria al navegar).
- Se elegía la gramática de sintaxis incorrecta para C++ (una parcial en vez de la completa).
- JSON de mapeo importado sin validar — podía corromper silenciosamente literales numéricos del código.
- Desinstalar el lenguaje del tab activo dejaba el editor, el transpilador y el panel de ejecución en 3 estados contradictorios entre sí.
- Errores de guardado de extensiones se ignoraban silenciosamente.

## 5. Bugs encontrados probando la app en vivo (no visibles solo leyendo código)

- **El menú File/Edit/etc. se veía tapado por el resto de la interfaz.** Causa: el desplegable vivía anidado dentro de la barra de título, y su `z-index` no lograba pintarse por encima de las partes hermanas del layout (sidebar/editor). Solución: el menú ahora se renderiza como "portal" directamente en `<body>`.
- **"Nuevo archivo" no hacía nada** si se usaba desde la pantalla de bienvenida (no había ningún editor Monaco montado todavía). Ahora crea una pestaña real.
- **"Abrir archivo..."** tenía el mismo problema — sobreescribía el editor activo en vez de abrir una pestaña nueva.
- **Guardar guardaba en la ruta equivocada** con varias pestañas abiertas — la ruta del archivo activo se guardaba en un solo campo global compartido, no por pestaña.
- **El divisor para redimensionar el panel inferior (terminal/output) nunca aparecía**, aunque el panel sí se mostraba — `showPanel()` intentaba mostrarlo con `style.display = ''`, pero el CSS por defecto de esa clase es `display: none`, así que limpiar el estilo inline solo revelaba ese `none` de nuevo.

---

## 6. Funcionalidades nuevas (pedidas durante la sesión)

### Layout redimensionable
- Nuevo divisor arrastrable entre el sidebar y el editor (antes el sidebar tenía ancho fijo al 20% de la ventana).
- Corregido el divisor del panel inferior para que realmente aparezca (ver bug arriba).

### Terminal interactiva de verdad
- La terminal usaba `child_process.spawn` sin PTY — no soportaba programas interactivos (vim, prompts de contraseña, autocompletado, etc.).
- Ahora usa **`node-pty`** (PTY real vía ConPTY en Windows). Se agregó como dependencia nueva; no requirió compilación porque trae binarios precompilados para `win32-x64`.

### Compatibilidad multilenguaje ampliada
- La tabla de inferencia de lenguaje para el marketplace de extensiones ahora cubre ~78 lenguajes (todos los que Monaco soporta de fábrica), no solo ~20.
- **Bug corregido de paso:** instalar un lenguaje desde el marketplace nunca asociaba extensiones de archivo — abrir un `.go` después de "instalar" Go nunca lo detectaba como Go. Ahora sí.

### Ejecución de más lenguajes
- Antes solo se podía "ejecutar" Java, Python, C y C++.
- Agregado: **JavaScript** (Node.js), **TypeScript** (soporte nativo de Node 24, sin `tsc`), **Go** (`go run`), **Rust**, **Ruby**, **PHP** (estos 3 últimos con manejo de "no instalado", igual que ya existía para Java/C, pero sin poder probarlos en esta máquina).
- Corregido un problema estructural: el motor de ejecución intentaba transpilar como si todo fuera español, incluso lenguajes sin mapeo registrado. Ahora salta ese paso cuando no aplica.

### C/C++ ahora corre en una terminal real
- Antes, ejecutar C/C++ mandaba la salida a un panel de solo lectura — un programa con `scanf`/`cin` se quedaba colgado esperando una entrada imposible de dar.
- Ahora el botón Run para C/C++ compila y ejecuta directamente en la pestaña TERMINAL (con PTY real), totalmente interactivo.

### Panel "Run and Debug" rediseñado
- Antes: dos botones iguales (Run/Debug) + Stop deshabilitado.
- Ahora: un botón principal grande ("Run and Debug"), la opción de depuración como enlace secundario discreto, y una vista compacta tipo toolbar (spinner + estado + Detener) mientras algo corre — inspirado en la vista real de VS Code.

### Selector de lenguaje con búsqueda
- El chip de lenguaje en la barra de estado ciclaba uno por uno entre todos los lenguajes instalados — impráctico con muchos lenguajes instalados.
- Ahora abre un buscador tipo "Select Language Mode" de VS Code: escribes y filtra, clic o Enter para seleccionar.

---

## 7. Cómo probar

Requiere Electron (`npm run electron:dev`) para las partes marcadas 🖥️; el resto también se puede ver con `npm run dev` en un navegador.

| Área | Cómo probarlo |
|---|---|
| Transpilador | Escribe `si (x == nulo) { sistema.imprimir("es para probar"); }` en Java — confirma que el string no se traduce y que `nulo` da `null`. Prueba `matematicas.potencia.(2, 3)` → `Math.pow(2, 3)`. |
| `principal` → `main` | Escribe `publico estatico vacio principal(cadena[] args) {}` — debe transpilar a `public static void main(String[] args) {}`. |
| Menú File/Edit/etc. 🖥️ | Haz clic en cualquier menú — debe verse completo, sin nada tapándolo. |
| Nuevo archivo / Abrir archivo | File → New File (o Ctrl+N) desde la pantalla de bienvenida — debe abrir una pestaña "Untitled-1" editable. Abre un archivo real — debe abrir en una pestaña nueva. |
| Guardar con varias pestañas 🖥️ | Abre 2+ archivos distintos, edita cada uno, guarda cada uno por separado — confirma que cada uno se guarda en SU propia ruta. |
| Resize de sidebar y panel | Arrastra el borde entre el explorador y el editor. Abre la terminal (Terminal → Toggle Terminal) y arrastra su borde superior. |
| Terminal interactiva 🖥️ | Abre la terminal, corre `python` (o cualquier REPL) y escribe algo — debe responder en vivo, con backspace/flechas funcionando. |
| Compatibilidad de lenguajes 🖥️ | Panel de Extensiones → busca "Go" o "Rust" — debe encontrar el lenguaje. Instálalo, abre un archivo `.go`/`.rs` — debe detectar el lenguaje solo. |
| Ejecutar JS/TS/Go 🖥️ | Con el lenguaje instalado y activo, escribe un `console.log`/`fmt.Println` y presiona Run — debe imprimir en el panel OUTPUT. |
| C/C++ interactivo 🖥️ (requiere WSL) | Escribe un programa C con `scanf("%d", &x);`, presiona Run — debe cambiar a la pestaña TERMINAL, compilar, y permitirte escribir el valor que `scanf` espera. |
| Selector de lenguaje | Clic en el chip de lenguaje en la barra de estado (abajo) — debe abrir un buscador. Escribe para filtrar, clic para seleccionar. |
| Panel Run and Debug | Abre la sección "Run and Debug" del sidebar — debe verse un botón grande "Run and Debug" y un enlace secundario de depuración, no dos botones iguales. |

---

## 8. Limitaciones conocidas (no arregladas, documentadas honestamente)

- El "instalar" un lenguaje desde el marketplace solo activa resaltado de sintaxis (Monaco) — no descarga ni ejecuta extensiones `.vsix` reales, ni da autocompletado/LSP.
- Rust/Ruby/PHP no se pudieron probar en esta máquina (toolchains no instalados) — el código está ahí con manejo de error si el compilador/intérprete no se encuentra.
- El "Run" en terminal para C/C++ no tiene botón de "Detener" propio ni timeout automático — es una sesión de shell normal (Ctrl+C para interrumpir).
- No hay debugging real (breakpoints, variables, call stack) — fue una decisión de alcance explícita durante la sesión, dado que HydraCode transpila y corre el resultado en vez de depurar el código fuente paso a paso.

---

# Sesión 2 — LSP-lite, editor visual genérico, lenguaje Go, y arreglos post-lanzamiento

Continuación de la sesión anterior. Todo verificado con `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (78/78) y `npm run build` en verde.

## 9. Autocompletado, hover y diagnósticos en vivo (LSP-lite)

- **No es un Language Server real** (no hay clangd/jdtls/pyright corriendo) — es autocompletado/hover que lee directamente el vocabulario de `LanguageRegistry`, así que funciona automáticamente para cualquier mapping, incluidos los que el usuario cree.
- `languageIntelligence.ts`: `registerCompletionItemProvider`/`registerHoverProvider` de Monaco, sugiriendo cada palabra del mapping activo con su traducción.
- `syntaxDiagnostics.ts`: chequeo estructural sin parser real — balance de llaves/paréntesis/corchetes y strings/comentarios sin cerrar — como subrayados de Monaco.
- `codeScanner.ts`: extraído de `TranspilerEngine` para compartir la misma lógica de "qué es código vs. qué es texto literal" entre el transpilador y los diagnósticos.

## 10. Editor visual (Blockly) completado y ahora genérico

- **Antes**: 4 generadores de código escritos a mano, uno por lenguaje (`java.ts`, `c.ts`, `cpp.ts`, `python.ts`), con un fallback silencioso a Java para cualquier lenguaje sin generador propio.
- **Ahora**: un único motor (`genericGenerator.ts`) que lee el campo `blockTemplate` de cada mapping y genera el código de cualquier lenguaje a partir de esos datos — añadir un lenguaje nuevo al editor visual ya no requiere escribir un generador aparte.
- Si un mapping no tiene `blockTemplate`, el modo Bloques se deshabilita explícitamente con un aviso — nunca genera silenciosamente el código de otro lenguaje.
- Bloques `romper`/`continuar` pasaron a ser tipos dedicados (antes eran texto genérico sin significado propio).
- El esquema de `blockTemplate` (`IBlockCodeTemplate` en `types.ts`) creció con: `forStyle: 'go-style'` (bucles `for` de Go, sin paréntesis y con declaración corta `:=`), `statementTerminator` (idioma con llaves pero sin `;` obligatorio), `filePrefix` (línea que debe ir antes que cualquier `import`, como `package main` de Go), `preamble` (imports condicionados a que el bloque que los necesita se haya usado de verdad — nunca un import "porque sí", que en Go es error de compilación), y `mainRequiresClass` (Java: un método nunca puede existir fuera de una clase).

## 11. Go como lenguaje nuevo — prueba real de que el sistema es genérico

- Mapping completo (`src/languages/go/GoSpanish.ts`) con las 25 palabras reservadas de Go en español.
- Añadirlo expuso **dos listas hardcodeadas más** que lo excluían silenciosamente, más allá de los generadores de Blockly: `SPANISH_LANGS` en `monacoLanguage.ts` (decidía si un lenguaje usaba el id de Monaco con inyección de español) y `SPANISH_BASE_SCOPES` en `grammarRegistry.ts` (decidía qué lenguajes recibían la gramática TextMate de inyección). Las dos ahora se derivan de `LanguageRegistry` en vez de una lista fija.

## 12. `LANGUAGE_MAPPINGS.md` — guía para crear mappings nuevos

Documento nuevo en la raíz del repo (no en `docs/`, que está en `.gitignore`) explicando campo por campo cómo crear un mapping de idioma nuevo — vocabulario y `blockTemplate` — usando Go como ejemplo trabajado de principio a fin.

## 13. "Nuevo archivo" con plantilla real, no un buffer vacío

- Ctrl+N / File → New File ahora abre una miniventana pidiendo nombre **con extensión** (p. ej. `test.cpp`), en vez de crear directamente un buffer "Untitled-N" vacío en memoria.
- El lenguaje se detecta de la extensión y el editor se pre-llena con un "Hola Mundo" en español, generado con las mismas plantillas (`fileTemplate.ts`, reutiliza `blockTemplate`) que usa el editor visual — ningún archivo de plantilla nuevo por lenguaje.
- Si hay una carpeta abierta (Explorer → Abrir Carpeta), el archivo se crea de verdad en disco dentro de esa carpeta, con un IPC nuevo (`folder:create-file`, escritura atómica con flag `wx` — nunca sobrescribe un archivo existente, muestra el error en la misma miniventana). Si no hay carpeta abierta, cae de vuelta a una pestaña en memoria (como antes), pero ya con nombre y plantilla correctos.

## 14. Bugs encontrados y corregidos en esta sesión

- **Crash de memoria agotada al abrir cualquier archivo** (`.java`, `.c`, `.cpp`, `.py`) — introducido por mí mismo al quitar la lista hardcodeada de gramáticas con inyección de español: la gramática de inyección terminaba inyectándose recursivamente sobre su propia salida sin parar nunca (`source.cpp.es-injection` → `....es-injection.es-injection` → ...), agotando la memoria del proceso en vez de fallar rápido. Corregido con un guard explícito en `grammarRegistry.ts` + test de regresión dedicado.
- **El transpilador usaba el lenguaje equivocado al abrir un archivo** — `_doTranspile()` leía un campo global (`_currentProgLang`, solo se actualizaba si tocabas el selector de la barra de estado a mano) en vez del lenguaje real de la pestaña activa. Abrir un `.cpp` transpilaba su contenido como si fuera Java.
- **El chip de idioma de la barra de estado no se sincronizaba** al abrir un archivo o cambiar de pestaña — seguía mostrando "Java" aunque tuvieras un `.cpp` abierto. Nuevo evento (`EditorPart.onActiveLanguageChange`) lo mantiene sincronizado.
- **STT (voz a texto) roto**: `vosk-browser` es un bundle UMD sin declaraciones `export` de verdad. Según el entorno (servidor de desarrollo de Vite vs. build de producción con Rollup) la función real `createModel` termina expuesta de tres formas distintas (directo en el módulo, bajo `.default`, o como variable global `window.Vosk`). Ahora se revisan las tres en orden en vez de asumir una.
- **La miniventana de "Nuevo archivo" no aceptaba texto la segunda vez que se abría**: su z-index (2001) era menor al de los menús desplegables (10000), y Monaco retiene el foco del teclado una vez que se crea el primer editor de la sesión. Arreglado subiendo el z-index del modal muy por encima de cualquier otro overlay y forzando un `blur()` explícito + `focus()` diferido a la siguiente animation frame antes de enfocar el campo de texto.

## 15. Cómo probar (sesión 2)

| Área | Cómo probarlo |
|---|---|
| Autocompletado/hover | Escribe código en cualquier lenguaje instalado — al teclear debe sugerir palabras del mapping activo con su traducción; al pasar el mouse sobre una palabra clave debe mostrar a qué se transpila. |
| Diagnósticos en vivo | Escribe un `{` o `(` sin cerrar — debe aparecer un subrayado rojo en esa línea. |
| Modo Bloques con Go 🖥️ | Instala Go desde Extensiones, abre/crea un `.go`, entra a modo Bloques, arma un programa con un bloque de imprimir, genera código — debe traer `paquete principal`, `importar "fmt"` y `func main()` ya transpilados. |
| Modo Bloques deshabilitado con gracia | Prueba modo Bloques en un lenguaje sin mapping (p. ej. Rust recién instalado) — debe mostrar un aviso claro, no generar código de otro lenguaje. |
| Nuevo archivo con carpeta abierta 🖥️ | Abre una carpeta, Ctrl+N, escribe `test.cpp` — debe crear el archivo de verdad en esa carpeta con la plantilla de C++ (incluye `#include <iostream>` y `using namespace std;`). Repite para crear un segundo archivo inmediatamente después — la miniventana debe aceptar texto normalmente. |
| Nuevo archivo sin carpeta abierta | Sin carpeta abierta, Ctrl+N, escribe `hola.py` — debe abrir una pestaña con la plantilla de Python, sin guardar en disco hasta que uses Guardar. |
| Nombre de archivo duplicado | Con una carpeta abierta, intenta crear un archivo con un nombre que ya existe — debe mostrar el error dentro de la misma miniventana, sin cerrarla. |
| STT (voz a texto) 🖥️ | Panel STT → descarga/carga un modelo → Grabar — debe transcribir lo que dices sin error en consola. |
| Transpile del lenguaje correcto 🖥️ | Abre un `.cpp` y uno `.py` en pestañas distintas — el panel de salida y el chip de la barra de estado deben reflejar siempre el lenguaje de la pestaña activa, no el último seleccionado manualmente. |

## 16. Limitaciones conocidas (sesión 2)

- `preamble` (imports automáticos del editor visual) solo cubre los bloques de imprimir por ahora — no genera imports para tipos ni para excepciones. Ver `LANGUAGE_MAPPINGS.md`.
- El modo Bloques no valida qué bloques son válidos dentro de cuáles — anidar un método dentro de una clase en C/Go (que se aproximan a `struct`, sin métodos reales) produce texto que no compila.
- `switch`/`case` en el editor visual solo genera el contenedor — las etiquetas `caso`/`predeterminado` no tienen bloques dedicados.
- El resaltado de sintaxis con palabras en español para Go específicamente todavía no está activo (no hay una gramática TextMate real de Go empaquetada en `extensions/`) — el autocompletado, hover y transpilación si funcionan igual, ya que no dependen de esa gramática.

# Sesión 3 — IA por voz, Configuración completa, arreglo de congelamiento en STT, y mappings desde GitHub

## 17. Intérprete de voz con IA

- Nuevo botón "Interpretar con IA" en el panel de STT: toma el texto transcrito (o editado a mano) y lo convierte en código HydraCode válido usando un endpoint de chat completions compatible con OpenAI — por defecto el catálogo gratuito de NVIDIA (`integrate.api.nvidia.com`), pero configurable a cualquier proveedor.
- **La clave de API es siempre del usuario, nunca hardcodeada** — se guarda solo en este equipo (`userData/settings.json`), nunca se sube a ningún repositorio.
- La llamada HTTP se hace desde el **proceso principal**, no desde el renderer: la mayoría de proveedores compatibles con OpenAI (NVIDIA incluido) no envían cabeceras CORS que permitan una petición desde un origen tipo navegador, así que un `fetch()` directo del renderer queda bloqueado. Ver `electron/main.cjs`'s `ai:stream-start`.
- **Streaming en vivo**: la respuesta se transmite por SSE y el texto aparece progresivamente en el textarea a medida que el modelo lo genera, en vez de esperar en silencio toda la respuesta completa (con un modelo grande de 70B en un endpoint gratuito, la espera sin feedback se sentía como que la app estaba rota). También se bajó el límite de `max_tokens` de 1024 a 512 para acotar el peor caso de latencia.

## 18. Configuración de usuario (estilo Visual Studio Code)

- Nueva sección "Configuración" (icono de engranaje en la activity bar) — panel con buscador, categorías (Editor, Idioma, IA, Voz a texto, Apariencia, Ejecución), controles por tipo (checkbox/select/texto/número/clave secreta) e indicador de "modificado" con botón de reset por campo.
- Todo se persiste en `userData/settings.json` (mismo formato plano `{ "clave.con.puntos": valor }` que usa VS Code) y se aplica de verdad: tamaño/familia de fuente, tabulación, ajuste de línea, minimapa y números de línea del editor se leen al crear cada editor Monaco y se re-aplican en vivo si cambian; el idioma humano/de programación por defecto siembra la barra de estado; el tiempo límite de ejecución lo usa `run:execute` en el proceso principal.
- La configuración de IA (URL base / modelo / clave) que antes vivía en un formulario aparte dentro del panel de STT ahora es parte de este sistema general — un solo lugar para toda la configuración, no uno por función.

## 19. Arreglo del congelamiento de Vosk durante grabaciones largas

- **Causa real**: un único `KaldiRecognizer` transmitiendo sin parar deja crecer el grafo de decodificación de Kaldi sin límite durante toda la sesión de grabación — eventualmente el Worker se traba sin producir ningún error de JavaScript capturable (el `Model` de `vosk-browser` no reenvía errores del Worker por su cuenta).
- Ahora se fuerza una finalización periódica del reconocedor (cada ~15s, esperando un hueco de silencio real para no cortar a mitad de palabra; si no hay ningún hueco en 30s, se fuerza de todos modos para no arriesgar otro congelamiento), se escuchan errores del Worker directamente, y un vigilante de estancamiento detiene la grabación si no llega ningún resultado en 20s — con una sola transición de estado clara ("error"), no dos contradictorias.

## 20. Carga de mappings de idioma desde GitHub

- **Bug corregido**: a `imprimir` le faltaba mapeo en C (`CSpanish.ts`) — el `printf({TEXT})` del editor visual existía, pero escribir `imprimir("...")` a mano en el editor de texto no traducía a nada válido. Agregado como palabra clave normal (`imprimir` → `printf`, sin necesidad de espacio de nombres como en Java).
- **Nuevo esquema de datos** (`src/languages/tokens/mappingFile.ts`) para representar un mapping como JSON puro — mismo formato que ya usaban `examples/mappings/*.json` (campo `langId`, `patterns[].from/.to`), ahora compartido por todas las formas de cargar un mapping (ejemplo integrado, archivo local, o repositorio de GitHub). **Nunca se ejecuta código del archivo** — solo se leen strings y se construyen objetos `RegExp` reales a partir de ellos, nunca `eval`/`Function`/importación dinámica.
- **Nuevo panel "Cargar mapping desde GitHub"** dentro de Extensiones: pega la URL de un repositorio con un `mapping.json` en la raíz y HydraCode lo descarga, valida e instala.
- **Java, C, C++ y Python ahora se cargan desde GitHub en vez de venir compilados en la app** — cada uno desde su propio repositorio bajo la organización `HydraCode-Team` (`Java-mappings-hydracode`, `C-mappings-hydracode`, `Cpp-mappings-hydracode`, `Python-mappings-hydracode` — los 4 creados y poblados en esta sesión, usando `gh` CLI ya autenticado por el usuario). Cada mapping se cachea localmente (`userData/mappings/<lenguaje>.json`) la primera vez que se descarga con éxito, y si una petición falla (sin conexión, repositorio caído) se usa esa copia en caché; si tampoco hay copia en caché aún, se usa una semilla empaquetada con la app (`electron/mapping-seeds/`, generada de los mappings que la app tenía antes de este cambio) para que el idioma nunca quede sin vocabulario en el primer arranque.
- Go sigue viniendo compilado en la app — no se pidió moverlo a GitHub.

## 21. Cómo probar (sesión 3)

| Área | Cómo probarlo |
|---|---|
| Interpretar con IA 🖥️ | Configuración → IA → pega una clave de API (gratis en build.nvidia.com). Panel STT → escribe/dicta una descripción → "Interpretar con IA" — el texto debe ir apareciendo en vivo, no aparecer todo de golpe al final. |
| Configuración persiste | Cambia el tamaño de fuente del editor en Configuración, cierra y vuelve a abrir la app — debe mantenerse. |
| `imprimir` en C 🖥️ | Crea un archivo `.c`, escribe `imprimir("Hola Mundo");` — debe transpilar a `printf("Hola Mundo");`. |
| Grabación larga de voz 🖥️ | Graba hablando sin parar por más de 30 segundos — no debe congelarse ni quedar el micrófono encendido sin responder. |
| Cargar mapping desde GitHub 🖥️ | Extensiones → "Cargar mapping desde GitHub" → pega `https://github.com/HydraCode-Team/Python-mappings-hydracode` → Instalar — debe confirmar la instalación. |

## 22. Revisión adversarial del sistema de mappings desde GitHub — 7 hallazgos reales, todos corregidos

Una revisión con múltiples agentes (cada hallazgo verificado independientemente antes de aceptarlo) encontró 7 problemas reales en la nueva funcionalidad de carga de mappings desde GitHub:

- **ReDoS (severidad alta)**: un repositorio malicioso podía declarar un `pattern` con backtracking catastrófico (p. ej. `(a+)+$`) que, al compilarse y ejecutarse en cada transpile (cada pulsación de tecla, sin worker ni timeout), congelaba toda la ventana de Electron sin posibilidad de recuperación. Corregido con una heurística de detección de cuantificadores anidados (verificada contra los patterns reales de Java para confirmar cero falsos positivos) más límites de longitud (300 caracteres) y cantidad (200 patterns) por mapping.
- **Suplantación de idioma**: el `langId` declarado dentro del `mapping.json` descargado nunca se comparaba contra el lenguaje que la fuente decía representar — un repositorio comprometido o mal configurado para "python" podía declarar `"langId": "java"` y sobrescribir silenciosamente el mapping real de Java. Ahora se rechaza (no se registra) cualquier mapping cuyo `langId` no coincida con el de la fuente configurada.
- **Tamaño de respuesta sin límite**: se agregó un límite de 2MB (por `Content-Length` y por tamaño real del texto) a la descarga de `mapping.json`.
- **Caché no atómica + sin auto-recuperación**: una escritura de caché interrumpida (cierre forzado, disco lleno) podía dejar un archivo corrupto pero legible, y la app solo caía a la semilla empaquetada si la lectura fallaba — nunca si el JSON estaba corrupto. Ahora las escrituras son atómicas (archivo temporal + rename) y la validación de JSON ocurre antes de confiar en la caché, cayendo a la semilla en ambos casos.
- **Escrituras concurrentes sin serializar**: dos guardados casi simultáneos al mismo archivo de caché podían completarse fuera de orden. Se agregó una cola de escritura por ruta de archivo.
- **Misma condición de carrera que settingsStore.set() ya tenía, pero en extensionRegistry.ts**: `install()`/`uninstall()` no esperaban a que `loadInstalled()` terminara antes de mutar y persistir — un clic rápido en "Instalar" antes de que cargara la lista real podía borrar silenciosamente extensiones ya instaladas. Corregido con el mismo patrón (`await this.loadInstalled()` primero) ya aplicado a `settingsStore`/`mappingSourceStore`.
- **Botones de instalar/desinstalar del marketplace sin manejo de errores**: si `install()`/`uninstall()` alguna vez rechazaban la promesa, el botón quedaba atascado deshabilitado para siempre. Se agregó try/catch/finally consistente en los 4 manejadores de clic del panel de Extensiones.

## 23. Limitaciones conocidas (sesión 3, primera mitad)

- El fetch de GitHub tiene un timeout compartido de 8 segundos entre la resolución de rama y la descarga del archivo — si ambas llamadas son lentas, puede tardar hasta ~16s antes de caer a la copia en caché.
- La heurística de detección de ReDoS no es una prueba formal — cubre el patrón más común (cuantificador anidado dentro de un grupo cuantificado), pero no garantiza detectar cualquier forma posible de backtracking catastrófico.
- El límite de tiempo de ejecución (`run.timeoutMs`) y otros campos numéricos de Configuración ahora se acotan a su rango declarado (`min`/`max`) al escribir un valor fuera de rango, pero la corrección ocurre silenciosamente (el campo se ajusta al límite más cercano sin aviso visible de que el valor pedido fue rechazado).

## 24. Módulo dedicado "Mappings" + limpieza de Extensiones

- **Nueva sección "Mappings"** en la barra de actividades (debajo de Extensiones): muestra, para cada idioma configurado, si cargó desde la red, desde caché, o si falló (con el motivo) — antes esta información solo existía en la consola del navegador. Se actualiza en vivo cuando se instala un mapping nuevo.
- "Importar archivo JSON" y "Cargar mapping desde GitHub" se movieron desde el panel de Extensiones a este nuevo módulo — Extensiones vuelve a ser exclusivamente sobre extensiones de Monaco/marketplace.
- **Se eliminaron los "Ejemplos integrados"** (Java/C/C++/Python vía `examples/mappings/*.json`) — ya redundantes ahora que esos 4 lenguajes se cargan correctamente desde GitHub. Se borraron los archivos JSON, el IPC `extensions:read-example-mapping`, y el CSS asociado.
- **Mapping de prueba nuevo**: `HydraCode-Team/Cpp-Italian-mappings-hydracode` — un mapping Italiano→C++ (no es uno de los 4 idiomas por defecto), creado para probar de punta a punta el flujo de "Cargar mapping desde GitHub" con una fuente genuinamente nueva agregada por el usuario, no una de las precargadas. Instalable desde el panel Mappings.
- **Limpieza menor de Blockly**: `blocklyRenderer.ts` registraba sus definiciones de bloques cada vez que se entraba a modo Bloques, generando decenas de warnings repetidos en consola ("Block definition X overwrites previous definition") — ahora se registran una sola vez por sesión de la app. El error de consola "Attempted to focus unregistered node" que aparece al cerrar el editor de bloques es un problema interno conocido de la librería Blockly (una condición de carrera entre su propio `dispose()` y un callback diferido de reenfoque) — no introducido por HydraCode y no deja la app en un estado roto, así que no se intervino.

## 25. Cómo probar (sesión 3, segunda mitad)

| Área | Cómo probarlo |
|---|---|
| Estado de mappings 🖥️ | Barra de actividades → Mappings — debe mostrar java/c/cpp/python con "✓ Red" (o "✓ Caché" si no hay conexión). |
| Instalar mapping italiano 🖥️ | Mappings → "Cargar mapping desde GitHub" → pega `https://github.com/HydraCode-Team/Cpp-Italian-mappings-hydracode` → Instalar. Debe confirmar la instalación y aparecer en la lista de estado con "✓ Red". Después, "Italiano" debe aparecer como opción de idioma humano en Configuración. |
| Extensiones sin mappings | Extensiones ya no debe mostrar "Importar archivo JSON" ni "Ejemplos integrados" — solo búsqueda/instalación de extensiones de Monaco. |
| Bloques sin warnings repetidos 🖥️ | Entra y sal de modo Bloques varias veces — la consola no debe repetir "overwrites previous definition" en cada visita. |

## 26. Selector de idioma humano en la barra de estado + bug real encontrado al probar

- **Bug encontrado en vivo**: instalar el mapping italiano de C++ sobrescribía silenciosamente la fuente en español de C++ — `MappingSource` se identificaba solo por `languageId` ("cpp"), así que agregar un SEGUNDO idioma humano para el mismo lenguaje de destino reemplazaba al primero en vez de coexistir. Corregido: ahora la clave es el par (`languageId`, `humanLangId`), tanto en la lista de fuentes persistida como en el caché en disco (antes `userData/mappings/cpp.json`, ahora `userData/mappings/cpp-es.json` y `cpp-it.json` por separado). Un mapping cuya fuente no coincide en `languageId` **o** `humanLangId` con lo declarado ahora se rechaza (mismo mecanismo que ya existía solo para `languageId`).
- El chip "ES" de la barra de estado (idioma humano) ya no es un ciclo silencioso con un mapa de nombres hardcodeado a `{en, es}` — ahora es un selector visible (igual al de lenguaje de programación), que lista los idiomas humanos realmente registrados para el lenguaje de programación activo, con su nombre nativo real (ej. "Italiano") tomado del mapping, no de una tabla fija.

## 27. Cómo probar (sesión 3, tercera parte)

| Área | Cómo probarlo |
|---|---|
| Selector de idioma humano 🖥️ | Abre/crea un `.cpp`, haz clic en el chip de idioma humano (donde antes decía "ES") en la barra de estado — debe mostrar una lista con "Español" e "Italiano" (si el mapping italiano está instalado), no solo ciclar en silencio. |
| Ambos mappings de C++ coexisten 🖥️ | Con el mapping italiano instalado, la consola debe mostrar tanto "Registered mapping: Spanish (Español) → cpp" como "Registered mapping: Italian (Italiano) → cpp" — ninguno debe faltar. |
