package unsa.elb_moi.compiler;

import unsa.elb_moi.compiler.ast.Ast;

import java.util.ArrayList;
import java.util.List;

public class Parser {

    private final List<Token>  tokens;
    private       int          pos = 0;
    private final List<String> errors = new ArrayList<>();

    public Parser(List<Token> tokens) { this.tokens = tokens; }
    public List<String> getErrors()   { return errors; }

    private Token cur()  { return tokens.get(Math.min(pos, tokens.size() - 1)); }
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
            if (t == TokenType.SEMICOLON || t == TokenType.RBRACE) break;
        }
    }

    public Ast.Program parse() {
        int l = line();
        String pkg = null;
        if (is(TokenType.PACKAGE)) { eat(); pkg = parseQualifiedName(); eat(TokenType.SEMICOLON); }

        List<String> imports = new ArrayList<>();
        while (is(TokenType.IMPORT)) {
            eat();
            imports.add(parseQualifiedName());
            eat(TokenType.SEMICOLON);
        }

        List<Ast.ClassDecl> classes = new ArrayList<>();
        while (!is(TokenType.EOF) && errors.size() < MAX_ERRORS) {
            int before = pos;
            Ast.ClassDecl cd = parseClass();
            if (cd != null) classes.add(cd);
            if (pos == before) { eat(); }
        }
        return new Ast.Program(pkg, imports, classes, l);
    }

    private String parseQualifiedName() {
        StringBuilder sb = new StringBuilder();
        if (is(TokenType.IDENTIFIER) || isTypeKeyword()) sb.append(eat().value);
        while (is(TokenType.DOT)) { eat(); sb.append('.').append(eat().value); }
        if (is(TokenType.STAR)) { eat(); sb.append(".*"); }
        return sb.toString();
    }

    private Ast.ClassDecl parseClass() {
        int l = line();
        List<String> mods = parseMods();
        if (!is(TokenType.CLASS)) { err("Se esperaba 'class'"); return null; }
        eat();
        String name = eat(TokenType.IDENTIFIER).value;
        eat(TokenType.LBRACE);
        List<Ast.Member> members = new ArrayList<>();
        while (!is(TokenType.RBRACE) && !is(TokenType.EOF) && errors.size() < MAX_ERRORS) {
            int before = pos;
            Ast.Member m = parseMember();
            if (m != null) members.add(m);
            if (pos == before) { eat(); }
        }
        eat(TokenType.RBRACE);
        return new Ast.ClassDecl(mods, name, members, l);
    }

    private Ast.Member parseMember() {
        int l = line();
        List<String> mods = parseMods();
        if (!isTypeStart()) { err("Se esperaba tipo de miembro"); sync(); return null; }
        Ast.TypeRef type = parseType();
        String name = eat(TokenType.IDENTIFIER).value;
        if (is(TokenType.LPAREN)) return parseMethod(mods, type, name, l);
        return parseField(mods, type, name, l);
    }

    private Ast.Member parseMethod(List<String> mods, Ast.TypeRef ret, String name, int l) {
        eat(TokenType.LPAREN);
        List<Ast.Param> params = new ArrayList<>();
        while (!is(TokenType.RPAREN) && !is(TokenType.EOF)) {
            Ast.TypeRef pt = parseType();
            String pn = eat(TokenType.IDENTIFIER).value;
            params.add(new Ast.Param(pt, pn, l));
            if (!is(TokenType.RPAREN)) eat(TokenType.COMMA);
        }
        eat(TokenType.RPAREN);
        if (is(TokenType.SEMICOLON)) { eat(); return new Ast.MethodDecl(mods, ret, name, params, null, l); }
        Ast.Block body = parseBlock();
        return new Ast.MethodDecl(mods, ret, name, params, body, l);
    }

    private Ast.Member parseField(List<String> mods, Ast.TypeRef type, String name, int l) {
        Ast.Expr init = null;
        if (match(TokenType.EQ)) init = parseExpr();
        eat(TokenType.SEMICOLON);
        return new Ast.FieldDecl(mods, type, name, init, l);
    }

    private Ast.Block parseBlock() {
        int l = line();
        eat(TokenType.LBRACE);
        List<Ast.Stmt> stmts = new ArrayList<>();
        while (!is(TokenType.RBRACE) && !is(TokenType.EOF) && errors.size() < MAX_ERRORS) {
            int before = pos;
            Ast.Stmt s = parseStmt();
            if (s != null) stmts.add(s);
            if (pos == before) { eat(); }
        }
        eat(TokenType.RBRACE);
        return new Ast.Block(stmts, l);
    }

    private Ast.Stmt parseStmt() {
        int l = line();
        if (is(TokenType.LBRACE))  return parseBlock();
        if (is(TokenType.IF))      return parseIf();
        if (is(TokenType.WHILE))   return parseWhile();
        if (is(TokenType.FOR))     return parseFor();
        if (is(TokenType.RETURN))  return parseReturn();

        if (isVarDeclStart()) return parseVarDecl();

        Ast.Expr e = parseExpr();
        eat(TokenType.SEMICOLON);
        return new Ast.ExprStmt(e, l);
    }

    private Ast.Stmt parseIf() {
        int l = line(); eat(TokenType.IF);
        eat(TokenType.LPAREN); Ast.Expr cond = parseExpr(); eat(TokenType.RPAREN);
        Ast.Stmt then = parseStmt();
        Ast.Stmt else_ = null;
        if (is(TokenType.ELSE)) { eat(); else_ = parseStmt(); }
        return new Ast.IfStmt(cond, then, else_, l);
    }

    private Ast.Stmt parseWhile() {
        int l = line(); eat(TokenType.WHILE);
        eat(TokenType.LPAREN); Ast.Expr cond = parseExpr(); eat(TokenType.RPAREN);
        return new Ast.WhileStmt(cond, parseStmt(), l);
    }

    private Ast.Stmt parseFor() {
        int l = line(); eat(TokenType.FOR); eat(TokenType.LPAREN);

        Ast.Stmt init = null;
        if (!is(TokenType.SEMICOLON)) {
            if (isVarDeclStart()) {
                Ast.TypeRef t = parseType();
                String n = eat(TokenType.IDENTIFIER).value;
                Ast.Expr iv = match(TokenType.EQ) ? parseExpr() : null;
                init = new Ast.VarDecl(t, n, iv, l);
            } else {
                init = new Ast.ExprStmt(parseExpr(), l);
            }
        }
        eat(TokenType.SEMICOLON);

        Ast.Expr cond = is(TokenType.SEMICOLON) ? null : parseExpr();
        eat(TokenType.SEMICOLON);

        List<Ast.Expr> update = new ArrayList<>();
        while (!is(TokenType.RPAREN) && !is(TokenType.EOF)) {
            update.add(parseExpr());
            if (!is(TokenType.RPAREN)) eat(TokenType.COMMA);
        }
        eat(TokenType.RPAREN);
        return new Ast.ForStmt(init, cond, update, parseStmt(), l);
    }

    private Ast.Stmt parseReturn() {
        int l = line(); eat(TokenType.RETURN);
        Ast.Expr val = is(TokenType.SEMICOLON) ? null : parseExpr();
        eat(TokenType.SEMICOLON);
        return new Ast.ReturnStmt(val, l);
    }

    private Ast.Stmt parseVarDecl() {
        int l = line();
        Ast.TypeRef type = parseType();
        String name = eat(TokenType.IDENTIFIER).value;
        Ast.Expr init = match(TokenType.EQ) ? parseExpr() : null;
        eat(TokenType.SEMICOLON);
        return new Ast.VarDecl(type, name, init, l);
    }

    private Ast.Expr parseExpr() { return parseAssign(); }

    private Ast.Expr parseAssign() {
        int l = line();
        Ast.Expr left = parseOr();
        if (is(TokenType.EQ) || is(TokenType.PLUS_EQ) || is(TokenType.MINUS_EQ)
                || is(TokenType.STAR_EQ) || is(TokenType.SLASH_EQ)) {
            String op = eat().value;
            return new Ast.AssignExpr(left, op, parseAssign(), l);
        }
        return left;
    }

    private Ast.Expr parseOr() {
        Ast.Expr e = parseAnd();
        while (is(TokenType.PIPE_PIPE)) { String op = eat().value; e = new Ast.BinaryExpr(op, e, parseAnd(), line()); }
        return e;
    }

    private Ast.Expr parseAnd() {
        Ast.Expr e = parseEq();
        while (is(TokenType.AMP_AMP)) { String op = eat().value; e = new Ast.BinaryExpr(op, e, parseEq(), line()); }
        return e;
    }

    private Ast.Expr parseEq() {
        Ast.Expr e = parseRel();
        while (is(TokenType.EQ_EQ) || is(TokenType.BANG_EQ)) { String op = eat().value; e = new Ast.BinaryExpr(op, e, parseRel(), line()); }
        return e;
    }

    private Ast.Expr parseRel() {
        Ast.Expr e = parseAdd();
        while (is(TokenType.LT) || is(TokenType.GT) || is(TokenType.LT_EQ) || is(TokenType.GT_EQ)) {
            String op = eat().value; e = new Ast.BinaryExpr(op, e, parseAdd(), line());
        }
        return e;
    }

    private Ast.Expr parseAdd() {
        Ast.Expr e = parseMul();
        while (is(TokenType.PLUS) || is(TokenType.MINUS)) { String op = eat().value; e = new Ast.BinaryExpr(op, e, parseMul(), line()); }
        return e;
    }

    private Ast.Expr parseMul() {
        Ast.Expr e = parseUnary();
        while (is(TokenType.STAR) || is(TokenType.SLASH) || is(TokenType.PERCENT)) {
            String op = eat().value; e = new Ast.BinaryExpr(op, e, parseUnary(), line());
        }
        return e;
    }

    private Ast.Expr parseUnary() {
        int l = line();
        if (is(TokenType.BANG))  { eat(); return new Ast.UnaryExpr("!",  parseUnary(), l); }
        if (is(TokenType.MINUS)) { eat(); return new Ast.UnaryExpr("-",  parseUnary(), l); }
        if (is(TokenType.PLUS))  { eat(); return new Ast.UnaryExpr("+",  parseUnary(), l); }
        return parsePostfix();
    }

    private Ast.Expr parsePostfix() {
        int l = line();
        Ast.Expr e = parsePrimary();
        while (true) {
            if (is(TokenType.DOT)) {
                eat(); String field = eat(TokenType.IDENTIFIER).value;
                if (is(TokenType.LPAREN)) {
                    eat(); List<Ast.Expr> args = parseArgs(); eat(TokenType.RPAREN);
                    e = new Ast.CallExpr(e, field, args, l);
                } else {
                    e = new Ast.FieldAccessExpr(e, field, l);
                }
            } else if (is(TokenType.PLUS_PLUS))  { eat(); e = new Ast.PostfixExpr(e, "++", l); }
            else if (is(TokenType.MINUS_MINUS))  { eat(); e = new Ast.PostfixExpr(e, "--", l); }
            else break;
        }
        return e;
    }

    private Ast.Expr parsePrimary() {
        int l = line();
        if (is(TokenType.INTEGER))  { String v = eat().value; return new Ast.LiteralExpr(Integer.parseInt(v), "int",     l); }
        if (is(TokenType.DOUBLE))   { String v = eat().value; return new Ast.LiteralExpr(Double.parseDouble(v), "double", l); }
        if (is(TokenType.STRING))   { String v = eat().value; return new Ast.LiteralExpr(v, "String",  l); }
        if (is(TokenType.BOOLEAN))  { boolean b = eat().value.equals("true"); return new Ast.LiteralExpr(b, "boolean", l); }
        if (is(TokenType.NULL))     { eat(); return new Ast.LiteralExpr(null, "null", l); }
        if (is(TokenType.THIS))     { eat(); return new Ast.NameExpr("this", l); }
        if (is(TokenType.SUPER))    { eat(); return new Ast.NameExpr("super", l); }

        if (is(TokenType.NEW)) {
            eat(); Ast.TypeRef t = parseType();
            if (is(TokenType.LPAREN)) {
                eat(); List<Ast.Expr> args = parseArgs(); eat(TokenType.RPAREN);
                return new Ast.NewObjectExpr(t, args, l);
            }
            eat(TokenType.LBRACKET); Ast.Expr sz = parseExpr(); eat(TokenType.RBRACKET);
            return new Ast.NewArrayExpr(t, sz, l);
        }

        if (is(TokenType.LPAREN)) {
            eat(); Ast.Expr e = parseExpr(); eat(TokenType.RPAREN); return e;
        }

        if (is(TokenType.IDENTIFIER)) {
            String name = eat().value;
            if (is(TokenType.LPAREN)) {
                eat(); List<Ast.Expr> args = parseArgs(); eat(TokenType.RPAREN);
                return new Ast.CallExpr(null, name, args, l);
            }
            return new Ast.NameExpr(name, l);
        }

        err("Expresión inesperada: '" + cur().value + "'");
        eat();
        return new Ast.LiteralExpr(0, "int", l);
    }

    private List<Ast.Expr> parseArgs() {
        List<Ast.Expr> args = new ArrayList<>();
        while (!is(TokenType.RPAREN) && !is(TokenType.EOF)) {
            args.add(parseExpr());
            if (!is(TokenType.RPAREN)) eat(TokenType.COMMA);
        }
        return args;
    }

    private Ast.TypeRef parseType() {
        int l = line();
        String name = switch (cur().type) {
            case INT       -> { eat(); yield "int"; }
            case BOOLEAN_T -> { eat(); yield "boolean"; }
            case DOUBLE_T  -> { eat(); yield "double"; }
            case LONG_T    -> { eat(); yield "long"; }
            case CHAR_T    -> { eat(); yield "char"; }
            case VOID      -> { eat(); yield "void"; }
            case STRING_T  -> { eat(); yield "String"; }
            default        -> eat().value;
        };
        int dims = 0;
        while (is(TokenType.LBRACKET) && is(1, TokenType.RBRACKET)) { eat(); eat(); dims++; }
        return new Ast.TypeRef(name, dims, l);
    }

    private List<String> parseMods() {
        List<String> mods = new ArrayList<>();
        loop: while (true) {
            switch (cur().type) {
                case PUBLIC, PRIVATE, PROTECTED, STATIC, FINAL, ABSTRACT -> mods.add(eat().value);
                default -> { break loop; }
            }
        }
        return mods;
    }

    private boolean isTypeStart() {
        return switch (cur().type) {
            case INT, BOOLEAN_T, DOUBLE_T, LONG_T, CHAR_T, VOID, STRING_T, IDENTIFIER -> true;
            default -> false;
        };
    }

    private boolean isTypeKeyword() {
        return switch (cur().type) {
            case INT, BOOLEAN_T, DOUBLE_T, LONG_T, CHAR_T, VOID, STRING_T -> true;
            default -> false;
        };
    }

    private boolean isVarDeclStart() {
        if (!isTypeStart()) return false;
        int i = 1;
        while (is(i, TokenType.LBRACKET) && is(i + 1, TokenType.RBRACKET)) i += 2;
        return is(i, TokenType.IDENTIFIER);
    }
}
