package unsa.elb_moi;

import imgui.ImGui;
import imgui.ImGuiIO;
import imgui.ImVec2;
import imgui.ImVec4;
import imgui.app.Application;
import imgui.app.Configuration;
import imgui.flag.*;
import imgui.type.*;
import unsa.elb_moi.compiler.CompileResult;
import unsa.elb_moi.compiler.HydraCompiler;
import unsa.elb_moi.voice.VoiceRecognizer;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;

public class HydraApp extends Application {

    private final ProjectManager pm    = new ProjectManager();
    private final List<EditorTab> tabs = new ArrayList<>();
    private int activeTab = 0;

    private final ImString voiceLog   = new ImString(4096);
    private final ImString consoleLog = new ImString(8192);

    private static final String[] BLOCKS = {
        "if / else", "for loop", "while", "function", "return", "variable", "print"
    };

    private final ImBoolean showLeft    = new ImBoolean(true);
    private final ImBoolean showVoice   = new ImBoolean(true);
    private final ImBoolean showConsole = new ImBoolean(true);

    private final VoiceRecognizer voice = new VoiceRecognizer();
    private final ImString voiceModelPath = new ImString("D:/vosk-model-small-es-0.42", 512);

    private boolean        triggerNewProject  = false;
    private boolean        triggerOpenProject = false;
    private final ImString dlgName = new ImString("MyProject", 128);
    private final ImString dlgLoc  = new ImString(System.getProperty("user.home"), 512);
    private final ImInt    dlgTpl  = new ImInt(0);
    private static final String[] TPL_LABELS = Arrays.stream(ProjectManager.Template.values())
        .map(t -> t.label).toArray(String[]::new);

    private static final int   PANEL_FLAGS = ImGuiWindowFlags.NoResize
        | ImGuiWindowFlags.NoMove | ImGuiWindowFlags.NoCollapse;
    private static final float LEFT_W  = 220;
    private static final float VOICE_H = 165;
    private static final float CONS_H  = 180;

    @Override
    protected void configure(Configuration config) {
        config.setTitle("HydraJ Compiler");
        config.setWidth(1280);
        config.setHeight(800);
    }

    @Override
    protected void initImGui(Configuration config) {
        super.initImGui(config);
        ImGuiIO io = ImGui.getIO();
        io.getFonts().addFontFromFileTTF(
            "D:/aaa/HydraJ/src/main/resources/assets/fonts/ARIAL.TTF", 18.0f);
        io.setFontGlobalScale(1.1f);
        applyDarkTheme();
        tabs.add(new EditorTab());
        Runtime.getRuntime().addShutdownHook(new Thread(voice::close));
    }

    @Override
    public void process() {
        float menuH  = ImGui.getFrameHeight();
        float vw     = ImGui.getMainViewport().getSizeX();
        float vh     = ImGui.getMainViewport().getSizeY() - menuH;
        float leftW  = showLeft.get()    ? LEFT_W  : 0;
        float voiceH = showVoice.get()   ? VOICE_H : 0;
        float consH  = showConsole.get() ? CONS_H  : 0;
        float editorW = vw - leftW;
        float editorH = vh - voiceH - consH;

        drawMenuBar();
        if (showLeft.get())    drawLeftPanel(menuH, vh, leftW);
        drawEditorPanel(menuH, leftW, editorW, editorH);
        if (showVoice.get())   drawVoicePanel(menuH + editorH, leftW, editorW, voiceH);
        if (showConsole.get()) drawConsolePanel(menuH + editorH + voiceH, leftW, editorW, consH);
        handleDialogs();
    }

