package unsa.elb_moi.compiler;

import unsa.elb_moi.compiler.ast.Ast;
import java.util.ArrayList;
import java.util.List;

public class Parser {

    private final List<Token> tokens;
    private int pos = 0;
    private final List<String> errors = new ArrayList<>();

    public Parser(List<Token> tokens) { this.tokens = tokens; }
    public List<String> getErrors() { return errors; }

    private Token cur() { return tokens.get(Math.min(pos, tokens.size() - 1)); }
    private Token peek(int n) { return tokens.get(Math.min(pos + n, tokens.size() - 1)); }
    private boolean is(TokenType t) { return cur().type == t; }
    private boolean is(int off, TokenType t) { return peek(off).type == t; }
    private int line() { return cur().line; }

    private Token eat() { return tokens.get(pos < tokens.size() ? pos++ : pos); }
    private Token eat(TokenType t) {
        if (!is(t)) { err("Se esperaba " + t + " pero se encontró '" + cur().value + "'"); return cur(); }
        return eat();
    }
    private boolean match(TokenType t) { if (is(t)) { eat(); return true; } return false; }
    private static final int MAX_ERRORS = 20;

    private void err(String msg) {
        if (errors.size() < MAX_ERRORS)
            errors.add("Línea " + cur().line + ": " + msg);
    }

    private void sync() {
        while (!is(TokenType.EOF)) {
            TokenType t = eat().type;
            if (t == TokenType.PUNTO_COMA || t == TokenType.LLAVE_DER) break;
        }
    }

    public Ast.Program parse() {
        int l = line();
        String pkg = null;
        // No hay soporte para package/import en tu lexer español, omite.

        List<String> imports = new ArrayList<>();
        // Mismo motivo, ignora imports.

        List<Ast.ClassDecl> classes = new ArrayList<>();
        while (!is(TokenType.EOF) && errors.size() < MAX_ERRORS) {
            int before = pos;
            Ast.ClassDecl cd = parseClass();
            if (cd != null) classes.add(cd);
            if (pos == before) { eat(); }
        }
        return new Ast.Program(pkg, imports, classes, l);
    }

    private Ast.ClassDecl parseClass() {
        int l = line();
        List<String> mods = parseMods();
        if (!is(TokenType.CLASE)) { err("Se esperaba 'clase'"); return null; }
        eat();
        String name = eat(TokenType.IDENTIFICADOR).value;
        eat(TokenType.LLAVE_IZQ);
        List<Ast.Member> members = new ArrayList<>();
        while (!is(TokenType.LLAVE_DER) && !is(TokenType.EOF) && errors.size() < MAX_ERRORS) {
            int before = pos;
            Ast.Member m = parseMember();
            if (m != null) members.add(m);
            if (pos == before) { eat(); }
        }
        eat(TokenType.LLAVE_DER);
        return new Ast.ClassDecl(mods, name, members, l);
    }

    private Ast.Member parseMember() {
        int l = line();
        List<String> mods = parseMods();
        if (is(TokenType.FUNCION)) {
            eat(); // Consumir 'funcion'
            Ast.TypeRef type = parseType();
            String name = eat(TokenType.IDENTIFICADOR).value;
            if (is(TokenType.PARENTESIS_IZQ)) return parseMethod(mods, type, name, l);
            err("Se esperaba '(' después del nombre de la función");
            sync();
            return null;
        } else if (isTypeStart()) {
            Ast.TypeRef type = parseType();
            String name = eat(TokenType.IDENTIFICADOR).value;
            return parseField(mods, type, name, l);
        } else {
            err("Se esperaba tipo de miembro");
            sync();
            return null;
        }
    }

