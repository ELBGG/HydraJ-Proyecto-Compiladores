package unsa.elb_moi.compiler;

import unsa.elb_moi.compiler.ast.Ast;

import java.util.*;

/**
 * Analizador semántico para HydraJ.
 */
public class SemanticAnalyzer {

    private final List<String> errors   = new ArrayList<>();
    private final List<String> warnings = new ArrayList<>();

    public List<String> getErrors()   { return errors; }
    public List<String> getWarnings() { return warnings; }

    // ── Descripción de un método ─────────────────────────────────────────────
    private record MethodSig(String returnType, int arity) {}

    // ── Ámbito de nombres ────────────────────────────────────────────────────
    private static class Scope {
        final Scope parent;
        // nombre → tipo
        final Map<String, String>  types   = new LinkedHashMap<>();
        // nombre → ¿fue inicializado?
        final Map<String, Boolean> inited  = new LinkedHashMap<>();
        // nombre → ¿fue usado?
        final Map<String, Boolean> used    = new LinkedHashMap<>();

        Scope(Scope parent) { this.parent = parent; }

        /** Busca el tipo de un símbolo subiendo en la cadena de ámbitos. */
        String resolveType(String name) {
            if (types.containsKey(name)) return types.get(name);
            return parent != null ? parent.resolveType(name) : null;
        }

        /** Marca un símbolo como usado (recorre la cadena). */
        void markUsed(String name) {
            if (types.containsKey(name)) { used.put(name, true); return; }
            if (parent != null) parent.markUsed(name);
        }

        /** ¿El símbolo está inicializado? (recorre la cadena). */
        boolean isInited(String name) {
            if (types.containsKey(name)) return inited.getOrDefault(name, false);
            return parent != null && parent.isInited(name);
        }

        /**
         * Define un nuevo símbolo en este ámbito.
         * @return false si ya existía en el mismo ámbito (duplicado).
         */
        boolean define(String name, String type, boolean initialized) {
            if (types.containsKey(name)) return false;
            types.put(name, type);
            inited.put(name, initialized);
            used.put(name, false);
            return true;
        }

        /** Emite advertencias para variables locales no usadas. */
        List<String> unusedLocals() {
            List<String> list = new ArrayList<>();
            for (var e : used.entrySet()) {
                if (!e.getValue() && !e.getKey().equals("this")) list.add(e.getKey());
            }
            return list;
        }
    }

    // ── Tabla de métodos global (clase → nombre → firma) ─────────────────────
    private final Map<String, Map<String, MethodSig>> methodTable = new HashMap<>();

    // ════════════════════════════════════════════════════════════════════════════
    public void analyze(Ast.Program program) {
        Scope global = new Scope(null);

        // Tipos predefinidos del sistema
        global.define("System", "System", true);
        global.define("Math",   "Math",   true);

        // ── Pase 1: recopilar firmas de métodos de todas las clases ────────────
        for (Ast.ClassDecl cls : program.classes) {
            Map<String, MethodSig> methods = new LinkedHashMap<>();
            methodTable.put(cls.name, methods);
            for (Ast.Member m : cls.members) {
                if (m instanceof Ast.MethodDecl md) {
                    methods.put(md.name, new MethodSig(md.returnType.name, md.params.size()));
                }
            }
        }

        // ── Pase 2: análisis completo ──────────────────────────────────────────
        for (Ast.ClassDecl cls : program.classes) {
            analyzeClass(cls, global);
        }
    }