    private void drawMenuBar() {
        if (!ImGui.beginMainMenuBar()) return;

        if (ImGui.beginMenu("File")) {
            if (ImGui.menuItem("New File",       "Ctrl+N")) tabs.add(new EditorTab());
            ImGui.separator();
            if (ImGui.menuItem("New Project..."))            triggerNewProject  = true;
            if (ImGui.menuItem("Open Project..."))           triggerOpenProject = true;
            ImGui.separator();
            if (ImGui.menuItem("Save",           "Ctrl+S")) saveCurrentTab();
            ImGui.separator();
            if (ImGui.menuItem("Exit"))                      System.exit(0);
            ImGui.endMenu();
        }
        if (ImGui.beginMenu("Build")) {
            if (ImGui.menuItem("Compile", "F5")) compile();
            if (ImGui.menuItem("Run",     "F6")) executeCode();
            ImGui.endMenu();
        }
        if (ImGui.beginMenu("View")) {
            ImGui.menuItem("Left Panel",  "", showLeft);
            ImGui.menuItem("Voice Panel", "", showVoice);
            ImGui.menuItem("Console",     "", showConsole);
            ImGui.endMenu();
        }
        if (ImGui.beginMenu("Help")) {
            if (ImGui.menuItem("About"))
                appendConsole("[HydraJ] Tri-modal compiler — keyboard · mouse · voice");
            ImGui.endMenu();
        }
        ImGui.endMainMenuBar();
    }

    private void drawLeftPanel(float y, float h, float w) {
        ImGui.setNextWindowPos(0, y, ImGuiCond.Always);
        ImGui.setNextWindowSize(w, h, ImGuiCond.Always);
        if (!ImGui.begin("##left", showLeft, PANEL_FLAGS)) { ImGui.end(); return; }

        if (ImGui.beginTabBar("##leftTabs")) {
            if (ImGui.beginTabItem("Project")) { drawProjectTab(w); ImGui.endTabItem(); }
            if (ImGui.beginTabItem("Blocks"))  { drawBlocksTab(w);  ImGui.endTabItem(); }
            ImGui.endTabBar();
        }
        ImGui.end();
    }

    private void drawProjectTab(float w) {
        if (ImGui.button("New"))  triggerNewProject  = true;
        ImGui.sameLine();
        if (ImGui.button("Open")) triggerOpenProject = true;
        ImGui.sameLine();
        if (ImGui.button("+File") && pm.hasProject()) tabs.add(new EditorTab());
        ImGui.separator();

        if (!pm.hasProject()) {
            ImGui.textDisabled("No project open.");
            ImGui.textDisabled("Use New or Open above.");
            return;
        }
        ImGui.text(pm.getRoot().getFileName().toString());
        ImGui.separator();
        renderFileTree(pm.getRoot());
    }

    private void drawBlocksTab(float w) {
        ImGui.textDisabled("Click to insert snippet");
        ImGui.separator();
        for (String label : BLOCKS) {
            if (ImGui.button(label, w - 20, 30)) insertBlock(label);
        }
    }

    private void renderFileTree(Path dir) {
        List<Path> children;
        try (var s = Files.list(dir)) {
            children = s.filter(p -> !skipPath(p))
                .sorted(Comparator.comparing((Path p) -> Files.isRegularFile(p) ? 1 : 0)
                                  .thenComparing(p -> p.getFileName().toString()))
                .toList();
        } catch (IOException e) { return; }

        for (Path child : children) {
            String name = child.getFileName().toString();
            if (Files.isDirectory(child)) {
                if (ImGui.treeNode(name)) { renderFileTree(child); ImGui.treePop(); }
            } else {
                ImGui.treeNodeEx(name,
                    ImGuiTreeNodeFlags.Leaf | ImGuiTreeNodeFlags.NoTreePushOnOpen);
                if (ImGui.isItemClicked()) openFileTab(child);
            }
        }
    }

    private static boolean skipPath(Path p) {
        String n = p.getFileName().toString();
        return n.startsWith(".") || n.equals("build") || n.equals("target") || n.equals("out");
    }

    private void drawEditorPanel(float y, float x, float w, float h) {
        ImGui.setNextWindowPos(x, y, ImGuiCond.Always);
        ImGui.setNextWindowSize(w, h, ImGuiCond.Always);
        if (!ImGui.begin("Editor", PANEL_FLAGS)) { ImGui.end(); return; }

        if (ImGui.button("Save")) saveCurrentTab();
        ImGui.sameLine();
        String path = tabs.isEmpty() ? "—" :
            tabs.get(activeTab).path != null
                ? tabs.get(activeTab).path.toString() : "untitled";
        ImGui.textDisabled(path);
        ImGui.separator();

        if (ImGui.beginTabBar("##fileTabs")) {
            for (int i = 0; i < tabs.size(); i++) {
                EditorTab t = tabs.get(i);
                String label = (t.dirty ? "* " : "") + t.label + "##ft" + i;
                boolean visible = ImGui.beginTabItem(label, t.open);
                if (visible) {
                    activeTab = i;
                    ImVec2 avail = ImGui.getContentRegionAvail();
                    if (ImGui.inputTextMultiline("##ed" + i, t.buffer,
                            avail.x, avail.y - 4, ImGuiInputTextFlags.AllowTabInput)) {
                        t.dirty = true;
                    }
                    ImGui.endTabItem();
                }
                if (!t.open.get()) {
                    if (tabs.size() > 1) {
                        tabs.remove(i--);
                        activeTab = Math.min(activeTab, tabs.size() - 1);
                    } else {
                        t.open.set(true);
                    }
                }
            }
            ImGui.endTabBar();
        }
        ImGui.end();
    }