    private Ast.Member parseMethod(List<String> mods, Ast.TypeRef ret, String name, int l) {
        eat(TokenType.PARENTESIS_IZQ);
        List<Ast.Param> params = new ArrayList<>();
        while (!is(TokenType.PARENTESIS_DER) && !is(TokenType.EOF)) {
            Ast.TypeRef pt = parseType();
            String pn = eat(TokenType.IDENTIFICADOR).value;
            params.add(new Ast.Param(pt, pn, l));
            if (!is(TokenType.PARENTESIS_DER)) eat(TokenType.COMA);
        }
        eat(TokenType.PARENTESIS_DER);
        if (is(TokenType.PUNTO_COMA)) { eat(); return new Ast.MethodDecl(mods, ret, name, params, null, l); }
        Ast.Block body = parseBlock();
        return new Ast.MethodDecl(mods, ret, name, params, body, l);
    }

    private Ast.Member parseField(List<String> mods, Ast.TypeRef type, String name, int l) {
        Ast.Expr init = null;
        if (match(TokenType.IGUAL)) init = parseExpr();
        eat(TokenType.PUNTO_COMA);
        return new Ast.FieldDecl(mods, type, name, init, l);
    }

    private Ast.Block parseBlock() {
        int l = line();
        eat(TokenType.LLAVE_IZQ);
        List<Ast.Stmt> stmts = new ArrayList<>();
        while (!is(TokenType.LLAVE_DER) && !is(TokenType.EOF) && errors.size() < MAX_ERRORS) {
            int before = pos;
            Ast.Stmt s = parseStmt();
            if (s != null) stmts.add(s);
            if (pos == before) { eat(); }
        }
        eat(TokenType.LLAVE_DER);
        return new Ast.Block(stmts, l);
    }

    private Ast.Stmt parseStmt() {
        int l = line();
        if (is(TokenType.LLAVE_IZQ)) return parseBlock();
        if (is(TokenType.SI)) return parseIf();
        if (is(TokenType.MIENTRAS)) return parseWhile();
        if (is(TokenType.PARA)) return parseFor();
        if (is(TokenType.RETORNAR)) return parseReturn();

        if (isVarDeclStart()) return parseVarDecl();

        Ast.Expr e = parseExpr();
        eat(TokenType.PUNTO_COMA);
        return new Ast.ExprStmt(e, l);
    }

    private Ast.Stmt parseIf() {
        int l = line(); eat(TokenType.SI);
        eat(TokenType.PARENTESIS_IZQ); Ast.Expr cond = parseExpr(); eat(TokenType.PARENTESIS_DER);
        Ast.Stmt then = parseStmt();
        Ast.Stmt else_ = null;
        if (is(TokenType.SINO)) { eat(); else_ = parseStmt(); }
        return new Ast.IfStmt(cond, then, else_, l);
    }

    private Ast.Stmt parseWhile() {
        int l = line(); eat(TokenType.MIENTRAS);
        eat(TokenType.PARENTESIS_IZQ); Ast.Expr cond = parseExpr(); eat(TokenType.PARENTESIS_DER);
        return new Ast.WhileStmt(cond, parseStmt(), l);
    }

    private Ast.Stmt parseFor() {
        int l = line(); eat(TokenType.PARA); eat(TokenType.PARENTESIS_IZQ);

        Ast.Stmt init = null;
        if (!is(TokenType.PUNTO_COMA)) {
            if (isVarDeclStart()) {
                Ast.TypeRef t = parseType();
                String n = eat(TokenType.IDENTIFICADOR).value;
                Ast.Expr iv = match(TokenType.IGUAL) ? parseExpr() : null;
                init = new Ast.VarDecl(t, n, iv, l);
            } else {
                init = new Ast.ExprStmt(parseExpr(), l);
            }
        }
        eat(TokenType.PUNTO_COMA);

        Ast.Expr cond = is(TokenType.PUNTO_COMA) ? null : parseExpr();
        eat(TokenType.PUNTO_COMA);

        List<Ast.Expr> update = new ArrayList<>();
        while (!is(TokenType.PARENTESIS_DER) && !is(TokenType.EOF)) {
            update.add(parseExpr());
            if (!is(TokenType.PARENTESIS_DER)) eat(TokenType.COMA);
        }
        eat(TokenType.PARENTESIS_DER);
        return new Ast.ForStmt(init, cond, update, parseStmt(), l);
    }

