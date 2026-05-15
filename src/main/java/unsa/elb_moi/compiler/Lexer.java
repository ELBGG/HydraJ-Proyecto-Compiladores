package unsa.elb_moi.compiler;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class Lexer {

    private static final Map<String, TokenType> KEYWORDS = Map.ofEntries(
        Map.entry("class",     TokenType.CLASS),
        Map.entry("public",    TokenType.PUBLIC),
        Map.entry("private",   TokenType.PRIVATE),
        Map.entry("protected", TokenType.PROTECTED),
        Map.entry("static",    TokenType.STATIC),
        Map.entry("final",     TokenType.FINAL),
        Map.entry("abstract",  TokenType.ABSTRACT),
        Map.entry("void",      TokenType.VOID),
        Map.entry("int",       TokenType.INT),
        Map.entry("boolean",   TokenType.BOOLEAN_T),
        Map.entry("double",    TokenType.DOUBLE_T),
        Map.entry("long",      TokenType.LONG_T),
        Map.entry("char",      TokenType.CHAR_T),
        Map.entry("String",    TokenType.STRING_T),
        Map.entry("if",        TokenType.IF),
        Map.entry("else",      TokenType.ELSE),
        Map.entry("while",     TokenType.WHILE),
        Map.entry("for",       TokenType.FOR),
        Map.entry("return",    TokenType.RETURN),
        Map.entry("new",       TokenType.NEW),
        Map.entry("this",      TokenType.THIS),
        Map.entry("super",     TokenType.SUPER),
        Map.entry("true",      TokenType.TRUE),
        Map.entry("false",     TokenType.FALSE),
        Map.entry("null",      TokenType.NULL),
        Map.entry("import",    TokenType.IMPORT),
        Map.entry("package",   TokenType.PACKAGE)
    );

    private final String       src;
    private       int          pos  = 0;
    private       int          line = 1;
    private       int          col  = 1;
    private final List<String> errors = new ArrayList<>();

    public Lexer(String src) { this.src = src; }

    public List<Token> tokenize() {
        List<Token> out = new ArrayList<>();
        while (pos < src.length()) {
            skipWS();
            if (pos >= src.length()) break;
            Token t = next();
            if (t != null) out.add(t);
        }
        out.add(new Token(TokenType.EOF, "", line, col));
        return out;
    }

    public List<String> getErrors() { return errors; }

    private void skipWS() {
        while (pos < src.length()) {
            char c = src.charAt(pos);
            if (Character.isWhitespace(c)) { adv(); }
            else if (c == '/' && peek(1) == '/') { while (pos < src.length() && src.charAt(pos) != '\n') adv(); }
            else if (c == '/' && peek(1) == '*') {
                adv(); adv();
                while (pos < src.length() - 1 && !(src.charAt(pos) == '*' && src.charAt(pos+1) == '/')) adv();
                if (pos < src.length() - 1) { adv(); adv(); }
            } else break;
        }
    }

    private Token next() {
        int sl = line, sc = col;
        char c = src.charAt(pos);
        if (Character.isLetter(c) || c == '_') return readWord(sl, sc);
        if (Character.isDigit(c))              return readNum(sl, sc);
        if (c == '"')                          return readStr(sl, sc);
        if (c == '\'')                         return readChar(sl, sc);
        return readOp(sl, sc);
    }

    private Token readWord(int l, int c) {
        int s = pos;
        while (pos < src.length() && (Character.isLetterOrDigit(src.charAt(pos)) || src.charAt(pos) == '_')) adv();
        String w = src.substring(s, pos);
        TokenType t = KEYWORDS.getOrDefault(w, TokenType.IDENTIFIER);
        if (t == TokenType.TRUE)  return new Token(TokenType.BOOLEAN, "true",  l, c);
        if (t == TokenType.FALSE) return new Token(TokenType.BOOLEAN, "false", l, c);
        if (t == TokenType.NULL)  return new Token(TokenType.NULL,    "null",  l, c);
        return new Token(t, w, l, c);
    }

    private Token readNum(int l, int c) {
        int s = pos;
        boolean isD = false;
        while (pos < src.length() && Character.isDigit(src.charAt(pos))) adv();
        if (pos < src.length() && src.charAt(pos) == '.') {
            isD = true; adv();
            while (pos < src.length() && Character.isDigit(src.charAt(pos))) adv();
        }
        if (pos < src.length() && (src.charAt(pos) == 'L' || src.charAt(pos) == 'l')) adv();
        if (pos < src.length() && (src.charAt(pos) == 'f' || src.charAt(pos) == 'F')) { isD = true; adv(); }
        return new Token(isD ? TokenType.DOUBLE : TokenType.INTEGER, src.substring(s, pos), l, c);
    }

    private Token readStr(int l, int c) {
        adv();
        StringBuilder sb = new StringBuilder();
        while (pos < src.length() && src.charAt(pos) != '"') {
            if (src.charAt(pos) == '\\' && pos + 1 < src.length()) {
                adv();
                sb.append(switch (src.charAt(pos)) {
                    case 'n' -> '\n'; case 't' -> '\t'; case 'r' -> '\r';
                    case '"' -> '"';  case '\\' -> '\\'; default -> src.charAt(pos);
                });
            } else {
                sb.append(src.charAt(pos));
            }
            adv();
        }
        if (pos < src.length()) adv();
        return new Token(TokenType.STRING, sb.toString(), l, c);
    }

    private Token readChar(int l, int c) {
        adv();
        char ch = pos < src.length() ? src.charAt(pos) : 0;
        adv();
        if (pos < src.length() && src.charAt(pos) == '\'') adv();
        return new Token(TokenType.INTEGER, String.valueOf((int) ch), l, c);
    }

    private Token readOp(int l, int c) {
        char a = src.charAt(pos); adv();
        char b = pos < src.length() ? src.charAt(pos) : 0;

        if (a == '=' && b == '=') { adv(); return tok(TokenType.EQ_EQ,     "==", l, c); }
        if (a == '!' && b == '=') { adv(); return tok(TokenType.BANG_EQ,   "!=", l, c); }
        if (a == '<' && b == '=') { adv(); return tok(TokenType.LT_EQ,     "<=", l, c); }
        if (a == '>' && b == '=') { adv(); return tok(TokenType.GT_EQ,     ">=", l, c); }
        if (a == '+' && b == '+') { adv(); return tok(TokenType.PLUS_PLUS, "++", l, c); }
        if (a == '-' && b == '-') { adv(); return tok(TokenType.MINUS_MINUS,"--",l, c); }
        if (a == '+' && b == '=') { adv(); return tok(TokenType.PLUS_EQ,   "+=", l, c); }
        if (a == '-' && b == '=') { adv(); return tok(TokenType.MINUS_EQ,  "-=", l, c); }
        if (a == '*' && b == '=') { adv(); return tok(TokenType.STAR_EQ,   "*=", l, c); }
        if (a == '/' && b == '=') { adv(); return tok(TokenType.SLASH_EQ,  "/=", l, c); }
        if (a == '&' && b == '&') { adv(); return tok(TokenType.AMP_AMP,   "&&", l, c); }
        if (a == '|' && b == '|') { adv(); return tok(TokenType.PIPE_PIPE, "||", l, c); }

        return switch (a) {
            case '+' -> tok(TokenType.PLUS,      "+", l, c);
            case '-' -> tok(TokenType.MINUS,     "-", l, c);
            case '*' -> tok(TokenType.STAR,      "*", l, c);
            case '/' -> tok(TokenType.SLASH,     "/", l, c);
            case '%' -> tok(TokenType.PERCENT,   "%", l, c);
            case '=' -> tok(TokenType.EQ,        "=", l, c);
            case '!' -> tok(TokenType.BANG,      "!", l, c);
            case '<' -> tok(TokenType.LT,        "<", l, c);
            case '>' -> tok(TokenType.GT,        ">", l, c);
            case '(' -> tok(TokenType.LPAREN,    "(", l, c);
            case ')' -> tok(TokenType.RPAREN,    ")", l, c);
            case '{' -> tok(TokenType.LBRACE,    "{", l, c);
            case '}' -> tok(TokenType.RBRACE,    "}", l, c);
            case '[' -> tok(TokenType.LBRACKET,  "[", l, c);
            case ']' -> tok(TokenType.RBRACKET,  "]", l, c);
            case ';' -> tok(TokenType.SEMICOLON, ";", l, c);
            case ',' -> tok(TokenType.COMMA,     ",", l, c);
            case '.' -> tok(TokenType.DOT,       ".", l, c);
            default  -> { errors.add("Carácter inesperado '" + a + "' en línea " + l); yield tok(TokenType.ERROR, String.valueOf(a), l, c); }
        };
    }

    private static Token tok(TokenType t, String v, int l, int c) { return new Token(t, v, l, c); }

    private char peek(int offset) {
        int i = pos + offset;
        return i < src.length() ? src.charAt(i) : '\0';
    }

    private void adv() {
        if (pos < src.length() && src.charAt(pos) == '\n') { line++; col = 1; } else col++;
        pos++;
    }
}
