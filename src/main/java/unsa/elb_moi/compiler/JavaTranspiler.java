package unsa.elb_moi.compiler;

import unsa.elb_moi.compiler.ast.Ast;
import java.util.StringJoiner;

public class JavaTranspiler {

    private final StringBuilder out = new StringBuilder();

    public String transpile(Ast.Program program) {
        if (program.packageName != null) {
            out.append("package ").append(program.packageName).append(";\n\n");
        }
        program.imports.forEach(i -> out.append("import ").append(i).append(";\n"));
        out.append('\n');
        program.classes.forEach(this::genClass);
        return out.toString();
    }

    private void genClass(Ast.ClassDecl cls) {
        out.append("public class ").append(cls.name).append(" {\n");
        for (Ast.Member m : cls.members) {
            if (m instanceof Ast.FieldDecl f) {
                out.append("    ").append(typeJava(f.type.name)).append(" ").append(f.name);
                if (f.init != null) out.append(" = ").append(exprToJava(f.init));
                out.append(";\n");
            }
        }
        for (Ast.Member m : cls.members) {
            if (m instanceof Ast.MethodDecl md) genMethod(md);
        }
        out.append("}\n\n");
    }

    private void genMethod(Ast.MethodDecl md) {
        StringJoiner params = new StringJoiner(", ");
        md.params.forEach(p -> params.add(typeJava(p.type.name) + " " + p.name));
        out.append("    public static ").append(typeJava(md.returnType.name)).append(" ").append(md.name)
                .append("(").append(params).append(")");
        if (md.body != null) {
            out.append(" {\n");
            md.body.stmts.forEach(s -> out.append(stmtToJava(s, "        ")));
            out.append("    }\n");
        } else {
            out.append(";\n");
        }
    }

    private String stmtToJava(Ast.Stmt s, String ind) {
        if (s == null) return "";
        switch (s) {
            case Ast.VarDecl vd -> {
                return ind + typeJava(vd.type.name) + " " + vd.name +
                        (vd.init != null ? " = " + exprToJava(vd.init) : "") + ";\n";
            }
            case Ast.ExprStmt es -> {
                return ind + exprToJava(es.expr) + ";\n";
            }
            case Ast.ReturnStmt rs -> {
                return ind + "return" + (rs.value != null ? " " + exprToJava(rs.value) : "") + ";\n";
            }
            case Ast.IfStmt is_ -> {
                var sb = new StringBuilder();
                sb.append(ind).append("if (").append(exprToJava(is_.cond)).append(") {\n");
                sb.append(stmtToJava(is_.then, ind + "    "));
                sb.append(ind).append("}");
                if (is_.else_ != null) {
                    sb.append(" else {\n");
                    sb.append(stmtToJava(is_.else_, ind + "    "));
                    sb.append(ind).append("}");
                }
                sb.append('\n');
                return sb.toString();
            }
            case Ast.WhileStmt ws -> {
                var sb = new StringBuilder();
                sb.append(ind).append("while (").append(exprToJava(ws.cond)).append(") {\n");
                sb.append(stmtToJava(ws.body, ind + "    "));
                sb.append(ind).append("}\n");
                return sb.toString();
            }
            case Ast.ForStmt fs -> {
                var sb = new StringBuilder();
                sb.append(ind).append("for (");
                if (fs.init != null) sb.append(stmtToJava(fs.init, "").replace("\n", ""));
                else sb.append("; ");
                if (fs.cond != null) sb.append(exprToJava(fs.cond));
                sb.append("; ");
                if (fs.update != null && !fs.update.isEmpty()) {
                    var it = fs.update.iterator();
                    sb.append(exprToJava(it.next()));
                    while (it.hasNext()) sb.append(", ").append(exprToJava(it.next()));
                }
                sb.append(") {\n")
                        .append(stmtToJava(fs.body, ind + "    "))
                        .append(ind).append("}\n");
                return sb.toString();
            }
            case Ast.Block block -> {
                var sb = new StringBuilder();
                for (Ast.Stmt st : block.stmts) sb.append(stmtToJava(st, ind));
                return sb.toString();
            }
            default -> { return ""; }
        }
    }

    private String exprToJava(Ast.Expr e) {
        return switch (e) {
            case Ast.LiteralExpr lit -> lit.value == null ? "null" :
                    lit.kind.equals("cadena") || lit.kind.equals("String") ? "\"" + lit.value + "\"" : String.valueOf(lit.value);
            case Ast.NameExpr n      -> n.name;
            case Ast.BinaryExpr bin  -> exprToJava(bin.left) + " " + bin.op + " " + exprToJava(bin.right);
            case Ast.UnaryExpr un    -> un.op + exprToJava(un.operand);
            case Ast.PostfixExpr pf  -> exprToJava(pf.operand) + pf.op;
            case Ast.AssignExpr as   -> exprToJava(as.target) + " " + as.op + " " + exprToJava(as.value);
            case Ast.FieldAccessExpr fa -> exprToJava(fa.object) + "." + fa.field;
            case Ast.CallExpr call -> {
                String method = call.method;
                StringJoiner args = new StringJoiner(", ");
                call.args.forEach(a -> args.add(exprToJava(a)));
                if (method.equals("imprimirln")) {
                    yield "System.out.println(" + args + ")";
                } else if (method.equals("imprimir")) {
                    yield "System.out.print(" + args + ")";
                } else {
                    String recv = call.callee != null ? exprToJava(call.callee) + "." + call.method : call.method;
                    yield recv + "(" + args + ")";
                }
            }
            case Ast.NewObjectExpr no -> {
                StringJoiner args = new StringJoiner(", ");
                no.args.forEach(a -> args.add(exprToJava(a)));
                yield "new " + typeJava(no.type.name) + "(" + args + ")";
            }
            case Ast.NewArrayExpr na -> "new " + typeJava(na.elementType.name) + "[" + exprToJava(na.size) + "]";
            default -> "?";
        };
    }

    private String typeJava(String src) {
        return switch (src) {
            case "entero" -> "int";
            case "doble" -> "double";
            case "booleano" -> "boolean";
            case "cadena" -> "String";
            case "vacio" -> "void";
            default -> src;
        };
    }
}