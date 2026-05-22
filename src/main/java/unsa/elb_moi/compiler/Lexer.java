package unsa.elb_moi.compiler;

import java.util.*;

public class Lexer {

    private static final Map<String, TokenType> PALABRAS_CLAVE = Map.ofEntries(
            Map.entry("clase",   TokenType.CLASE),
            Map.entry("publico", TokenType.PUBLICO),
            Map.entry("privado", TokenType.PRIVADO),
            Map.entry("protegido", TokenType.PROTEGIDO),
            Map.entry("estatico", TokenType.ESTATICO),
            Map.entry("final", TokenType.FINAL),
            Map.entry("abstracto", TokenType.ABSTRACTO),
            Map.entry("funcion", TokenType.FUNCION),
            Map.entry("vacio", TokenType.VACIO),
            Map.entry("entero", TokenType.ENTERO),
            Map.entry("booleano", TokenType.BOOLEANO),
            Map.entry("doble", TokenType.DOBLE),
            Map.entry("cadena", TokenType.CADENA),
            Map.entry("si", TokenType.SI),
            Map.entry("sino", TokenType.SINO),
            Map.entry("mientras", TokenType.MIENTRAS),
            Map.entry("para", TokenType.PARA),
            Map.entry("retornar", TokenType.RETORNAR),
            Map.entry("verdadero", TokenType.VERDADERO),
            Map.entry("falso", TokenType.FALSO),
            Map.entry("nulo", TokenType.NULO)
    );

    private final String src;
    private int pos = 0;
    private int line = 1;
    private int col = 1;
    private final List<String> errores = new ArrayList<>();

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

    public List<String> getErrors() { return errores; }

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
        if (Character.isDigit(c)) return readNum(sl, sc);
        if (c == '"') return readStr(sl, sc);
        return readOp(sl, sc);
    }

    private Token readWord(int l, int c) {
        int s = pos;
        while (pos < src.length() && (Character.isLetterOrDigit(src.charAt(pos)) || src.charAt(pos) == '_')) adv();
        String w = src.substring(s, pos).toLowerCase();
        TokenType t = PALABRAS_CLAVE.getOrDefault(w, TokenType.IDENTIFICADOR);
        if (t == TokenType.VERDADERO) return new Token(TokenType.BOOLEANO, "true", l, c);
        if (t == TokenType.FALSO) return new Token(TokenType.BOOLEANO, "false", l, c);
        if (t == TokenType.NULO) return new Token(TokenType.NULO, "null", l, c);
        return new Token(t, w, l, c);
    }

    private Token readNum(int l, int c) {
        int s = pos;
        boolean esDouble = false;
        while (pos < src.length() && Character.isDigit(src.charAt(pos))) adv();
        if (pos < src.length() && src.charAt(pos) == '.') {
            esDouble = true; adv();
            while (pos < src.length() && Character.isDigit(src.charAt(pos))) adv();
        }
        return new Token(esDouble ? TokenType.DOBLE : TokenType.ENTERO, src.substring(s, pos), l, c);
    }

    private Token readStr(int l, int c) {
        adv();
        StringBuilder sb = new StringBuilder();
        while (pos < src.length() && src.charAt(pos) != '"') {
            sb.append(src.charAt(pos));
            adv();
        }
        if (pos < src.length()) adv();
        return new Token(TokenType.CADENA, sb.toString(), l, c);
    }

    private Token readOp(int l, int c) {
        char a = src.charAt(pos); adv();
        char b = pos < src.length() ? src.charAt(pos) : 0;
        if (a == '=' && b == '=') { adv(); return tok(TokenType.IGUAL_IGUAL, "==", l, c); }
        if (a == '!' && b == '=') { adv(); return tok(TokenType.DIF_IGUAL, "!=", l, c); }
        if (a == '<' && b == '=') { adv(); return tok(TokenType.MENOR_IGUAL, "<=", l, c); }
        if (a == '>' && b == '=') { adv(); return tok(TokenType.MAYOR_IGUAL, ">=", l, c); }
        if (a == '+' && b == '+') { adv(); return tok(TokenType.MAS_MAS, "++", l, c); }
        if (a == '-' && b == '-') { adv(); return tok(TokenType.MENOS_MENOS,"--", l, c); }
        if (a == '+' && b == '=') { adv(); return tok(TokenType.MAS_IGUAL, "+=", l, c); }
        if (a == '-' && b == '=') { adv(); return tok(TokenType.MENOS_IGUAL, "-=", l, c); }
        if (a == '*' && b == '=') { adv(); return tok(TokenType.MULT_IGUAL, "*=", l, c); }
        if (a == '/' && b == '=') { adv(); return tok(TokenType.DIV_IGUAL, "/=", l, c); }
        if (a == '&' && b == '&') { adv(); return tok(TokenType.Y_LOGICO, "&&", l, c); }
        if (a == '|' && b == '|') { adv(); return tok(TokenType.O_LOGICO, "||", l, c); }
        return switch (a) {
            case '+' -> tok(TokenType.MAS, "+", l, c);
            case '-' -> tok(TokenType.MENOS, "-", l, c);
            case '*' -> tok(TokenType.MULT, "*", l, c);
            case '/' -> tok(TokenType.DIV, "/", l, c);
            case '%' -> tok(TokenType.MOD, "%", l, c);
            case '=' -> tok(TokenType.IGUAL, "=", l, c);
            case '!' -> tok(TokenType.DIF, "!", l, c);
            case '<' -> tok(TokenType.MENOR, "<", l, c);
            case '>' -> tok(TokenType.MAYOR, ">", l, c);
            case '(' -> tok(TokenType.PARENTESIS_IZQ, "(", l, c);
            case ')' -> tok(TokenType.PARENTESIS_DER, ")", l, c);
            case '{' -> tok(TokenType.LLAVE_IZQ, "{", l, c);
            case '}' -> tok(TokenType.LLAVE_DER, "}", l, c);
            case '[' -> tok(TokenType.CORCH_IZQ, "[", l, c);
            case ']' -> tok(TokenType.CORCH_DER, "]", l, c);
            case ';' -> tok(TokenType.PUNTO_COMA, ";", l, c);
            case ',' -> tok(TokenType.COMA, ",", l, c);
            case '.' -> tok(TokenType.PUNTO, ".", l, c);
            default  -> { errores.add("Carácter inesperado '" + a + "' en línea " + l); yield tok(TokenType.ERROR, String.valueOf(a), l, c); }
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