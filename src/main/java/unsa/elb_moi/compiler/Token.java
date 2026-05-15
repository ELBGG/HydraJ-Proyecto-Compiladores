package unsa.elb_moi.compiler;

public class Token {
    public final TokenType type;
    public final String    value;
    public final int       line;
    public final int       col;

    public Token(TokenType type, String value, int line, int col) {
        this.type  = type;
        this.value = value;
        this.line  = line;
        this.col   = col;
    }

    @Override public String toString() { return type + "('" + value + "')@" + line + ":" + col; }
}