    // ── Clase ────────────────────────────────────────────────────────────────
    private void analyzeClass(Ast.ClassDecl cls, Scope parent) {
        Scope scope = new Scope(parent);
        scope.define("this", cls.name, true);

        // Registrar campos
        for (Ast.Member m : cls.members) {
            if (m instanceof Ast.FieldDecl f) {
                boolean hasInit = f.init != null;
                if (!scope.define(f.name, f.type.toString(), hasInit))
                    error(f.line, "Campo '" + f.name + "' ya declarado en '" + cls.name + "'");
            }
        }

        // Analizar campos e inicializadores
        for (Ast.Member m : cls.members) {
            if (m instanceof Ast.FieldDecl fd && fd.init != null)
                resolveExpr(fd.init, scope);
        }

        // Analizar métodos
        for (Ast.Member m : cls.members) {
            if (m instanceof Ast.MethodDecl md) analyzeMethod(md, scope, cls.name);
        }
    }

    // ── Método ───────────────────────────────────────────────────────────────
    private void analyzeMethod(Ast.MethodDecl md, Scope parent, String className) {
        Scope scope = new Scope(parent);

        for (Ast.Param p : md.params) {
            if (!scope.define(p.name, p.type.toString(), true))
                error(p.line, "Parametro duplicado '" + p.name + "'");
        }

        if (md.body != null) {
            boolean hasReturn = analyzeBlock(md.body, scope, md.returnType.name);

            // Si no es void y no encontramos un retorno, advertir
            if (!md.returnType.name.equals("vacio") && !hasReturn) {
                warning(md.line, "El metodo '" + md.name +
                        "' deberia retornar '" + md.returnType.name + "' pero no tiene 'retornar'");
            }
        }

        // Variables no usadas en este ámbito
        for (String unused : scope.unusedLocals()) {
            if (!md.params.stream().anyMatch(p -> p.name.equals(unused)))
                warning(md.line, "Variable '" + unused + "' declarada en '" + md.name + "' pero no usada");
        }
    }

    // ── Bloque  (devuelve true si siempre retorna) ───────────────────────────
    private boolean analyzeBlock(Ast.Block block, Scope parent, String returnType) {
        Scope scope = new Scope(parent);
        boolean alwaysReturns = false;

        for (int i = 0; i < block.stmts.size(); i++) {
            Ast.Stmt s = block.stmts.get(i);

            if (alwaysReturns) {
                warning(s.line, "Codigo inalcanzable despues de 'retornar'");
                break;
            }

            boolean stmtReturns = analyzeStmt(s, scope, returnType);
            if (stmtReturns) alwaysReturns = true;
        }

        // Variables locales no usadas (sólo en este scope, no en el padre)
        for (String unused : scope.unusedLocals()) {
            warning(block.line, "Variable local '" + unused + "' declarada pero no usada");
        }

        return alwaysReturns;
    }

    // ── Sentencia (devuelve true si siempre retorna) ─────────────────────────
    private boolean analyzeStmt(Ast.Stmt s, Scope scope, String returnType) {
        return switch (s) {

            case Ast.VarDecl vd -> {
                String initType = "?";
                if (vd.init != null) {
                    initType = resolveExpr(vd.init, scope);
                    // División por cero literal
                    checkLiteralDivByZero(vd.init);
                }
                boolean initialized = vd.init != null;

                if (!scope.define(vd.name, vd.type.toString(), initialized))
                    error(vd.line, "Variable '" + vd.name + "' ya declarada en este ambito");

                if (!initType.equals("?") && !compatible(vd.type.name, initType))
                    warning(vd.line, "Posible incompatibilidad: se asigna '" +
                            initType + "' a '" + vd.type + "'");

                // Advertir si se usa un tipo booleano en contexto numérico
                if (vd.type.name.equals("entero") && initType.equals("booleano"))
                    error(vd.line, "No se puede asignar booleano a entero");

                yield false;
            }

            case Ast.IfStmt is_ -> {
                String condType = resolveExpr(is_.cond, scope);
                if (!condType.equals("?") && !condType.equals("booleano"))
                    warning(is_.line, "La condicion del 'si' deberia ser booleana, se recibio '" + condType + "'");

                boolean thenRet  = analyzeStmt(is_.then,  new Scope(scope), returnType);
                boolean elseRet  = is_.else_ != null
                        && analyzeStmt(is_.else_, new Scope(scope), returnType);
                yield thenRet && elseRet;   // retorna siempre sólo si ambas ramas retornan
            }

            case Ast.WhileStmt ws -> {
                String condType = resolveExpr(ws.cond, scope);
                if (!condType.equals("?") && !condType.equals("booleano"))
                    warning(ws.line, "La condicion del 'mientras' deberia ser booleana");
                analyzeStmt(ws.body, new Scope(scope), returnType);
                yield false;    // no garantiza retorno (puede no ejecutarse)
            }

            case Ast.ForStmt fs -> {
                Scope forScope = new Scope(scope);
                if (fs.init != null) analyzeStmt(fs.init, forScope, returnType);
                if (fs.cond != null) resolveExpr(fs.cond, forScope);
                fs.update.forEach(e -> resolveExpr(e, forScope));
                analyzeStmt(fs.body, new Scope(forScope), returnType);
                yield false;
            }

            case Ast.ReturnStmt rs -> {
                String actual = rs.value != null ? resolveExpr(rs.value, scope) : "vacio";
                if (!compatible(returnType, actual))
                    warning(rs.line, "Retorna '" + actual + "' pero se esperaba '" + returnType + "'");
                yield true;     // esta rama siempre retorna
            }

            case Ast.ExprStmt es -> {
                resolveExpr(es.expr, scope);
                checkLiteralDivByZero(es.expr);
                yield false;
            }

            case Ast.Block b -> { yield analyzeBlock(b, scope, returnType); }

            default -> false;
        };
    }