    private Ast.Stmt parseReturn() {
        int l = line(); eat(TokenType.RETORNAR);
        Ast.Expr val = is(TokenType.PUNTO_COMA) ? null : parseExpr();
        eat(TokenType.PUNTO_COMA);
        return new Ast.ReturnStmt(val, l);
    }

    private Ast.Stmt parseVarDecl() {
        int l = line();
        Ast.TypeRef type = parseType();
        String name = eat(TokenType.IDENTIFICADOR).value;
        Ast.Expr init = match(TokenType.IGUAL) ? parseExpr() : null;
        eat(TokenType.PUNTO_COMA);
        return new Ast.VarDecl(type, name, init, l);
    }

    private Ast.Expr parseExpr() { return parseAssign(); }

    private Ast.Expr parseAssign() {
        int l = line();
        Ast.Expr left = parseOr();
        if (is(TokenType.IGUAL) || is(TokenType.MAS_IGUAL) || is(TokenType.MENOS_IGUAL)
                || is(TokenType.MULT_IGUAL) || is(TokenType.DIV_IGUAL)) {
            String op = eat().value;
            return new Ast.AssignExpr(left, op, parseAssign(), l);
        }
        return left;
    }

    private Ast.Expr parseOr() {
        Ast.Expr e = parseAnd();
        while (is(TokenType.O_LOGICO)) { String op = eat().value; e = new Ast.BinaryExpr(op, e, parseAnd(), line()); }
        return e;
    }

    private Ast.Expr parseAnd() {
        Ast.Expr e = parseEq();
        while (is(TokenType.Y_LOGICO)) { String op = eat().value; e = new Ast.BinaryExpr(op, e, parseEq(), line()); }
        return e;
    }

    private Ast.Expr parseEq() {
        Ast.Expr e = parseRel();
        while (is(TokenType.IGUAL_IGUAL) || is(TokenType.DIF_IGUAL)) { String op = eat().value; e = new Ast.BinaryExpr(op, e, parseRel(), line()); }
        return e;
    }

    private Ast.Expr parseRel() {
        Ast.Expr e = parseAdd();
        while (is(TokenType.MENOR) || is(TokenType.MAYOR) || is(TokenType.MENOR_IGUAL) || is(TokenType.MAYOR_IGUAL)) {
            String op = eat().value; e = new Ast.BinaryExpr(op, e, parseAdd(), line());
        }
        return e;
    }

    private Ast.Expr parseAdd() {
        Ast.Expr e = parseMul();
        while (is(TokenType.MAS) || is(TokenType.MENOS)) { String op = eat().value; e = new Ast.BinaryExpr(op, e, parseMul(), line()); }
        return e;
    }

    private Ast.Expr parseMul() {
        Ast.Expr e = parseUnary();
        while (is(TokenType.MULT) || is(TokenType.DIV) || is(TokenType.MOD)) {
            String op = eat().value; e = new Ast.BinaryExpr(op, e, parseUnary(), line());
        }
        return e;
    }

    private Ast.Expr parseUnary() {
        int l = line();
        if (is(TokenType.DIF))  { eat(); return new Ast.UnaryExpr("!",  parseUnary(), l); }
        if (is(TokenType.MENOS)) { eat(); return new Ast.UnaryExpr("-",  parseUnary(), l); }
        if (is(TokenType.MAS))  { eat(); return new Ast.UnaryExpr("+",  parseUnary(), l); }
        return parsePostfix();
    }

