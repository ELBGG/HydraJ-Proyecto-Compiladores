package unsa.elb_moi.compiler;

import unsa.elb_moi.compiler.ast.Ast;

import java.util.List;

public class HydraCompiler {

    public CompileResult compile(String source) {
        CompileResult result = new CompileResult();

        result.log("[LEXER] Tokenizando...");
        Lexer lexer = new Lexer(source);
        List<Token> tokens = lexer.tokenize();
        lexer.getErrors().forEach(e -> result.error("[LEXER] " + e));
        result.log("[LEXER] " + tokens.size() + " token(s) generados");
        if (result.hasErrors()) { result.success = false; return result; }

        result.log("[PARSER] Analizando sintaxis...");
        Parser parser = new Parser(tokens);
        Ast.Program program = parser.parse();
        parser.getErrors().forEach(e -> result.error("[PARSER] " + e));
        if (result.hasErrors()) { result.success = false; return result; }
        result.log("[PARSER] AST construido — " + program.classes.size() + " clase(s)");

        result.log("[SEMANTIC] Analizando semántica...");
        SemanticAnalyzer sem = new SemanticAnalyzer();
        sem.analyze(program);
        sem.getErrors().forEach(e   -> result.error(e));
        sem.getWarnings().forEach(w -> result.warning(w));
        if (result.hasErrors()) { result.success = false; return result; }
        result.log("[SEMANTIC] OK");

        result.log("[CODEGEN] Generando código intermedio...");
        CodeGenerator cg = new CodeGenerator();
        result.ir = cg.generate(program);
        result.log("[CODEGEN] Hecho.");

        result.success = true;
        return result;
    }
}