    // ── Expresión ────────────────────────────────────────────────────────────
    private String resolveExpr(Ast.Expr e, Scope scope) {
        String t = doResolve(e, scope);
        e.resolvedType = t;
        return t;
    }

    private String doResolve(Ast.Expr e, Scope scope) {
        return switch (e) {

            case Ast.LiteralExpr lit -> lit.kind;

            case Ast.NameExpr name -> {
                String t = scope.resolveType(name.name);
                if (t == null) {
                    error(name.line, "Simbolo no declarado: '" + name.name + "'");
                    yield "?";
                }
                // Advertir si se usa sin haber inicializado
                if (!scope.isInited(name.name))
                    warning(name.line, "Variable '" + name.name + "' usada sin inicializar");
                scope.markUsed(name.name);
                yield t;
            }

            case Ast.BinaryExpr bin -> {
                String l = resolveExpr(bin.left,  scope);
                String r = resolveExpr(bin.right, scope);

                // Booleano en operador aritmético
                if (isArithmetic(bin.op) && (l.equals("booleano") || r.equals("booleano")))
                    error(bin.line, "Operador '" + bin.op + "' no aplica a tipo booleano");

                // Cadena en operador no-suma aritmético
                if (!bin.op.equals("+") && (l.equals("cadena") || r.equals("cadena")))
                    warning(bin.line, "Operador '" + bin.op + "' sobre cadena puede dar resultado inesperado");

                yield isComparison(bin.op) ? "booleano" : dominantType(l, r);
            }

            case Ast.UnaryExpr un -> {
                String t = resolveExpr(un.operand, scope);
                if (un.op.equals("!") && !t.equals("booleano") && !t.equals("?"))
                    error(un.line, "Operador '!' solo aplica a booleano");
                yield t;
            }

            case Ast.PostfixExpr pf -> {
                String t = resolveExpr(pf.operand, scope);
                if (!t.equals("entero") && !t.equals("doble") && !t.equals("?"))
                    warning(pf.line, "Operador '" + pf.op + "' sobre tipo '" + t + "'");
                yield t;
            }

            case Ast.AssignExpr as -> {
                String tgt = resolveExpr(as.target, scope);
                String val = resolveExpr(as.value,  scope);
                if (!compatible(tgt, val) && !tgt.equals("?") && !val.equals("?"))
                    warning(as.line, "Asignacion: incompatibilidad '" + val + "' → '" + tgt + "'");
                // Marcar como inicializado si la izquierda es un nombre
                if (as.target instanceof Ast.NameExpr ne) {
                    // actualizar inited en el scope donde está definido
                    markInited(scope, ne.name);
                }
                yield val;
            }

            case Ast.FieldAccessExpr fa -> {
                resolveExpr(fa.object, scope);
                yield "?";   // sin información de tipo de campo externo
            }

            case Ast.CallExpr call -> {
                if (call.callee != null) resolveExpr(call.callee, scope);
                call.args.forEach(a -> resolveExpr(a, scope));

                // Verificar aridad si conocemos el método
                String ret = checkCall(call, scope);
                yield ret;
            }

            case Ast.NewObjectExpr no -> {
                no.args.forEach(a -> resolveExpr(a, scope));
                yield no.type.name;
            }

            case Ast.NewArrayExpr na -> {
                String szType = resolveExpr(na.size, scope);
                if (!szType.equals("entero") && !szType.equals("?"))
                    warning(na.line, "El tamanio del arreglo deberia ser entero");
                yield na.elementType.name + "[]";
            }

            default -> "?";
        };
    }

