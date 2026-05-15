package unsa.elb_moi.compiler;

import java.util.ArrayList;
import java.util.List;

public class CompileResult {
    public final List<String> errors   = new ArrayList<>();
    public final List<String> warnings = new ArrayList<>();
    public final List<String> logs     = new ArrayList<>();
    public       String       ir       = "";
    public       boolean      success  = false;

    public void error(String msg)   { errors.add(msg); }
    public void warning(String msg) { warnings.add(msg); }
    public void log(String msg)     { logs.add(msg); }
    public boolean hasErrors()      { return !errors.isEmpty(); }
}
