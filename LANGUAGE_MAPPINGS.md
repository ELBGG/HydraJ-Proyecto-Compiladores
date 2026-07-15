# Creando un mapping de idioma para HydraCode

HydraCode transpila **de un idioma humano (español, hoy) hacia un lenguaje de
programación real** (Java, C, C++, Python, Go...). Cada par idioma-humano ↔
lenguaje-de-programación está definido por un único objeto de datos: un
`HumanLanguageMapping`. No hay una lista fija de "lenguajes soportados" en
ninguna parte del código — todo lo que consume un mapping (el transpilador, el
resaltado de sintaxis, el autocompletado, el parser de código↔bloques y el
editor visual de Blockly) lo descubre dinámicamente a través de
`LanguageRegistry`.

Este documento explica cómo crear un mapping nuevo, campo por campo, usando el
mapping de **Go** (`src/languages/go/GoSpanish.ts`) como ejemplo real y
completo — es el lenguaje más reciente añadido al proyecto, precisamente para
probar que el sistema es genérico y no depende de una lista cerrada de
lenguajes "especiales".

## Índice

1. [Arquitectura en una imagen](#arquitectura-en-una-imagen)
2. [Anatomía de un `HumanLanguageMapping`](#anatomía-de-un-humanlanguagemapping)
3. [Registrar el mapping](#registrar-el-mapping)
4. [Qué obtienes gratis solo con el vocabulario](#qué-obtienes-gratis-solo-con-el-vocabulario)
5. [Modo Bloques: `blockTemplate`](#modo-bloques-blocktemplate)
6. [Ejemplo completo: Go paso a paso](#ejemplo-completo-go-paso-a-paso)
7. [Resaltado de sintaxis real (opcional, independiente de todo lo anterior)](#resaltado-de-sintaxis-real-opcional-independiente-de-todo-lo-anterior)
8. [Probar tu mapping](#probar-tu-mapping)
9. [Limitaciones conocidas](#limitaciones-conocidas)

## Arquitectura en una imagen

```
src/languages/<lenguaje>/
  ├── <Lenguaje>Spanish.ts   ← el HumanLanguageMapping (vocabulario + blockTemplate)
  └── index.ts               ← export + registerXLanguages()

LanguageRegistry.register(mapping)   ← una sola llamada, hecha en workbench.ts al arrancar
        │
        ├── TranspilerEngine ................. sustituye palabras español→real por límites de palabra
        ├── spanishInjection.ts (TextMate) .... colorea las palabras clave español en el editor
        ├── languageIntelligence.ts ........... autocompletado + hover (Monaco)
        ├── syntaxDiagnostics.ts .............. balance de llaves/paréntesis/strings (agnóstico al mapping)
        ├── codeParser.ts ...................... texto → árbol de bloques (ya es genérico, reconoce
        │                                         palabras clave en español Y en el lenguaje real)
        └── genericGenerator.ts (Blockly) ..... árbol de bloques → texto, leyendo mapping.blockTemplate
```

**Ningún archivo de la lista de arriba tiene el nombre de un lenguaje
hardcodeado.** Todos leen `mapping.keywords`, `mapping.types`, etc., o
`mapping.blockTemplate`, sea cual sea el `languageId` del mapping. Añadir un
lenguaje es **escribir datos, no código** — con una única excepción menor
(resaltado de sintaxis TextMate real), explicada en la sección 7.

## Anatomía de un `HumanLanguageMapping`

Definido en [`src/languages/tokens/types.ts`](src/languages/tokens/types.ts)
(`IHumanLanguageMapping`) y construido con la clase
[`HumanLanguageMapping`](src/languages/tokens/HumanLanguageMapping.ts):

```ts
export const goSpanish = new HumanLanguageMapping(
  'es',        // id: idioma humano (código corto)
  'Spanish',   // name: nombre del idioma humano en inglés
  'Español',   // nativeName: nombre del idioma humano en sí mismo
  'go',        // languageId: el lenguaje de programación destino
  {
    version: '1',
    modifiers: { /* ... */ },
    keywords: { /* ... */ },
    types: { /* ... */ },
    literals: { /* ... */ },
    patterns: [ /* opcional */ ],
    blockTemplate: { /* opcional — ver sección 5 */ },
  },
);
```

Los cuatro primeros argumentos identifican el **par** (idioma humano,
lenguaje destino) — `LanguageRegistry` los indexa como `` `${languageId}::${id}` ``.
Para añadir soporte de Go en español, `id` sigue siendo `'es'` y `languageId`
es `'go'`. Si algún día alguien quiere un mapping de Go en **francés**, sería
un segundo objeto con `id: 'fr'`, `languageId: 'go'` — mismo target, otro
vocabulario, coexistiendo sin conflicto.

### Las cuatro categorías de vocabulario

Cada una es un `Record<string, string>`: **palabra en español → palabra
real del lenguaje destino**. La categoría es principalmente organizativa
(documenta la intención); el transpilador las combina todas en un único paso
de sustitución por límites de palabra (`\bpalabra\b`), en este orden de
prioridad si una palabra aparece en más de una categoría:
`modifiers → keywords → types → literals` (la última gana).

| Categoría   | Para qué sirve                                    | Ejemplo (Go)                    |
|-------------|----------------------------------------------------|----------------------------------|
| `keywords`  | Palabras reservadas de control de flujo, y también convenciones centrales del lenguaje aunque no sean técnicamente reservadas (p. ej. `main`) | `'si': 'if'`, `'para': 'for'`, `'principal': 'main'` |
| `types`     | Nombres de tipos, built-ins con nombre propio      | `'entero': 'int'`, `'cadena': 'string'` |
| `literals`  | Constantes del lenguaje                           | `'verdadero': 'true'`, `'nulo': 'nil'` |
| `modifiers` | Modificadores de declaración (visibilidad, storage) | `'constante': 'const'`          |

No fuerces una palabra en la categoría "correcta" a toda costa: lo que
importa es que exista en **alguna** de las cuatro, porque todas se
sustituyen igual. Java usa `keywords.principal = 'main'` para su punto de
entrada aunque `main` no sea una palabra reservada de Java tampoco — es la
misma idea que Go reutiliza.

**No es necesario mapear cada palabra del lenguaje destino.** Cada mapping
existente cubre el vocabulario común, no el 100% de la biblioteca estándar.
Añade lo que tenga sentido para tu caso de uso; se puede ampliar después sin
romper nada (es un objeto de datos, no un contrato versionado).

### `patterns` (opcional)

Para llamadas multi-palabra que no son una simple palabra clave, como
`sistema.imprimir(...)` → `System.out.println(...)` en Java:

```ts
patterns: [
  { from: /\bsistema\.imprimir\b/g, to: 'System.out.println' },
],
```

Los mappings de C, C++ y Python no registran `patterns` para su función de
imprimir — usan la API real directamente en el texto español
(`printf(...)`, `cout << ... << endl`, `print(...)`) porque no hay ganancia
en inventar una palabra española para algo que ya es corto y reconocible.
Go sigue la misma convención: `fmt.Println({TEXT})` se usa tal cual dentro
de la plantilla de bloques (ver sección 5) en lugar de crear un patrón para
una palabra "imprimir" que nadie necesita.

## Registrar el mapping

Tres archivos, todos triviales:

**`src/languages/go/index.ts`**
```ts
export { goSpanish } from './GoSpanish.js';

import { goSpanish } from './GoSpanish.js';
import { LanguageRegistry } from '../api/LanguageRegistry.js';

export function registerGoLanguages(): void {
  LanguageRegistry.register(goSpanish);
}
```

**`src/languages/index.ts`** — añade una línea de re-export:
```ts
export { goSpanish, registerGoLanguages } from './go/index.js';
```

**`src/workbench/workbench.ts`** — llama al registrador al arrancar, junto a
los demás:
```ts
registerGoLanguages();
```

Eso es todo. No hay una lista de lenguajes "conocidos" en ningún otro sitio
que también haga falta tocar — si encuentras una, es un bug (ver la nota al
final de la sección 7).

## Qué obtienes gratis solo con el vocabulario

En cuanto el mapping está registrado, sin escribir ni una línea más de
código:

- **Transpilación** (`TranspilerEngine`): el usuario escribe Go en español en
  el editor de texto y el botón "Transpile" produce Go real.
- **Autocompletado y hover** (`languageIntelligence.ts`): sugiere cada
  entrada del vocabulario mientras escribes, y el hover muestra a qué se
  transpila. No es un Language Server real (no entiende tipos ni scope) —
  lee directamente el mismo mapping que usa el transpilador, así que
  funciona para cualquier lenguaje con mapping automáticamente.
- **Parser de código a bloques** (`codeParser.ts`): ya reconoce tanto
  palabras clave en español como en el lenguaje real (`si`/`if`,
  `mientras`/`while`, etc.) y es agnóstico a llaves-vs-Python — no necesita
  ningún cambio para un lenguaje nuevo basado en llaves como Go. La única
  excepción es el reconocimiento de la firma especial de `main()`, ver la
  nota en la sección 6.

Lo que **no** obtienes gratis todavía es el **modo Bloques** (el editor
visual estilo Scratch) — para eso hace falta `blockTemplate`.

## Modo Bloques: `blockTemplate`

`blockTemplate` es un campo opcional de `IHumanLanguageMapping`. Si no lo
defines, el mapping funciona igual para todo lo de la sección anterior, pero
el modo Bloques queda deshabilitado para ese lenguaje (con un aviso claro en
vez de generar código de otro lenguaje por error — ver
`blocklyRenderer.ts`'s `isBlocksModeSupported`).

El motor que lee este campo es
[`genericGenerator.ts`](src/workbench/parts/editor/blocklyGenerators/genericGenerator.ts) —
**un solo archivo para todos los lenguajes**. No hay (ni debe haber) un
`goGenerator.ts`/`rustGenerator.ts` por lenguaje; esa era precisamente la
limitación que este sistema reemplaza.

Todos los bloques (`hc_si`, `hc_para`, `hc_imprimir`, las variables
tipadas, etc.) están definidos una única vez en `blocklyRenderer.ts` — son
los mismos bloques visuales para cualquier lenguaje. Lo que cambia por
lenguaje es únicamente **cómo se traduce cada bloque a texto**, y eso es
exactamente lo que describe `IBlockCodeTemplate`.

### `style: 'braces' | 'indent'`

Decide cómo el motor genérico envuelve el cuerpo de cualquier bloque:

- `'braces'`: `header {\n  cuerpo\n}\n` (Java/C/C++/Go)
- `'indent'`: `header:\n  cuerpo` (Python)

Ningún otro campo de la plantilla debe incluir llaves ni dos puntos —
eso lo añade el motor automáticamente y una sola vez.

### `main` y `class`

Encabezados de los bloques especiales `hc_main`/`hc_clase`. Solo el
encabezado — el motor se encarga del cuerpo. `null` en cualquiera de los
dos significa "este lenguaje no tiene ese concepto": el cuerpo se emite sin
envolver, con un comentario explicativo en vez de inventar sintaxis.

Go no tiene una única línea de entrada — necesita `package main` **antes**
de `func main()`, pero ese `package` no es parte de "main" en sí: es un
requisito de la gramática de Go de que sea la primera línea física del
archivo, incluso antes que cualquier `import`. Por eso vive en
`filePrefix` (ver más abajo), no concatenado dentro de `main`:

```ts
main: 'funcion principal()',
filePrefix: 'paquete principal',
```

Si `main` incluyera literalmente `'paquete principal\n\nfuncion principal()'`,
no habría forma de insertar los `import` generados por `preamble` en el
lugar correcto (entre el `package` y el resto del archivo).

`class` en Go (y en C) es una aproximación honesta: ninguno de los dos
tiene clases reales, así que se mapea a `struct`/`estructura` — solo
campos, no métodos anidados (un método dentro de un `struct{}` no
compilaría). `classTrailingSemicolon: true` en C++ añade el `;` que C++
exige tras `};`; Go y C con struct no lo necesitan y lo omiten.

### `method` y `stripFromSignature`

`{SIGNATURE}` es el único placeholder — el usuario escribe la firma
completa en el campo de texto del bloque. Hay dos formas según si el
lenguaje tiene una palabra clave de función separada:

- Java/C/C++: la firma ya es autocontenida (`"publico entero sumar(...)"`)
  → `method: '{SIGNATURE}'`
- Python/Go: hace falta anteponer la palabra clave de función
  (`def`/`func`) → `method: 'funcion {SIGNATURE}'`

El campo de firma por defecto en el bloque trae un placeholder con sabor a
Java (`"publico vacio nombre()"`). Un lenguaje sin modificadores de
visibilidad ni `void` debe quitarlos con `stripFromSignature` (regexes
aplicadas en orden, ancladas al inicio):

```ts
stripFromSignature: ['^(publico|privado|protegido|estatico)\\s+', '^vacio\\s+'],
```

Python y Go usan exactamente la misma lista por la misma razón.

### Control de flujo: `ifKeyword` / `elseKeyword` / `whileKeyword` / `forKeyword`

Palabras sueltas, sin paréntesis ni dos puntos — el motor los añade según
`style`. Nada impide que dos campos compartan la misma palabra: Go no
tiene un `while` propio (un `for` con solo condición hace ese papel), así
que `whileKeyword` y `forKeyword` apuntan a la misma palabra española
(`'para'`), reflejando la gramática real de Go.

### `supportsDoWhile` / `doKeyword`

Si es `true`, hace falta también `doKeyword`, y el bloque `hc_hacer` genera
un do-while real. Si es `false` (Go, Python), el motor genera el cuerpo una
vez y luego un `while` equivalente con el mismo cuerpo duplicado — funciona
sin necesitar vocabulario adicional (una alternativa con `while(true) +
break` habría necesitado un operador de negación que este esquema no
modela).

### `forStyle`

El campo `INIT` del bloque `hc_para` es texto libre, normalmente con forma
`"entero i = 0; i < 10; i++"`. Cómo se traduce depende del lenguaje:

- **`'c-style'`** (Java/C/C++): se usa tal cual, entre paréntesis —
  `for (init; cond; incr) { ... }`.
- **`'range'`** (Python): no hay bucle de tres cláusulas en Python. El
  motor extrae variable/inicio/operador/fin con `parseCountingForLoop(init)`
  y reconstruye `para i en rango(inicio, fin)`. Si el texto no coincide con
  el patrón reconocible, se deja un comentario en vez de adivinar.
- **`'go-style'`** (Go): Go **sí** tiene un bucle de tres cláusulas, pero su
  gramática no permite paréntesis alrededor y la cláusula de inicio debe
  ser una declaración corta (`:=`), no una tipada. `"entero i = 0"` (que
  se traduciría a `"int i = 0"`) no es válido ahí. El motor reutiliza el
  mismo `parseCountingForLoop` que usa `'range'`, pero reconstruye
  `i := inicio; i op fin; i++` sin paréntesis, preservando el operador de
  comparación original (`<` o `<=`) en vez de normalizarlo.

Si tu lenguaje necesita una cuarta forma, añade un valor nuevo al union
type en `types.ts` y una rama nueva en `genericGenerator.ts`'s `hc_para` —
es exactamente el patrón que se siguió para añadir `'go-style'`.

### `switchKeyword` / try-catch

`switchKeyword: null` si no hay construcción equivalente (Python antes de
3.10) — el cuerpo se emite sin envolver con un comentario. Igual con
`supportsTryCatch: false` (+ `tryKeyword`/`catchKeyword` si es `true`): Go
lo declara `false` a propósito — errores-como-valores y `panic`/`recover`
son un idioma completamente distinto a excepciones, y forzar la
apariencia de un try/catch sería engañoso, no solo aproximado.

> El bloque `hc_cambiar` (switch) genera únicamente el contenedor
> `switch (variable) { }` — no existen todavía bloques dedicados para
> `caso`/`predeterminado`. Esta limitación es igual para los cuatro
> lenguajes originales, no algo nuevo de este sistema; ver la sección de
> limitaciones.

### `print` / `printError`

`{TEXT}` es el único placeholder. Usa la API real del lenguaje directamente
si no tiene sentido inventar una palabra española para ella (como hacen
C, C++, Python y Go) o una plantilla con vocabulario propio (como Java, con
`sistema.imprimir({TEXT})` + un `pattern`).

### `filePrefix` y `preamble` — imports/includes automáticos

El código generado por bloques necesita a veces líneas que no vienen de
ningún bloque en particular: un `#include`, un `import`, un `using
namespace`. El motor las añade de forma **condicional** — solo si el
programa generado realmente usa el bloque que las necesita — y en el
orden correcto:

```
[filePrefix, si existe]

[líneas de preamble de los bloques usados, sin duplicados]

[código generado]
```

`filePrefix` es una única línea **incondicional** (se emite siempre que
se genera código, la use o no cualquier bloque) — solo tiene sentido para
un requisito de la gramática misma del lenguaje, no de un bloque
concreto. Hoy solo Go la usa (`'paquete principal'`, ver arriba). Para
cualquier otro lenguaje, se omite.

`preamble` sí es condicional, por bloque. Es un mapa de "qué bloque lo
dispara" → "qué líneas añadir si ese bloque aparece al menos una vez en
el programa":

```ts
// Go
preamble: {
  print: ['importar "fmt"'],
  printError: ['importar "fmt"', 'importar "os"'],
},

// C
preamble: {
  print: ['#include <stdio.h>'],
  printError: ['#include <stdio.h>'],
},

// C++ — cout/cerr/endl se usan sin prefijo std:: en el print template,
// así que hacen falta DOS líneas, no solo el include:
preamble: {
  print: ['#include <iostream>', 'using namespace std;'],
  printError: ['#include <iostream>', 'using namespace std;'],
},

// Python — solo printError necesita algo (sys.stderr); print() es builtin
preamble: {
  printError: ['importar sys'],
},
```

**Por qué es condicional y no un simple `#include` fijo por lenguaje:**
en Go, importar un paquete que nunca se usa es un error de compilación,
no un warning. Si `preamble.print` se emitiera siempre (usaras o no el
bloque `hc_imprimir`), un programa que nunca imprime nada dejaría de
compilar por el import sobrante. El motor genérico rastrea, durante cada
generación, qué construcciones (`hc_imprimir`, `hc_imprimir_error`) se
usaron de verdad, y solo junta las líneas de preamble de esas — sin
duplicados, aunque dos bloques usados pidan la misma línea (como `fmt` en
Go, que tanto `print` como `printError` necesitan).

Las claves válidas de `preamble` son las del tipo `PreambleKey` en
`types.ts` — hoy solo `'print' | 'printError'`, porque son los únicos dos
casos con una necesidad real demostrada entre los cinco mappings
incluidos. Si un mapping futuro necesita uno para otra construcción
(`throw`, `tryCatch`...), se amplía esa unión y se marca el uso en el
`forBlock` correspondiente dentro de `genericGenerator.ts` — dos líneas
de cambio, no un rediseño.

Igual que con el resto de plantillas: usa la sintaxis real del lenguaje
directamente si no existe (o no vale la pena inventar) una palabra
española para ella (`'#include <stdio.h>'` en C), o la vocabulario ya
existente si ya está definida por otra razón (`'importar "fmt"'` en Go,
reutilizando la palabra `importar` que ya vive en `keywords`).

### `varDecl` y `typeOverrides`

`"{TYPE} {VAR}"` donde `{VAR}` es el texto completo del campo del bloque
(p. ej. `"nombre = 0"`) y `{TYPE}` se sustituye por el propio nombre
español del bloque (`"entero"`, `"cadena"`...) salvo que haya una entrada
en `typeOverrides` para ese bloque. **Importante:** el tipo por defecto es
el nombre del bloque, no una búsqueda en `mapping.types` — eso último
daría la traducción al inglés (`"int"`), justo lo contrario de lo que
necesita el código español generado.

`typeOverrides` existe para lenguajes donde el bloque no tiene un
equivalente 1:1: C no tiene booleano ni cadena como tipos propios
(`typeOverrides: { cadena: 'caracter*', booleano: 'entero' }`).

Go va un paso más allá: como infiere el tipo del literal a la derecha,
**ningún** bloque de variable necesita anteponer un tipo explícito —
`varDecl: 'var {VAR}'` no contiene siquiera el placeholder `{TYPE}` (queda
sin usar, lo cual es válido: el motor simplemente no encuentra nada que
sustituir). Todos los bloques `hc_entero`/`hc_cadena`/etc. colapsan a la
misma forma `var nombre = valor` para Go, y es correcto: Go decide el tipo
real a partir del literal.

Usa `varDecl: null` si el lenguaje no tiene declaración de variable
independiente en absoluto (Python: `"nombre = 0"` ya es la sentencia
completa).

### `returnKeyword`, `throwTemplate`, `breakKeyword`, `continueKeyword`

Palabras sueltas, salvo `throwTemplate` que es una plantilla con `{EXC}`
(`'lanzar nuevo {EXC}'` en Java). `throwTemplate: null` junto con
`supportsTryCatch: false` es la combinación correcta cuando el lenguaje no
tiene excepciones.

### `statementTerminator` (opcional)

Por defecto, `;` cuando `style: 'braces'` y `''` cuando `style: 'indent'`
— correcto para los cuatro lenguajes originales. Un lenguaje con llaves
pero sin `;` obligatorio (Go, y en el futuro potencialmente
Kotlin/Swift/JavaScript) lo declara explícitamente:

```ts
statementTerminator: '',
```

Un `;` de más en Go **no** es un error de compilación (la gramática de Go
lo permite y su inserción automática de punto y coma ni siquiera se
activa si ya escribiste uno), pero `gofmt` siempre lo elimina — así que
omitirlo aquí hace que el código generado ya tenga el estilo real de Go
en vez de parecer C con los bordes limados.

## Ejemplo completo: Go paso a paso

El mapping completo está en
[`src/languages/go/GoSpanish.ts`](src/languages/go/GoSpanish.ts) — vale
la pena leerlo entero una vez, con los comentarios inline explicando cada
decisión no obvia. Resumen de las decisiones más interesantes que no se
cubrieron arriba:

- **`modifiers` casi vacío** (`{ constante: 'const' }`): Go no tiene
  `public`/`private`/`static` — la visibilidad depende de si el
  identificador empieza en mayúscula, no de una palabra clave. No hay
  necesidad de forzar entradas que no existen en el lenguaje real.
- **Sin entrada `vacio` en `types`**: Go no tiene `void`; una función sin
  retorno simplemente omite el tipo de retorno. Añadir `'vacio': 'void'`
  produciría Go inválido, así que se omite a propósito y se confía en
  `stripFromSignature` para quitar un `vacio` que quedara en la firma por
  defecto.
- **`codeParser.ts` reconoce `funcion principal(`/`func main(`**: la
  única línea que sí tuvo que tocarse fuera del propio mapping — el
  reconocimiento de la firma especial de `main()` (para que se parsee
  como el bloque dedicado `hc_main` en vez de un método genérico) usaba
  un regex con las formas de Java/C hardcodeadas. Se añadió una rama más
  (`(?:funcion|func)\s+(?:principal|main)`) al regex existente en
  `KW_MAIN` — un cambio aditivo, no una reescritura, y no rompe ninguno
  de los cuatro lenguajes anteriores (ver el test en
  `codeParser.test.ts` que cubre este caso específicamente).

## Resaltado de sintaxis real (opcional, independiente de todo lo anterior)

Todo lo descrito arriba (transpilación, autocompletado, modo Bloques)
funciona sin ninguna gramática TextMate real. Pero el **coloreado real
de sintaxis en el editor de texto** (`source.go` con syntax highlighting
completo, no solo Spanish injection) necesita una gramática TextMate
bundleada — ese es un contenido a *vendorizar*, no código a escribir.

Hoy, `extensions/` solo trae `cpp`, `java` y `python` bundleados de
fábrica; Go se puede "instalar" desde el panel de Extensiones simulado,
pero esa instalación no adjunta todavía una gramática real
(`grammars: []` en `extensionsPanel.ts`), así que un archivo `.go` cae de
vuelta al tokenizer básico que Monaco trae incluido para Go (que sí
reconoce el Go real, solo que sin las palabras clave en español
coloreadas).

Esto es intencional y no bloquea nada: `getMonacoLangId()` (en
`monacoLanguage.ts`) solo activa el id de Monaco con inyección de español
(`hydra-<lang>-<humano>`) cuando **ambas** cosas existen — un mapping
registrado *y* una gramática real bundleada para ese `progLang`
(`getScopeForLang(progLang)` no vacío). Sin gramática, cae automáticamente
al id de Monaco plano, que sigue coloreando el Go real aunque no las
palabras en español. El autocompletado/hover en español sigue funcionando
igual, porque no depende de la gramática en absoluto.

Si en el futuro se bundlea una gramática real de Go en `extensions/go/`
(siguiendo el mismo formato `package.json` con `contributes.grammars` que
usan `java`/`cpp`/`python`), el resaltado de las palabras en español se
activa automáticamente — no hace falta tocar ningún código, porque
`grammarRegistry.ts` y `spanishInjection.ts` ya leen el `scopeName`
dinámicamente a partir del mapping, no de una lista fija.

## Probar tu mapping

El patrón de tests para un mapping nuevo, usando el de Go como referencia:

- **`genericGenerator.test.ts`**: registra `forBlock` para todos los tipos
  `hc_*` sin lanzar, y al menos un par de pruebas de integración reales
  contra bloques Blockly de verdad (headless — `blockly/core` no necesita
  DOM para `Blockly.CodeGenerator`/`Blockly.Workspace`) verificando la
  salida exacta de los casos menos obvios de tu plantilla (el `forStyle`
  elegido, el `statementTerminator`, cómo se envuelve `main`). Si tu
  mapping define `preamble`, prueba explícitamente que NO aparece cuando
  el bloque que lo dispara no se usó (el caso que importa de verdad si tu
  lenguaje trata un import sobrante como error, como Go).
- **`codeParser.test.ts`**: si tocaste algo en `codeParser.ts` (poco
  común — normalmente no hace falta), un test de round-trip mínimo.
- `npx tsc --noEmit`, `npx eslint <archivos tocados>`, `npx vitest run` —
  las tres deben quedar limpias antes de dar por terminado un mapping
  nuevo.

## Limitaciones conocidas

Documentadas aquí para que nadie las redescubra por sorpresa ni intente
"arreglarlas" sin querer al añadir un lenguaje:

- **`preamble` solo cubre `print`/`printError`, no cualquier construcción.**
  El código generado por bloques con Blocks mode ya trae los `import`/
  `#include` que necesitan imprimir en pantalla (ver `filePrefix` y
  `preamble` arriba), pero **NO** para otros posibles casos futuros —
  p. ej. si un mapping nuevo tuviera un tipo que necesitara un import
  propio (`vector`/`map` en C++ ya vienen de `<vector>`/`<map>`, no
  cubiertos hoy), o si `hc_lanzar`/`hc_intentar` necesitaran uno. La
  unión `PreambleKey` se amplía fácilmente el día que haga falta (ver la
  sección de arriba), pero hoy solo existen las dos claves con necesidad
  real demostrada. Además, esto **solo** aplica al código generado desde
  bloques — si escribes Spanish código a mano en el editor de texto
  (sin usar Blocks mode), sigues siendo responsable de tus propios
  `import`/`#include`, exactamente igual que en el lenguaje real.
- **Los paréntesis en condiciones de una sola cláusula son fijos.** El
  motor siempre envuelve `if`/`while`/`switch` entre paréntesis
  (`condHeader`). En Go esto es válido pero no idiomático — `gofmt` los
  quitaría. Se aceptó como limitación menor en vez de añadir un campo más
  al esquema solo por estética (a diferencia de `statementTerminator`,
  que si se dejaba sin resolver producía algo que un lector notaría como
  "raro" en cada línea, no solo en la cabecera de un bloque).
- **`switch`/`case` no tiene bloques dedicados.** `hc_cambiar` genera el
  contenedor; las etiquetas `caso`/`predeterminado` dentro solo
  sobreviven como texto libre si vienen de un round-trip
  código→bloques→código. Limitación heredada de los cuatro lenguajes
  originales, no introducida por este sistema.
- **`class` como aproximación de `struct` (C, Go) no soporta métodos
  anidados.** Un `hc_metodo` dentro de un `hc_clase` para estos dos
  lenguajes produce texto que no compila — la Blockly UI no impide
  anidar un método dentro de una clase aunque el lenguaje destino no lo
  permita ahí. No hay una validación de "qué bloques son válidos dentro
  de cuáles" en este sistema todavía.
