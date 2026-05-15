package unsa.elb_moi.compiler.ast;

import java.util.List;

public final class Ast {
    private Ast() {}

    public abstract static class Node {
        public final int line;
        protected Node(int line) { this.line = line; }
    }

    public static class Program extends Node {
        public final String       packageName;
        public final List<String> imports;
        public final List<ClassDecl> classes;
        public Program(String packageName, List<String> imports, List<ClassDecl> classes, int line) {
            super(line); this.packageName = packageName; this.imports = imports; this.classes = classes;
        }
    }

    public static class ClassDecl extends Node {
        public final List<String> modifiers;
        public final String       name;
        public final List<Member> members;
        public ClassDecl(List<String> modifiers, String name, List<Member> members, int line) {
            super(line); this.modifiers = modifiers; this.name = name; this.members = members;
        }
    }

    public abstract static class Member extends Node {
        public final List<String> modifiers;
        protected Member(List<String> modifiers, int line) { super(line); this.modifiers = modifiers; }
    }

    public static class FieldDecl extends Member {
        public final TypeRef type;
        public final String  name;
        public final Expr    init;
        public FieldDecl(List<String> mods, TypeRef type, String name, Expr init, int line) {
            super(mods, line); this.type = type; this.name = name; this.init = init;
        }
    }

    public static class MethodDecl extends Member {
        public final TypeRef      returnType;
        public final String       name;
        public final List<Param>  params;
        public final Block        body;
        public MethodDecl(List<String> mods, TypeRef ret, String name, List<Param> params, Block body, int line) {
            super(mods, line); this.returnType = ret; this.name = name; this.params = params; this.body = body;
        }
    }

    public static class Param extends Node {
        public final TypeRef type;
        public final String  name;
        public Param(TypeRef type, String name, int line) { super(line); this.type = type; this.name = name; }
    }

    public static class TypeRef extends Node {
        public final String name;
        public final int    dims;
        public TypeRef(String name, int dims, int line) { super(line); this.name = name; this.dims = dims; }
        @Override public String toString() { return name + "[]".repeat(dims); }
    }

    public abstract static class Stmt extends Node {
        protected Stmt(int line) { super(line); }
    }

    public static class Block extends Stmt {
        public final List<Stmt> stmts;
        public Block(List<Stmt> stmts, int line) { super(line); this.stmts = stmts; }
    }

    public static class VarDecl extends Stmt {
        public final TypeRef type;
        public final String  name;
        public final Expr    init;
        public VarDecl(TypeRef type, String name, Expr init, int line) {
            super(line); this.type = type; this.name = name; this.init = init;
        }
    }

    public static class IfStmt extends Stmt {
        public final Expr cond;
        public final Stmt then;
        public final Stmt else_;
        public IfStmt(Expr cond, Stmt then, Stmt else_, int line) {
            super(line); this.cond = cond; this.then = then; this.else_ = else_;
        }
    }

    public static class WhileStmt extends Stmt {
        public final Expr cond;
        public final Stmt body;
        public WhileStmt(Expr cond, Stmt body, int line) { super(line); this.cond = cond; this.body = body; }
    }

    public static class ForStmt extends Stmt {
        public final Stmt       init;
        public final Expr       cond;
        public final List<Expr> update;
        public final Stmt       body;
        public ForStmt(Stmt init, Expr cond, List<Expr> update, Stmt body, int line) {
            super(line); this.init = init; this.cond = cond; this.update = update; this.body = body;
        }
    }

    public static class ReturnStmt extends Stmt {
        public final Expr value;
        public ReturnStmt(Expr value, int line) { super(line); this.value = value; }
    }

    public static class ExprStmt extends Stmt {
        public final Expr expr;
        public ExprStmt(Expr expr, int line) { super(line); this.expr = expr; }
    }

    public abstract static class Expr extends Node {
        public String resolvedType = "?";
        protected Expr(int line) { super(line); }
    }

    public static class BinaryExpr extends Expr {
        public final String op;
        public final Expr   left, right;
        public BinaryExpr(String op, Expr left, Expr right, int line) {
            super(line); this.op = op; this.left = left; this.right = right;
        }
    }

    public static class UnaryExpr extends Expr {
        public final String op;
        public final Expr   operand;
        public UnaryExpr(String op, Expr operand, int line) {
            super(line); this.op = op; this.operand = operand;
        }
    }

    public static class PostfixExpr extends Expr {
        public final Expr   operand;
        public final String op;
        public PostfixExpr(Expr operand, String op, int line) {
            super(line); this.operand = operand; this.op = op;
        }
    }

    public static class AssignExpr extends Expr {
        public final Expr target, value;
        public final String op;
        public AssignExpr(Expr target, String op, Expr value, int line) {
            super(line); this.target = target; this.op = op; this.value = value;
        }
    }

    public static class NameExpr extends Expr {
        public final String name;
        public NameExpr(String name, int line) { super(line); this.name = name; }
    }

    public static class LiteralExpr extends Expr {
        public final Object value;
        public final String kind;
        public LiteralExpr(Object value, String kind, int line) {
            super(line); this.value = value; this.kind = kind; this.resolvedType = kind;
        }
    }

    public static class CallExpr extends Expr {
        public final Expr        callee;
        public final String      method;
        public final List<Expr>  args;
        public CallExpr(Expr callee, String method, List<Expr> args, int line) {
            super(line); this.callee = callee; this.method = method; this.args = args;
        }
    }

    public static class FieldAccessExpr extends Expr {
        public final Expr   object;
        public final String field;
        public FieldAccessExpr(Expr object, String field, int line) {
            super(line); this.object = object; this.field = field;
        }
    }

    public static class NewObjectExpr extends Expr {
        public final TypeRef    type;
        public final List<Expr> args;
        public NewObjectExpr(TypeRef type, List<Expr> args, int line) {
            super(line); this.type = type; this.args = args;
        }
    }

    public static class NewArrayExpr extends Expr {
        public final TypeRef elementType;
        public final Expr    size;
        public NewArrayExpr(TypeRef elementType, Expr size, int line) {
            super(line); this.elementType = elementType; this.size = size;
        }
    }
}