    private Ast.Expr parsePostfix() {
        int l = line();
        Ast.Expr e = parsePrimary();
        while (true) {
            if (is(TokenType.PUNTO)) {
                eat(); String field = eat(TokenType.IDENTIFICADOR).value;
                if (is(TokenType.PARENTESIS_IZQ)) {
                    eat(); List<Ast.Expr> args = parseArgs(); eat(TokenType.PARENTESIS_DER);
                    e = new Ast.CallExpr(e, field, args, l);
                } else {
                    e = new Ast.FieldAccessExpr(e, field, l);
                }
            } else if (is(TokenType.MAS_MAS))  { eat(); e = new Ast.PostfixExpr(e, "++", l); }
            else if (is(TokenType.MENOS_MENOS))  { eat(); e = new Ast.PostfixExpr(e, "--", l); }
            else break;
        }
        return e;
    }

    private Ast.Expr parsePrimary() {
        int l = line();
        if (is(TokenType.ENTERO))  { String v = eat().value; return new Ast.LiteralExpr(Integer.parseInt(v), "entero", l); }
        if (is(TokenType.DOBLE))   { String v = eat().value; return new Ast.LiteralExpr(Double.parseDouble(v), "doble", l); }
        if (is(TokenType.CADENA))   { String v = eat().value; return new Ast.LiteralExpr(v, "cadena",  l); }
        if (is(TokenType.BOOLEANO))  { boolean b = eat().value.equals("true"); return new Ast.LiteralExpr(b, "booleano", l); }
        if (is(TokenType.NULO))     { eat(); return new Ast.LiteralExpr(null, "nulo", l); }

        if (is(TokenType.PARENTESIS_IZQ)) {
            eat(); Ast.Expr e = parseExpr(); eat(TokenType.PARENTESIS_DER); return e;
        }

        if (is(TokenType.IDENTIFICADOR)) {
            String name = eat().value;
            if (is(TokenType.PARENTESIS_IZQ)) {
                eat(); List<Ast.Expr> args = parseArgs(); eat(TokenType.PARENTESIS_DER);
                return new Ast.CallExpr(null, name, args, l);
            }
            return new Ast.NameExpr(name, l);
        }

        err("Expresión inesperada: '" + cur().value + "'");
        eat();
        return new Ast.LiteralExpr(0, "entero", l);
    }

    private List<Ast.Expr> parseArgs() {
        List<Ast.Expr> args = new ArrayList<>();
        while (!is(TokenType.PARENTESIS_DER) && !is(TokenType.EOF)) {
            args.add(parseExpr());
            if (!is(TokenType.PARENTESIS_DER)) eat(TokenType.COMA);
        }
        return args;
    }

    private Ast.TypeRef parseType() {
        int l = line();
        String name;
        if (is(TokenType.ENTERO))      { eat(); name = "entero"; }
        else if (is(TokenType.BOOLEANO)){ eat(); name = "booleano"; }
        else if (is(TokenType.DOBLE))  { eat(); name = "doble"; }
        else if (is(TokenType.CADENA)) { eat(); name = "cadena"; }
        else if (is(TokenType.VACIO))  { eat(); name = "vacio"; }
        else                           { name = eat(TokenType.IDENTIFICADOR).value; }
        int dims = 0;
        while (is(TokenType.CORCH_IZQ) && is(1, TokenType.CORCH_DER)) { eat(); eat(); dims++; }
        return new Ast.TypeRef(name, dims, l);
    }

    private List<String> parseMods() {
        List<String> mods = new ArrayList<>();
        loop: while (true) {
            switch (cur().type) {
                case PUBLICO, PRIVADO, PROTEGIDO, ESTATICO, FINAL, ABSTRACTO -> mods.add(eat().value);
                default -> { break loop; }
            }
        }
        return mods;
    }

    private boolean isTypeStart() {
        return switch (cur().type) {
            case ENTERO, BOOLEANO, DOBLE, CADENA, VACIO, IDENTIFICADOR -> true;
            default -> false;
        };
    }

    private boolean isVarDeclStart() {
        if (!isTypeStart()) return false;
        int i = 1;
        while (is(i, TokenType.CORCH_IZQ) && is(i + 1, TokenType.CORCH_DER)) i += 2;
        return is(i, TokenType.IDENTIFICADOR);
    }
}