    private void drawVoicePanel(float y, float x, float w, float h) {
        ImGui.setNextWindowPos(x, y, ImGuiCond.Always);
        ImGui.setNextWindowSize(w, h, ImGuiCond.Always);
        if (!ImGui.begin("Voice Input  [audio]", showVoice, PANEL_FLAGS)) { ImGui.end(); return; }

        pollVoiceResults();

        VoiceRecognizer.State vs = voice.getState();
        switch (vs) {
            case IDLE      -> ImGui.textDisabled("● Idle");
            case LISTENING -> {
                ImGui.pushStyleColor(ImGuiCol.Text, 0.20f, 0.90f, 0.30f, 1f);
                ImGui.text("● Escuchando...");
                ImGui.popStyleColor();
            }
            case ERROR -> {
                ImGui.pushStyleColor(ImGuiCol.Text, 0.90f, 0.25f, 0.25f, 1f);
                ImGui.text("● Error: " + voice.getLastError());
                ImGui.popStyleColor();
            }
        }

        ImGui.sameLine();
        if (vs == VoiceRecognizer.State.LISTENING) {
            if (ImGui.button("Detener")) voice.stop();
        } else {
            if (ImGui.button("Escuchar")) {
                if (!voice.isModelLoaded()) loadVoiceModel();
                if (voice.isModelLoaded() && !voice.start())
                    appendConsole("[VOICE] Error al abrir micrófono: " + voice.getLastError());
            }
            ImGui.sameLine();
            if (ImGui.button("Cargar modelo")) loadVoiceModel();
        }

        ImGui.setNextItemWidth(w - 24);
        ImGui.inputText("##modelpath", voiceModelPath);

        ImGui.separator();

        String partial = voice.getPartialText();
        if (!partial.isEmpty()) {
            ImGui.pushStyleColor(ImGuiCol.Text, 1.00f, 0.80f, 0.20f, 1f);
            ImGui.text("~ " + partial);
            ImGui.popStyleColor();
        } else {
            ImGui.textDisabled(vs == VoiceRecognizer.State.LISTENING ? "~ (esperando audio...)" : "~ ");
        }

        ImGui.separator();
        ImVec2 avail = ImGui.getContentRegionAvail();
        ImGui.inputTextMultiline("##voice", voiceLog, avail.x, avail.y,
            ImGuiInputTextFlags.ReadOnly);

        ImGui.end();
    }

    private void loadVoiceModel() {
        if (voice.loadModel(voiceModelPath.get()))
            appendConsole("[VOICE] Modelo cargado: " + voiceModelPath.get());
        else
            appendConsole("[VOICE] No se pudo cargar el modelo: " + voice.getLastError());
    }

    private void pollVoiceResults() {
        String text;
        while ((text = voice.pollResult()) != null) {
            voiceLog.set(voiceLog.get() + "> " + text + "\n");
            String cmd = processVoiceCommand(text);
            if (cmd != null) appendConsole("[VOICE] Comando ejecutado: " + cmd);
            else             appendConsole("[VOICE] Transcripción: " + text);
        }
    }