    /** Verifica la llamada a un método conocido (aridad). */
    private String checkCall(Ast.CallExpr call, Scope scope) {
        // Llamadas simples (sin callee)
        if (call.callee == null) {
            for (var entry : methodTable.entrySet()) {
                MethodSig sig = entry.getValue().get(call.method);
                if (sig != null) {
                    if (call.args.size() != sig.arity())
                        error(call.line, "La funcion '" + call.method + "' espera " +
                                sig.arity() + " argumento(s), se dieron " + call.args.size());
                    return sig.returnType();
                }
            }
        }
        // imprimirln / imprimir no generan error de aridad
        if (call.method.equals("imprimirln") || call.method.equals("imprimir")) return "vacio";
        return "?";
    }

    /** Marca un símbolo como inicializado, buscando en la cadena de scopes. */
    private static void markInited(Scope scope, String name) {
        if (scope == null) return;
        if (scope.types.containsKey(name)) { scope.inited.put(name, true); return; }
        markInited(scope.parent, name);
    }

    /** Detecta división por cero literal (ej. x / 0 o x % 0). */
    private void checkLiteralDivByZero(Ast.Expr e) {
        if (e instanceof Ast.BinaryExpr bin) {
            if ((bin.op.equals("/") || bin.op.equals("%")) && bin.right instanceof Ast.LiteralExpr lit) {
                Object v = lit.value;
                if ((v instanceof Integer i && i == 0) || (v instanceof Double d && d == 0.0))
                    error(bin.line, "Division por cero detectada");
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static boolean isComparison(String op) {
        return switch (op) { case "==","!=","<",">","<=",">=" -> true; default -> false; };
    }

    private static boolean isArithmetic(String op) {
        return switch (op) { case "+","-","*","/","%" -> true; default -> false; };
    }

    private static String dominantType(String a, String b) {
        if (a.equals("cadena") || b.equals("cadena")) return "cadena";
        if (a.equals("doble")  || b.equals("doble"))  return "doble";
        if (a.equals("entero") || b.equals("entero")) return "entero";
        if (a.equals("booleano")|| b.equals("booleano")) return "booleano";
        return a.equals("?") ? b : a;
    }

    private static boolean compatible(String declared, String actual) {
        if (declared.equals(actual))    return true;
        if (actual.equals("?") || declared.equals("?")) return true;
        // entero → doble es implícito
        if (declared.equals("doble") && actual.equals("entero")) return true;
        // vacio en retorno sin valor
        if (declared.equals("vacio") && actual.equals("vacio"))  return true;
        return false;
    }

    private void error(int line, String msg)   { errors.add("Linea " + line + ": [ERROR] " + msg); }
    private void warning(int line, String msg) { warnings.add("Linea " + line + ": [WARN]  " + msg); }
}