package unsa.elb_moi.compiler;

import unsa.elb_moi.compiler.ast.Ast;

import java.util.*;

public class SemanticAnalyzer {

    private final List<String> errors   = new ArrayList<>();
    private final List<String> warnings = new ArrayList<>();

    public List<String> getErrors()   { return errors; }
    public List<String> getWarnings() { return warnings; }

    private static class Scope {
        final Scope parent;
        final Map<String, String> symbols = new LinkedHashMap<>();
        Scope(Scope parent) { this.parent = parent; }

        String resolve(String name) {
            if (symbols.containsKey(name)) return symbols.get(name);
            return parent != null ? parent.resolve(name) : null;
        }

        boolean define(String name, String type) {
            if (symbols.containsKey(name)) return false;
            symbols.put(name, type); return true;
        }
    }

    public void analyze(Ast.Program program) {
        Scope global = new Scope(null);
        global.define("System", "System");
        global.define("Math",   "Math");

        for (Ast.ClassDecl cls : program.classes) analyzeClass(cls, global);
    }

    private void analyzeClass(Ast.ClassDecl cls, Scope parent) {
        Scope scope = new Scope(parent);
        scope.define("this", cls.name);
        for (Ast.Member m : cls.members) {
            if (m instanceof Ast.FieldDecl f) {
                if (!scope.define(f.name, f.type.toString()))
                    error(f.line, "Campo '" + f.name + "' ya declarado en '" + cls.name + "'");
            }
        }
        for (Ast.Member m : cls.members) {
            if (m instanceof Ast.MethodDecl md) analyzeMethod(md, scope);
            else if (m instanceof Ast.FieldDecl fd && fd.init != null) resolveExpr(fd.init, scope);
        }
    }

    private void analyzeMethod(Ast.MethodDecl md, Scope parent) {
        Scope scope = new Scope(parent);
        for (Ast.Param p : md.params) {
            if (!scope.define(p.name, p.type.toString()))
                error(p.line, "Parámetro duplicado '" + p.name + "'");
        }
        if (md.body != null) analyzeBlock(md.body, scope, md.returnType.toString());
    }

    private void analyzeBlock(Ast.Block block, Scope parent, String returnType) {
        Scope scope = new Scope(parent);
        for (Ast.Stmt s : block.stmts) analyzeStmt(s, scope, returnType);
    }

    private void analyzeStmt(Ast.Stmt s, Scope scope, String returnType) {
        switch (s) {
            case Ast.VarDecl vd -> {
                if (vd.init != null) {
                    String t = resolveExpr(vd.init, scope);
                    if (!t.equals("?") && !compatible(vd.type.name, t))
                        warning(vd.line, "Posible incompatibilidad: se asigna '" + t + "' a '" + vd.type + "'");
                }
                if (!scope.define(vd.name, vd.type.toString()))
                    error(vd.line, "Variable '" + vd.name + "' ya declarada en este ámbito");
            }
            case Ast.IfStmt is_ -> {
                resolveExpr(is_.cond, scope);
                analyzeStmt(is_.then, new Scope(scope), returnType);
                if (is_.else_ != null) analyzeStmt(is_.else_, new Scope(scope), returnType);
            }
            case Ast.WhileStmt ws -> {
                resolveExpr(ws.cond, scope);
                analyzeStmt(ws.body, new Scope(scope), returnType);
            }
            case Ast.ForStmt fs -> {
                Scope forScope = new Scope(scope);
                if (fs.init != null) analyzeStmt(fs.init, forScope, returnType);
                if (fs.cond != null) resolveExpr(fs.cond, forScope);
                fs.update.forEach(e -> resolveExpr(e, forScope));
                analyzeStmt(fs.body, new Scope(forScope), returnType);
            }
            case Ast.ReturnStmt rs -> {
                String t = rs.value != null ? resolveExpr(rs.value, scope) : "void";
                if (!compatible(returnType, t))
                    warning(rs.line, "Tipo de retorno '" + t + "' no coincide con '" + returnType + "'");
            }
            case Ast.ExprStmt es -> resolveExpr(es.expr, scope);
            case Ast.Block b     -> analyzeBlock(b, scope, returnType);
            default -> {}
        }
    }

    private String resolveExpr(Ast.Expr e, Scope scope) {
        String t = doResolve(e, scope);
        e.resolvedType = t;
        return t;
    }

    private String doResolve(Ast.Expr e, Scope scope) {
        return switch (e) {
            case Ast.LiteralExpr lit    -> lit.kind;
            case Ast.NameExpr name      -> {
                String t = scope.resolve(name.name);
                if (t == null) { error(name.line, "Símbolo no declarado: '" + name.name + "'"); yield "?"; }
                yield t;
            }
            case Ast.BinaryExpr bin     -> {
                String l = resolveExpr(bin.left,  scope);
                String r = resolveExpr(bin.right, scope);
                yield isComparison(bin.op) ? "boolean" : dominantType(l, r);
            }
            case Ast.UnaryExpr un       -> resolveExpr(un.operand, scope);
            case Ast.PostfixExpr pf     -> resolveExpr(pf.operand, scope);
            case Ast.AssignExpr as      -> {
                resolveExpr(as.target, scope);
                yield resolveExpr(as.value,  scope);
            }
            case Ast.FieldAccessExpr fa -> {
                resolveExpr(fa.object, scope);
                yield "?";
            }
            case Ast.CallExpr call      -> {
                if (call.callee != null) resolveExpr(call.callee, scope);
                call.args.forEach(a -> resolveExpr(a, scope));
                yield "?";
            }
            case Ast.NewObjectExpr no   -> { no.args.forEach(a -> resolveExpr(a, scope)); yield no.type.name; }
            case Ast.NewArrayExpr na    -> { resolveExpr(na.size, scope); yield na.elementType.name + "[]"; }
            default -> "?";
        };
    }

    private static boolean isComparison(String op) {
        return op.equals("==") || op.equals("!=") || op.equals("<") || op.equals(">") || op.equals("<=") || op.equals(">=");
    }

    private static String dominantType(String a, String b) {
        if (a.equals("String") || b.equals("String")) return "String";
        if (a.equals("double") || b.equals("double")) return "double";
        if (a.equals("long")   || b.equals("long"))   return "long";
        if (a.equals("int")    || b.equals("int"))    return "int";
        return a.equals("?") ? b : a;
    }

    private static boolean compatible(String declared, String actual) {
        if (declared.equals(actual) || actual.equals("?") || declared.equals("?")) return true;
        if (declared.equals("double") && (actual.equals("int") || actual.equals("long"))) return true;
        if (declared.equals("long")   &&  actual.equals("int")) return true;
        return false;
    }

    private void error(int line, String msg)   { errors.add("Línea " + line + ": [ERROR] " + msg); }
    private void warning(int line, String msg) { warnings.add("Línea " + line + ": [WARN]  " + msg); }
}