    private String processVoiceCommand(String text) {
        String t = text.toLowerCase();
        if (contains(t, "compilar","compile"))              { compile();                 return "compilar"; }
        if (contains(t, "ejecutar","correr","run"))         { executeCode();             return "ejecutar"; }
        if (contains(t, "guardar","save"))                  { saveCurrentTab();          return "guardar";  }
        if (contains(t, "limpiar","clear","borrar consola")){ consoleLog.set("");        return "limpiar consola"; }
        if (contains(t, "nuevo archivo","new file"))        { tabs.add(new EditorTab()); return "nuevo archivo";  }
        if (t.contains("for"))                              { insertBlock("for loop");   return "for loop";  }
        if (contains(t, "if","si entonces"))                { insertBlock("if / else");  return "if / else"; }
        if (contains(t, "while","mientras"))                { insertBlock("while");      return "while";     }
        if (contains(t, "funcion","función","function"))    { insertBlock("function");   return "function";  }
        if (t.contains("variable"))                         { insertBlock("variable");   return "variable";  }
        if (contains(t, "imprimir","print","println"))      { insertBlock("print");      return "print";     }
        if (contains(t, "retornar","return","retorno"))     { insertBlock("return");     return "return";    }
        return null;
    }

    private static boolean contains(String text, String... terms) {
        for (String term : terms) if (text.contains(term)) return true;
        return false;
    }

    private void drawConsolePanel(float y, float x, float w, float h) {
        ImGui.setNextWindowPos(x, y, ImGuiCond.Always);
        ImGui.setNextWindowSize(w, h, ImGuiCond.Always);
        if (!ImGui.begin("Console / Output", showConsole, PANEL_FLAGS)) { ImGui.end(); return; }
        ImVec2 avail = ImGui.getContentRegionAvail();
        ImGui.inputTextMultiline("##console", consoleLog, avail.x, avail.y - 28,
            ImGuiInputTextFlags.ReadOnly);
        if (ImGui.button("Clear"))        consoleLog.set("");
        ImGui.sameLine();
        if (ImGui.button("Compile (F5)")) compile();
        ImGui.sameLine();
        if (ImGui.button("Run (F6)"))     executeCode();
        ImGui.end();
    }

    private void handleDialogs() {
        if (triggerNewProject)  { ImGui.openPopup("New Project##dlg");  triggerNewProject  = false; }
        if (triggerOpenProject) { ImGui.openPopup("Open Project##dlg"); triggerOpenProject = false; }

        if (ImGui.beginPopupModal("New Project##dlg", ImGuiWindowFlags.AlwaysAutoResize)) {
            ImGui.text("Project name:");
            ImGui.setNextItemWidth(300);
            ImGui.inputText("##pname", dlgName);
            ImGui.text("Location (folder):");
            ImGui.setNextItemWidth(300);
            ImGui.inputText("##ploc", dlgLoc);
            ImGui.text("Template:");
            ImGui.setNextItemWidth(300);
            ImGui.combo("##ptpl", dlgTpl, TPL_LABELS);
            ImGui.separator();
            if (ImGui.button("Create", 120, 0)) { createProject(); ImGui.closeCurrentPopup(); }
            ImGui.sameLine();
            if (ImGui.button("Cancel", 120, 0)) ImGui.closeCurrentPopup();
            ImGui.endPopup();
        }

        if (ImGui.beginPopupModal("Open Project##dlg", ImGuiWindowFlags.AlwaysAutoResize)) {
            ImGui.text("Project path:");
            ImGui.setNextItemWidth(400);
            ImGui.inputText("##opath", dlgLoc);
            ImGui.separator();
            if (ImGui.button("Open", 120, 0)) {
                try {
                    pm.openProject(dlgLoc.get());
                    appendConsole("[PROJECT] Opened: " + pm.getRoot());
                } catch (IOException e) {
                    appendConsole("[ERROR] " + e.getMessage());
                }
                ImGui.closeCurrentPopup();
            }
            ImGui.sameLine();
            if (ImGui.button("Cancel", 120, 0)) ImGui.closeCurrentPopup();
            ImGui.endPopup();
        }
    }

    private void createProject() {
        try {
            ProjectManager.Template tpl = ProjectManager.Template.values()[dlgTpl.get()];
            pm.createProject(dlgName.get(), dlgLoc.get(), tpl);
            appendConsole("[PROJECT] Created: " + pm.getRoot());
        } catch (IOException e) {
            appendConsole("[ERROR] " + e.getMessage());
        }
    }

