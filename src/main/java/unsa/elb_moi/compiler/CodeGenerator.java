package unsa.elb_moi.compiler;

import unsa.elb_moi.compiler.ast.Ast;

import java.util.List;
import java.util.StringJoiner;

public class CodeGenerator {

    private final StringBuilder out  = new StringBuilder();
    private int tempCount  = 0;
    private int labelCount = 0;

    public String generate(Ast.Program program) {
        line("; ── HydraJ IR (" + program.classes.size() + " clase/s) ────────────────────────");
        if (program.packageName != null) line("; package " + program.packageName);
        program.imports.forEach(i -> line("; import " + i));
        out.append('\n');
        program.classes.forEach(this::genClass);
        return out.toString();
    }

    private void genClass(Ast.ClassDecl cls) {
        line(".class " + String.join(" ", cls.modifiers) + " " + cls.name);
        out.append('\n');
        for (Ast.Member m : cls.members) {
            if (m instanceof Ast.FieldDecl f) {
                line("  .field " + f.type + " " + f.name + (f.init != null ? " = " + litOf(f.init) : ""));
            }
        }
        out.append('\n');
        for (Ast.Member m : cls.members) {
            if (m instanceof Ast.MethodDecl md) genMethod(md);
        }
        line(".end class");
        out.append('\n');
    }

    private void genMethod(Ast.MethodDecl md) {
        StringJoiner params = new StringJoiner(", ");
        md.params.forEach(p -> params.add(p.type + " " + p.name));
        line("  .method " + String.join(" ", md.modifiers) + " " + md.returnType + " " + md.name + "(" + params + ")");
        if (md.body != null) genBlock(md.body, "    ");
        else line("    ; (abstracto / nativo)");
        line("  .end method");
        out.append('\n');
    }

    private void genBlock(Ast.Block block, String indent) {
        block.stmts.forEach(s -> genStmt(s, indent));
    }

    private void genStmt(Ast.Stmt s, String ind) {
        switch (s) {
            case Ast.VarDecl vd -> {
                if (vd.init != null) {
                    String src = genExpr(vd.init, ind);
                    line(ind + vd.name + " = " + src);
                } else {
                    line(ind + vd.name + " = " + defaultVal(vd.type.name));
                }
            }
            case Ast.ExprStmt es -> genExpr(es.expr, ind);
            case Ast.ReturnStmt rs -> {
                if (rs.value != null) { String v = genExpr(rs.value, ind); line(ind + "return " + v); }
                else                  line(ind + "return");
            }
            case Ast.IfStmt is_ -> {
                String cond = genExpr(is_.cond, ind);
                String lElse = newLabel(), lEnd = newLabel();
                line(ind + "if !" + cond + " goto " + lElse);
                genStmt(is_.then, ind + "  ");
                if (is_.else_ != null) {
                    line(ind + "goto " + lEnd);
                    line(ind + lElse + ":");
                    genStmt(is_.else_, ind + "  ");
                    line(ind + lEnd + ":");
                } else {
                    line(ind + lElse + ":");
                }
            }
            case Ast.WhileStmt ws -> {
                String lTop = newLabel(), lEnd = newLabel();
                line(ind + lTop + ":");
                String cond = genExpr(ws.cond, ind);
                line(ind + "if !" + cond + " goto " + lEnd);
                genStmt(ws.body, ind + "  ");
                line(ind + "goto " + lTop);
                line(ind + lEnd + ":");
            }
            case Ast.ForStmt fs -> {
                if (fs.init != null) genStmt(fs.init, ind);
                String lTop = newLabel(), lEnd = newLabel();
                line(ind + lTop + ":");
                if (fs.cond != null) {
                    String cond = genExpr(fs.cond, ind);
                    line(ind + "if !" + cond + " goto " + lEnd);
                }
                genStmt(fs.body, ind + "  ");
                fs.update.forEach(e -> genExpr(e, ind));
                line(ind + "goto " + lTop);
                line(ind + lEnd + ":");
            }
            case Ast.Block b -> genBlock(b, ind);
            default -> {}
        }
    }

    private String genExpr(Ast.Expr e, String ind) {
        return switch (e) {
            case Ast.LiteralExpr lit -> lit.value == null ? "null" :
                    lit.kind.equals("String") ? "\"" + lit.value + "\"" : String.valueOf(lit.value);
            case Ast.NameExpr n      -> n.name;
            case Ast.BinaryExpr bin  -> {
                String l = genExpr(bin.left, ind), r = genExpr(bin.right, ind);
                String t = newTemp();
                line(ind + t + " = " + l + " " + bin.op + " " + r);
                yield t;
            }
            case Ast.UnaryExpr un    -> {
                String v = genExpr(un.operand, ind), t = newTemp();
                line(ind + t + " = " + un.op + v);
                yield t;
            }
            case Ast.PostfixExpr pf  -> {
                String v = genExpr(pf.operand, ind), t = newTemp();
                line(ind + t + " = " + v);
                line(ind + v + " = " + v + " " + pf.op.charAt(0) + " 1");
                yield t;
            }
            case Ast.AssignExpr as   -> {
                String val = genExpr(as.value, ind);
                String tgt = genExpr(as.target, ind);
                String rhs = as.op.equals("=") ? val : tgt + " " + as.op.charAt(0) + " " + val;
                line(ind + tgt + " = " + rhs);
                yield tgt;
            }
            case Ast.FieldAccessExpr fa -> {
                String obj = genExpr(fa.object, ind);
                yield obj + "." + fa.field;
            }
            case Ast.CallExpr call   -> {
                String recv = call.callee != null ? genExpr(call.callee, ind) + "." + call.method : call.method;
                StringJoiner args = new StringJoiner(", ");
                call.args.forEach(a -> args.add(genExpr(a, ind)));
                String t = newTemp();
                line(ind + t + " = call " + recv + "(" + args + ")");
                yield t;
            }
            case Ast.NewObjectExpr no -> {
                StringJoiner args = new StringJoiner(", ");
                no.args.forEach(a -> args.add(genExpr(a, ind)));
                String t = newTemp();
                line(ind + t + " = new " + no.type.name + "(" + args + ")");
                yield t;
            }
            case Ast.NewArrayExpr na -> {
                String sz = genExpr(na.size, ind), t = newTemp();
                line(ind + t + " = newarray " + na.elementType.name + "[" + sz + "]");
                yield t;
            }
            default -> "?";
        };
    }

    private static String litOf(Ast.Expr e) {
        if (e instanceof Ast.LiteralExpr l) return l.value == null ? "null" : String.valueOf(l.value);
        return "...";
    }

    private static String defaultVal(String type) {
        return switch (type) { case "int","long","char" -> "0"; case "double" -> "0.0"; case "boolean" -> "false"; default -> "null"; };
    }

    private String newTemp()  { return "t" + tempCount++; }
    private String newLabel() { return "L" + labelCount++; }
    private void   line(String s) { out.append(s).append('\n'); }
}
