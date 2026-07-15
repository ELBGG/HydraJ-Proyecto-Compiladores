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