    private void openFileTab(Path path) {
        for (int i = 0; i < tabs.size(); i++) {
            if (path.equals(tabs.get(i).path)) { activeTab = i; return; }
        }
        try {
            tabs.add(new EditorTab(path, pm.readFile(path)));
            activeTab = tabs.size() - 1;
        } catch (IOException e) {
            appendConsole("[ERROR] Cannot read: " + path);
        }
    }

    private void saveCurrentTab() {
        if (tabs.isEmpty()) return;
        EditorTab t = tabs.get(activeTab);
        if (t.path == null) { appendConsole("[SAVE] Untitled — no path."); return; }
        try {
            pm.saveFile(t.path, t.buffer.get());
            t.dirty = false;
            appendConsole("[SAVE] " + t.path.getFileName());
        } catch (IOException e) {
            appendConsole("[ERROR] " + e.getMessage());
        }
    }

    private void insertBlock(String label) {
        if (tabs.isEmpty()) tabs.add(new EditorTab());
        EditorTab t = tabs.get(activeTab);
        String snippet = switch (label) {
            case "if / else" -> "if (condition) {\n    \n} else {\n    \n}\n";
            case "for loop"  -> "for (int i = 0; i < n; i++) {\n    \n}\n";
            case "while"     -> "while (condition) {\n    \n}\n";
            case "function"  -> "void myFunction() {\n    \n}\n";
            case "return"    -> "return value;\n";
            case "variable"  -> "int myVar = 0;\n";
            case "print"     -> "System.out.println(\"\");\n";
            default          -> label + "\n";
        };
        t.buffer.set(t.buffer.get() + snippet);
        t.dirty = true;
        appendConsole("[BLOCK] " + label);
    }

    private final HydraCompiler compiler = new HydraCompiler();

    private void compile() {
        if (tabs.isEmpty()) { appendConsole("[BUILD] Nada que compilar."); return; }
        String code = tabs.get(activeTab).buffer.get().trim();
        if (code.isBlank()) { appendConsole("[BUILD] El archivo está vacío."); return; }

        appendConsole("─────────────────────────────────");
        CompileResult r = compiler.compile(code);

        r.logs.forEach(this::appendConsole);
        r.warnings.forEach(w -> appendConsole("[WARN]  " + w));
        r.errors.forEach(e   -> appendConsole("[ERROR] " + e));

        if (r.success) {
            appendConsole("─────────────────────────────────");
            appendConsole("[IR]\n" + r.ir);
            appendConsole("[BUILD] Compilación exitosa.");
        } else {
            appendConsole("[BUILD] Compilación fallida — " + r.errors.size() + " error(es).");
        }
        appendConsole("─────────────────────────────────");
    }

    private void executeCode() { appendConsole("[RUN] Executing... (TODO)"); }

    private void appendConsole(String line) { consoleLog.set(consoleLog.get() + line + "\n"); }

    private void applyDarkTheme() {
        ImGui.styleColorsDark();
        ImVec4[] c = ImGui.getStyle().getColors();
        c[ImGuiCol.WindowBg]      .set(0.10f, 0.10f, 0.12f, 1.00f);
        c[ImGuiCol.TitleBg]       .set(0.08f, 0.08f, 0.10f, 1.00f);
        c[ImGuiCol.TitleBgActive] .set(0.18f, 0.36f, 0.60f, 1.00f);
        c[ImGuiCol.MenuBarBg]     .set(0.06f, 0.06f, 0.08f, 1.00f);
        c[ImGuiCol.Header]        .set(0.20f, 0.40f, 0.70f, 0.55f);
        c[ImGuiCol.HeaderHovered] .set(0.26f, 0.59f, 0.98f, 0.80f);
        c[ImGuiCol.Button]        .set(0.20f, 0.40f, 0.70f, 0.65f);
        c[ImGuiCol.ButtonHovered] .set(0.28f, 0.56f, 0.90f, 1.00f);
        c[ImGuiCol.FrameBg]       .set(0.14f, 0.14f, 0.18f, 1.00f);
        c[ImGuiCol.Tab]           .set(0.15f, 0.15f, 0.20f, 1.00f);
        c[ImGuiCol.TabHovered]    .set(0.28f, 0.56f, 0.90f, 1.00f);
        c[ImGuiCol.TabActive]     .set(0.18f, 0.36f, 0.60f, 1.00f);
        ImGui.getStyle().setColors(c);
    }
}
