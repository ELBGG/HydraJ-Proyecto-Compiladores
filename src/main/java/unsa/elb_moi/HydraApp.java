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

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedQueue;

public class HydraApp extends Application {

    // ── Estado general ─────────────────────────────────────────────────────────
    private final ProjectManager pm    = new ProjectManager();
    private final List<EditorTab> tabs = new ArrayList<>();
    private int activeTab = 0;

    private final ImString consoleLog = new ImString(32768);
    private final ImString voiceLog   = new ImString(4096);

    // ── Bloques de código ───────────────────────────────────────────────────────
    private static final String[] BLOCKS = {
            "si / sino", "para", "mientras", "funcion", "retornar",
            "variable", "imprimir", "imprimirln", "clase"
    };

    // ── Visibilidad de paneles ──────────────────────────────────────────────────
    private final ImBoolean showLeft    = new ImBoolean(true);
    private final ImBoolean showVoice   = new ImBoolean(true);
    private final ImBoolean showConsole = new ImBoolean(true);

    // ── Voz ────────────────────────────────────────────────────────────────────
    private final VoiceRecognizer voice = new VoiceRecognizer();
    private final ImString voiceModelPath = new ImString("D:/vosk-model-small-es-0.42", 512);
    private String pendingVoiceText = null;

    // ── Diálogos de proyecto ────────────────────────────────────────────────────
    private boolean        triggerNewProject  = false;
    private boolean        triggerOpenProject = false;
    private final ImString dlgName = new ImString("MyProject", 128);
    private final ImString dlgLoc  = new ImString(System.getProperty("user.home"), 512);
    private final ImInt    dlgTpl  = new ImInt(0);
    private static final String[] TPL_LABELS = Arrays.stream(ProjectManager.Template.values())
            .map(t -> t.label).toArray(String[]::new);

    // ── Tamaños de paneles (redimensionables) ───────────────────────────────────
    private float leftW    = 220f;
    private float voiceH   = 160f;
    private float consH    = 200f;

    // Mínimos
    private static final float MIN_LEFT_W  = 120f;
    private static final float MIN_VOICE_H = 80f;
    private static final float MIN_CONS_H  = 80f;
    private static final float SPLITTER_THICKNESS = 6f;

    // ── Compilación y ejecución ─────────────────────────────────────────────────
    private final HydraCompiler compiler = new HydraCompiler();
    private Path lastCompiledClass = null;   // carpeta donde quedaron los .class
    private String lastMainClass   = null;   // nombre de la clase principal

    // ── Proceso de ejecución en curso ───────────────────────────────────────────
    private Process runningProcess = null;
    private Thread  stdoutThread   = null;
    private Thread  stderrThread   = null;

    // ── Cola thread-safe para líneas de consola producidas desde otros hilos ────
    // appendConsole() puede llamarse desde hilos stdout/stderr; esta cola evita
    // la condición de carrera. Se drena en el hilo principal de ImGui cada frame.
    private final ConcurrentLinkedQueue<String> pendingConsoleLines =
            new ConcurrentLinkedQueue<>();

    // ──────────────────────────────────────────────────────────────────────────
    @Override
    protected void configure(Configuration config) {
        config.setTitle("HydraJ Transpilador");
        config.setWidth(1280);
        config.setHeight(800);
    }

    @Override
    protected void initImGui(Configuration config) {
        super.initImGui(config);

        ImGuiIO io = ImGui.getIO();

        // ── Fuente con soporte completo de caracteres latinos/UTF-8 ────────────
        // Primero intentamos la ruta del proyecto; si no existe, usamos la fuente default.
        String fontPath = "src/main/resources/assets/fonts/ARIAL.TTF";
        File fontFile = new File(fontPath);
        if (fontFile.exists()) {
            // Construir rangos con el builder oficial de imgui-java.
            // short[] directo no es correcto; ImFontGlyphRangesBuilder produce el
            // array terminado en 0 que addFontFromFileTTF necesita.
            imgui.ImFontGlyphRangesBuilder rangesBuilder = new imgui.ImFontGlyphRangesBuilder();
            rangesBuilder.addRanges(io.getFonts().getGlyphRangesDefault());
            // Latin Extended-A: cubre á é í ó ú ñ ü ¿ ¡ y resto de diacríticos comunes
            rangesBuilder.addChar((char) 0x0100);
            rangesBuilder.addChar((char) 0x017F);
            short[] ranges = rangesBuilder.buildRanges();

            imgui.ImFontConfig cfg = new imgui.ImFontConfig();
            cfg.setMergeMode(false);
            cfg.setPixelSnapH(true);
            io.getFonts().addFontFromFileTTF(fontFile.getAbsolutePath(), 18.0f, cfg, ranges);
        }
        // Si no hay fuente externa, ImGui usará la fuente interna.
        // NO llamamos io.getFonts().build() aquí: super.initImGui() ya lo hace
        // internamente y una segunda llamada causaría un doble-build con imgui-java.
        applyDarkTheme();

        tabs.add(new EditorTab());
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            voice.close();
            killRunningProcess();
        }));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  BUCLE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════════
    @Override
    public void process() {
        // Volcar mensajes de consola encolados desde hilos de stdout/stderr
        flushConsolePending();

        float menuH   = ImGui.getFrameHeight();
        float vw      = ImGui.getMainViewport().getSizeX();
        float vh      = ImGui.getMainViewport().getSizeY() - menuH;

        float currentLeftW  = showLeft.get()    ? leftW  : 0;
        float currentVoiceH = showVoice.get()   ? voiceH : 0;
        float currentConsH  = showConsole.get() ? consH  : 0;

        float editorW = vw - currentLeftW;
        float editorH = vh - currentVoiceH - currentConsH;

        drawMenuBar();
        if (showLeft.get())    drawLeftPanel(menuH, vh, currentLeftW);
        drawEditorPanel(menuH, currentLeftW, editorW, editorH);
        if (showVoice.get())   drawVoicePanel(menuH + editorH, currentLeftW, editorW, currentVoiceH);
        if (showConsole.get()) drawConsolePanel(menuH + editorH + currentVoiceH, currentLeftW, editorW, currentConsH);

        // Splitters redimensionables ──────────────────────────────────────────
        if (showLeft.get())
            drawVerticalSplitter(menuH, currentLeftW, vh);
        if (showVoice.get() || showConsole.get())
            drawHorizontalSplitter(menuH, currentLeftW, editorW, editorH, currentVoiceH, currentConsH, vh);

        handleDialogs();
    }

    // ── Splitter vertical (panel izquierdo) ─────────────────────────────────────
    private void drawVerticalSplitter(float y, float x, float h) {
        ImGui.setNextWindowPos(x - SPLITTER_THICKNESS / 2f, y, ImGuiCond.Always);
        ImGui.setNextWindowSize(SPLITTER_THICKNESS, h, ImGuiCond.Always);
        int flags = ImGuiWindowFlags.NoTitleBar | ImGuiWindowFlags.NoScrollbar
                | ImGuiWindowFlags.NoSavedSettings | ImGuiWindowFlags.NoBackground
                | ImGuiWindowFlags.NoMove | ImGuiWindowFlags.NoResize | ImGuiWindowFlags.NoCollapse;
        ImGui.pushStyleVar(ImGuiStyleVar.WindowPadding, 0, 0);
        ImGui.pushStyleVar(ImGuiStyleVar.WindowMinSize, 1, 1);
        if (ImGui.begin("##vsplit", flags)) {
            ImGui.invisibleButton("##vdrag", SPLITTER_THICKNESS, h);
            if (ImGui.isItemHovered()) ImGui.setMouseCursor(ImGuiMouseCursor.ResizeEW);
            if (ImGui.isItemActive()) {
                leftW += ImGui.getIO().getMouseDeltaX();
                leftW  = Math.max(MIN_LEFT_W, leftW);
            }
        }
        ImGui.end();
        ImGui.popStyleVar(2);
    }

    // ── Splitters horizontales (voice / console) ────────────────────────────────
    private void drawHorizontalSplitter(float menuH, float x, float w,
                                        float editorH, float voiceH_, float consH_, float vh) {
        float vw = ImGui.getMainViewport().getSizeX();

        // Borde entre editor y voice (o consola)
        if (showVoice.get()) {
            float splitY = menuH + editorH;
            ImGui.setNextWindowPos(x, splitY - SPLITTER_THICKNESS / 2f, ImGuiCond.Always);
            ImGui.setNextWindowSize(w, SPLITTER_THICKNESS, ImGuiCond.Always);
            int flags = ImGuiWindowFlags.NoTitleBar | ImGuiWindowFlags.NoScrollbar
                    | ImGuiWindowFlags.NoSavedSettings | ImGuiWindowFlags.NoBackground
                    | ImGuiWindowFlags.NoMove | ImGuiWindowFlags.NoResize | ImGuiWindowFlags.NoCollapse;
            ImGui.pushStyleVar(ImGuiStyleVar.WindowPadding, 0, 0);
            ImGui.pushStyleVar(ImGuiStyleVar.WindowMinSize, 1, 1);
            if (ImGui.begin("##hsplit_voice", flags)) {
                ImGui.invisibleButton("##hdrag_voice", w, SPLITTER_THICKNESS);
                if (ImGui.isItemHovered()) ImGui.setMouseCursor(ImGuiMouseCursor.ResizeNS);
                if (ImGui.isItemActive()) {
                    voiceH -= ImGui.getIO().getMouseDeltaY();
                    voiceH  = Math.max(MIN_VOICE_H, voiceH);
                }
            }
            ImGui.end();
            ImGui.popStyleVar(2);
        }

        // Borde entre voice y consola
        if (showVoice.get() && showConsole.get()) {
            // Bug fix: usar el campo `voiceH` (actualizado en tiempo real) en vez del
            // parámetro `voiceH_` (snapshot del inicio del frame), para que arrastrar
            // el primer splitter actualice correctamente la posición del segundo.
            float splitY = menuH + editorH + voiceH;
            ImGui.setNextWindowPos(x, splitY - SPLITTER_THICKNESS / 2f, ImGuiCond.Always);
            ImGui.setNextWindowSize(w, SPLITTER_THICKNESS, ImGuiCond.Always);
            int flags = ImGuiWindowFlags.NoTitleBar | ImGuiWindowFlags.NoScrollbar
                    | ImGuiWindowFlags.NoSavedSettings | ImGuiWindowFlags.NoBackground
                    | ImGuiWindowFlags.NoMove | ImGuiWindowFlags.NoResize | ImGuiWindowFlags.NoCollapse;
            ImGui.pushStyleVar(ImGuiStyleVar.WindowPadding, 0, 0);
            ImGui.pushStyleVar(ImGuiStyleVar.WindowMinSize, 1, 1);
            if (ImGui.begin("##hsplit_cons", flags)) {
                ImGui.invisibleButton("##hdrag_cons", w, SPLITTER_THICKNESS);
                if (ImGui.isItemHovered()) ImGui.setMouseCursor(ImGuiMouseCursor.ResizeNS);
                if (ImGui.isItemActive()) {
                    consH -= ImGui.getIO().getMouseDeltaY();
                    consH  = Math.max(MIN_CONS_H, consH);
                }
            }
            ImGui.end();
            ImGui.popStyleVar(2);
        }

        // Splitter inferior: si sólo hay consola
        if (!showVoice.get() && showConsole.get()) {
            float splitY = menuH + editorH;
            ImGui.setNextWindowPos(x, splitY - SPLITTER_THICKNESS / 2f, ImGuiCond.Always);
            ImGui.setNextWindowSize(w, SPLITTER_THICKNESS, ImGuiCond.Always);
            int flags = ImGuiWindowFlags.NoTitleBar | ImGuiWindowFlags.NoScrollbar
                    | ImGuiWindowFlags.NoSavedSettings | ImGuiWindowFlags.NoBackground
                    | ImGuiWindowFlags.NoMove | ImGuiWindowFlags.NoResize | ImGuiWindowFlags.NoCollapse;
            ImGui.pushStyleVar(ImGuiStyleVar.WindowPadding, 0, 0);
            ImGui.pushStyleVar(ImGuiStyleVar.WindowMinSize, 1, 1);
            if (ImGui.begin("##hsplit_cons2", flags)) {
                ImGui.invisibleButton("##hdrag_cons2", w, SPLITTER_THICKNESS);
                if (ImGui.isItemHovered()) ImGui.setMouseCursor(ImGuiMouseCursor.ResizeNS);
                if (ImGui.isItemActive()) {
                    consH -= ImGui.getIO().getMouseDeltaY();
                    consH  = Math.max(MIN_CONS_H, consH);
                }
            }
            ImGui.end();
            ImGui.popStyleVar(2);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  MENÚ PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════════
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
            if (ImGui.menuItem("Run",     "F6")) runCompiledCode();
            ImGui.endMenu();
        }
        if (ImGui.beginMenu("View")) {
            ImGui.menuItem("Left Panel",  "", showLeft);
            ImGui.menuItem("Voice Panel", "", showVoice);
            ImGui.menuItem("Console",     "", showConsole);
            ImGui.endMenu();
        }
        if (ImGui.beginMenu("Herramientas")) {
            if (ImGui.menuItem("Mostrar Tokens"))            mostrarTokens();
            if (ImGui.menuItem("Mostrar codigo enumerado"))  mostrarCodigoConLineas();
            ImGui.endMenu();
        }
        if (ImGui.beginMenu("Help")) {
            if (ImGui.menuItem("About"))
                appendConsole("[HydraJ] Transpilador español → Java — teclado, bloques, voz");
            ImGui.endMenu();
        }
        ImGui.endMainMenuBar();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PANEL IZQUIERDO
    // ═══════════════════════════════════════════════════════════════════════════
    private void drawLeftPanel(float y, float h, float w) {
        ImGui.setNextWindowPos(0, y, ImGuiCond.Always);
        ImGui.setNextWindowSize(w, h, ImGuiCond.Always);
        int flags = ImGuiWindowFlags.NoResize | ImGuiWindowFlags.NoMove | ImGuiWindowFlags.NoCollapse;
        if (!ImGui.begin("##left", showLeft, flags)) { ImGui.end(); return; }

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
        return n.startsWith(".") || n.equals("build") || n.equals("target")
                || n.equals("out") || n.equals("__hydra_out__");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PANEL EDITOR  (con numeración de líneas)
    // ═══════════════════════════════════════════════════════════════════════════
    private void drawEditorPanel(float y, float x, float w, float h) {
        ImGui.setNextWindowPos(x, y, ImGuiCond.Always);
        ImGui.setNextWindowSize(w, h, ImGuiCond.Always);
        int flags = ImGuiWindowFlags.NoResize | ImGuiWindowFlags.NoMove | ImGuiWindowFlags.NoCollapse;
        if (!ImGui.begin("Editor", flags)) { ImGui.end(); return; }

        // Barra superior ───────────────────────────────────────────────────────
        if (ImGui.button("Save")) saveCurrentTab();
        ImGui.sameLine();
        if (ImGui.button("Compile")) compile();
        ImGui.sameLine();
        if (ImGui.button("Run")) runCompiledCode();
        ImGui.sameLine();
        String path = tabs.isEmpty() ? "—" :
                tabs.get(activeTab).path != null
                ? tabs.get(activeTab).path.toString() : "untitled";
        ImGui.textDisabled(path);
        ImGui.separator();

        if (tabs.isEmpty()) { ImGui.end(); return; }

        if (ImGui.beginTabBar("##fileTabs")) {
            for (int i = 0; i < tabs.size(); i++) {
                EditorTab t = tabs.get(i);
                String label = (t.dirty ? "* " : "") + t.label + "##ft" + i;
                boolean visible = ImGui.beginTabItem(label, t.open);
                if (visible) {
                    activeTab = i;
                    // Bug fix: usar el ancho disponible real del área de contenido,
                    // no `w` (ancho de la ventana completa con decoraciones), que
                    // causaba overflow horizontal en el editor.
                    ImVec2 avail = ImGui.getContentRegionAvail();
                    drawEditorWithLineNumbers(t, avail.x, avail.y - 4);
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

    /**
     * Dibuja un editor con numeración de líneas a la izquierda.
     *
     * Correcciones aplicadas:
     *  - Bug 1: el scroll del inputTextMultiline se lee desde un child window que
     *    envuelve al widget; de este modo ImGui.getScrollY() lee el child correcto
     *    y no la ventana padre (Editor).
     *  - Bug 2: totalW ya viene como avail.x desde el llamador (ver drawEditorPanel),
     *    así que edW ya no produce overflow.
     */
    private void drawEditorWithLineNumbers(EditorTab tab, float totalW, float h) {
        float lineNumW = 48f;
        float edW      = totalW - lineNumW - 8f;

        // ── Columna de números ──────────────────────────────────────────────────
        ImGui.pushStyleColor(ImGuiCol.ChildBg, 0.12f, 0.12f, 0.16f, 1f);
        ImGui.beginChild("##lineNums", lineNumW, h, false,
                ImGuiWindowFlags.NoScrollbar | ImGuiWindowFlags.NoScrollWithMouse);

        String[] lines = tab.buffer.get().split("\n", -1);
        int totalLines = Math.max(lines.length, 1);

        // Sincronizamos el scroll con el valor capturado en el frame anterior
        ImGui.setScrollY(tab.editorScrollY);

        ImGui.pushStyleColor(ImGuiCol.Text, 0.50f, 0.55f, 0.65f, 1f);
        float topPad = ImGui.getStyle().getFramePaddingY();
        ImGui.dummy(lineNumW, topPad);
        for (int n = 1; n <= totalLines; n++) {
            ImGui.text(String.format("%3d ", n));
        }
        ImGui.popStyleColor();
        ImGui.endChild();
        ImGui.popStyleColor();

        ImGui.sameLine(0, 4);

        // ── Área de edición envuelta en un child para poder leer su scroll ──────
        // El child hereda el scroll interno del inputTextMultiline cuando éste es
        // el único widget dentro de él. De este modo getScrollY() es preciso.
        ImGui.pushStyleColor(ImGuiCol.FrameBg,   0.14f, 0.14f, 0.18f, 1f);
        ImGui.pushStyleColor(ImGuiCol.ChildBg,   0.14f, 0.14f, 0.18f, 1f);
        ImGui.beginChild("##edChild", edW, h, false,
                ImGuiWindowFlags.NoScrollbar | ImGuiWindowFlags.NoScrollWithMouse);

        boolean changed = ImGui.inputTextMultiline(
                "##ed_" + tab.label,
                tab.buffer,
                edW, h,
                ImGuiInputTextFlags.AllowTabInput
        );
        if (changed) tab.dirty = true;

        // Leemos el scroll DENTRO de este child: apunta al widget recién dibujado
        tab.editorScrollY = ImGui.getScrollY();

        ImGui.endChild();
        ImGui.popStyleColor(2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PANEL VOZ
    // ═══════════════════════════════════════════════════════════════════════════
    private void drawVoicePanel(float y, float x, float w, float h) {
        ImGui.setNextWindowPos(x, y, ImGuiCond.Always);
        ImGui.setNextWindowSize(w, h, ImGuiCond.Always);
        int flags = ImGuiWindowFlags.NoResize | ImGuiWindowFlags.NoMove | ImGuiWindowFlags.NoCollapse;
        if (!ImGui.begin("Voice Input  [audio]", showVoice, flags)) { ImGui.end(); return; }

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

        if (pendingVoiceText != null) {
            ImGui.pushStyleColor(ImGuiCol.Text, 1.00f, 0.80f, 0.20f, 1f);
            ImGui.text("Insertar: \"" + pendingVoiceText + "\"?  (confirmar / cancelar)");
            ImGui.popStyleColor();
        } else {
            String partial = voice.getPartialText();
            if (!partial.isEmpty()) {
                ImGui.pushStyleColor(ImGuiCol.Text, 1.00f, 0.80f, 0.20f, 1f);
                ImGui.text("~ " + partial);
                ImGui.popStyleColor();
            } else {
                ImGui.textDisabled(vs == VoiceRecognizer.State.LISTENING ? "~ (esperando audio...)" : "~ ");
            }
        }

        ImGui.separator();
        ImVec2 avail = ImGui.getContentRegionAvail();
        ImGui.inputTextMultiline("##voice", voiceLog, avail.x, avail.y,
                ImGuiInputTextFlags.ReadOnly);
        ImGui.end();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PANEL CONSOLA
    // ═══════════════════════════════════════════════════════════════════════════
    private void drawConsolePanel(float y, float x, float w, float h) {
        ImGui.setNextWindowPos(x, y, ImGuiCond.Always);
        ImGui.setNextWindowSize(w, h, ImGuiCond.Always);
        int flags = ImGuiWindowFlags.NoResize | ImGuiWindowFlags.NoMove | ImGuiWindowFlags.NoCollapse;
        if (!ImGui.begin("Console / Output", showConsole, flags)) { ImGui.end(); return; }

        ImVec2 avail = ImGui.getContentRegionAvail();
        ImGui.inputTextMultiline("##console", consoleLog, avail.x, avail.y - 30,
                ImGuiInputTextFlags.ReadOnly);

        if (ImGui.button("Clear"))         consoleLog.set("");
        ImGui.sameLine();
        if (ImGui.button("Compile (F5)"))  compile();
        ImGui.sameLine();
        if (ImGui.button("Run (F6)"))      runCompiledCode();
        ImGui.sameLine();
        if (runningProcess != null && runningProcess.isAlive()) {
            ImGui.pushStyleColor(ImGuiCol.Button, 0.70f, 0.15f, 0.15f, 1f);
            if (ImGui.button("Stop")) killRunningProcess();
            ImGui.popStyleColor();
        }
        ImGui.end();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  DIÁLOGOS
    // ═══════════════════════════════════════════════════════════════════════════
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
                    appendConsole("[PROJECT] Abierto: " + pm.getRoot());
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

    // ═══════════════════════════════════════════════════════════════════════════
    //  COMPILACIÓN Y EJECUCIÓN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 1. Transpila el código HydraJ → Java
     * 2. Guarda el .java generado
     * 3. Compila con javac → genera .class
     */
    private void compile() {
        if (tabs.isEmpty()) { appendConsole("[BUILD] Nada que compilar."); return; }
        String code = tabs.get(activeTab).buffer.get().trim();
        if (code.isBlank()) { appendConsole("[BUILD] El archivo está vacío."); return; }

        appendConsole("─────────────────────────────────");
        appendConsole("[BUILD] Transpilando HydraJ → Java...");

        CompileResult r = compiler.compile(code);
        r.logs.forEach(this::appendConsole);
        r.warnings.forEach(w -> appendConsole("[WARN]  " + w));
        r.errors.forEach(e   -> appendConsole("[ERROR] " + e));

        if (!r.success) {
            appendConsole("[BUILD] Transpilacion fallida — " + r.errors.size() + " error(es).");
            appendConsole("─────────────────────────────────");
            lastCompiledClass = null;
            lastMainClass     = null;
            return;
        }

        appendConsole("[JAVA generado]\n" + r.ir);
        appendConsole("─────────────────────────────────");

        // ── Guardar .java y compilar con javac ────────────────────────────────
        try {
            // Carpeta de salida temporal dentro del directorio de trabajo
            Path outDir = resolveOutputDir();
            Files.createDirectories(outDir);

            // Detectar nombre de clase principal (primera "public class NNN")
            String mainClass = detectMainClass(r.ir);
            if (mainClass == null) {
                appendConsole("[BUILD] No se encontro clase principal (public class ...).");
                return;
            }

            Path javaFile = outDir.resolve(mainClass + ".java");
            Files.writeString(javaFile, r.ir, StandardCharsets.UTF_8);
            appendConsole("[BUILD] Archivo Java: " + javaFile);

            // Compilar con javac
            appendConsole("[BUILD] Compilando con javac...");
            ProcessBuilder pb = new ProcessBuilder("javac",
                    "-encoding", "UTF-8",
                    "-d", outDir.toString(),
                    javaFile.toString());
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            String javacOut = new String(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int exit = proc.waitFor();

            if (!javacOut.isBlank()) appendConsole(javacOut);

            if (exit == 0) {
                lastCompiledClass = outDir;
                lastMainClass     = mainClass;
                appendConsole("[BUILD] Compilacion exitosa → .class generado en: " + outDir);
            } else {
                appendConsole("[BUILD] javac reporto errores (codigo " + exit + ").");
                lastCompiledClass = null;
                lastMainClass     = null;
            }

        } catch (Exception e) {
            appendConsole("[BUILD] Error al invocar javac: " + e.getMessage());
            appendConsole("[BUILD] Asegurate de que 'javac' este en el PATH del sistema.");
        }
        appendConsole("─────────────────────────────────");
    }

    /**
     * Ejecuta el .class generado usando 'java' en un proceso separado.
     * La salida se redirige a la consola del IDE en tiempo real.
     */
    private void runCompiledCode() {
        if (lastCompiledClass == null || lastMainClass == null) {
            appendConsole("[RUN] Primero debes compilar exitosamente (F5).");
            return;
        }
        if (runningProcess != null && runningProcess.isAlive()) {
            appendConsole("[RUN] Ya hay un proceso en ejecución. Usa Stop para detenerlo.");
            return;
        }

        appendConsole("─────────────────────────────────");
        appendConsole("[RUN] Ejecutando: java " + lastMainClass);

        try {
            ProcessBuilder pb = new ProcessBuilder("java",
                    "-cp", lastCompiledClass.toString(),
                    lastMainClass);
            pb.redirectErrorStream(false);  // stderr y stdout por separado
            runningProcess = pb.start();

            // Hilo para stdout
            Process proc = runningProcess;
            stdoutThread = new Thread(() -> {
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(proc.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        final String l = line;
                        appendConsole("  " + l);
                    }
                } catch (IOException ignored) {}
            }, "hydra-stdout");
            stdoutThread.setDaemon(true);
            stdoutThread.start();

            // Hilo para stderr
            stderrThread = new Thread(() -> {
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(proc.getErrorStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        final String l = line;
                        appendConsole("[ERR] " + l);
                    }
                } catch (IOException ignored) {}
                // Al terminar, notificamos
                int code = 0;
                try { code = proc.waitFor(); } catch (InterruptedException ignored) {}
                final int exitCode = code;
                appendConsole("[RUN] Proceso terminado con código: " + exitCode);
                appendConsole("─────────────────────────────────");
            }, "hydra-stderr");
            stderrThread.setDaemon(true);
            stderrThread.start();

        } catch (IOException e) {
            appendConsole("[RUN] Error al iniciar 'java': " + e.getMessage());
            appendConsole("[RUN] Asegurate de que 'java' este en el PATH del sistema.");
        }
    }

    private void killRunningProcess() {
        if (runningProcess != null) {
            runningProcess.destroyForcibly();
            runningProcess = null;
            appendConsole("[RUN] Proceso detenido.");
        }
    }

    /** Detecta el nombre de la primera clase pública en el código Java generado. */
    private static String detectMainClass(String javaCode) {
        for (String line : javaCode.split("\n")) {
            String t = line.trim();
            if (t.startsWith("public class ")) {
                String rest = t.substring("public class ".length()).trim();
                int end = rest.indexOf(' ');
                if (end < 0) end = rest.indexOf('{');
                if (end < 0) end = rest.length();
                return rest.substring(0, end).trim();
            }
        }
        return null;
    }

    /** Carpeta de salida: dentro del proyecto si está abierto, o en temp. */
    private Path resolveOutputDir() {
        if (pm.hasProject()) {
            return pm.getRoot().resolve("__hydra_out__");
        }
        // Sin proyecto: usar carpeta temporal junto al ejecutable
        return Path.of(System.getProperty("user.dir")).resolve("__hydra_out__");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  ARCHIVOS
    // ═══════════════════════════════════════════════════════════════════════════
    private void saveCurrentTab() {
        if (tabs.isEmpty()) return;
        EditorTab t = tabs.get(activeTab);
        if (t.path == null) {
            appendConsole("[SAVE] Archivo sin nombre — no se puede guardar automaticamente.");
            appendConsole("[SAVE] Usa File > Save As... (pendiente de implementar)");
            return;
        }
        try {
            // Guardar siempre en UTF-8
            Files.writeString(t.path, t.buffer.get(), StandardCharsets.UTF_8);
            t.dirty = false;
            appendConsole("[SAVE] Guardado: " + t.path.getFileName());
        } catch (IOException e) {
            appendConsole("[ERROR] No se pudo guardar: " + e.getMessage());
        }
    }

    private void openFileTab(Path path) {
        for (int i = 0; i < tabs.size(); i++) {
            if (path.equals(tabs.get(i).path)) { activeTab = i; return; }
        }
        try {
            // Leer siempre en UTF-8
            String content = Files.readString(path, StandardCharsets.UTF_8);
            tabs.add(new EditorTab(path, content));
            activeTab = tabs.size() - 1;
        } catch (IOException e) {
            appendConsole("[ERROR] No se puede leer: " + path);
        }
    }

    private void createProject() {
        try {
            ProjectManager.Template tpl = ProjectManager.Template.values()[dlgTpl.get()];
            pm.createProject(dlgName.get(), dlgLoc.get(), tpl);
            appendConsole("[PROJECT] Creado: " + pm.getRoot());
        } catch (IOException e) {
            appendConsole("[ERROR] " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  VOZ
    // ═══════════════════════════════════════════════════════════════════════════
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
            if (cmd != null) appendConsole("[VOICE] Comando: " + cmd);
            else             appendConsole("[VOICE] Transcripcion: " + text);
        }
    }

    private String processVoiceCommand(String text) {
        String t = text.toLowerCase();

        if (contains(t, "confirmar")) {
            if (pendingVoiceText != null) {
                insertarTextoLibre(pendingVoiceText);
                pendingVoiceText = null;
                return "confirmar";
            }
            return null;
        }
        if (contains(t, "cancelar")) {
            if (pendingVoiceText != null) {
                appendConsole("[VOICE] Cancelado: " + pendingVoiceText);
                pendingVoiceText = null;
            }
            return "cancelar";
        }
        if (contains(t, "deshacer")) {
            if (!tabs.isEmpty()) {
                boolean ok = tabs.get(activeTab).deshacer();
                appendConsole(ok ? "[VOICE] Deshecho." : "[VOICE] Nada que deshacer.");
            }
            return "deshacer";
        }

        if (contains(t, "compilar"))                             { compile();                 return "compilar";        }
        if (contains(t, "ejecutar", "correr", "run"))            { runCompiledCode();          return "ejecutar";        }
        if (contains(t, "guardar", "save"))                      { saveCurrentTab();           return "guardar";         }
        if (contains(t, "limpiar", "clear", "borrar consola"))   { consoleLog.set("");         return "limpiar consola"; }
        if (contains(t, "nuevo archivo", "new file"))            { tabs.add(new EditorTab()); return "nuevo archivo";   }

        if (contains(t, "para", "para bucle"))                   { insertBlock("para");        return "para";            }
        if (contains(t, "si entonces", "bloque si"))             { insertBlock("si / sino");   return "si / sino";       }
        if (contains(t, "mientras"))                             { insertBlock("mientras");    return "mientras";        }
        if (contains(t, "funcion", "función", "function"))       { insertBlock("funcion");     return "funcion";         }
        if (contains(t, "clase", "class"))                       { insertBlock("clase");       return "clase";           }
        if (t.contains("variable"))                              { insertBlock("variable");    return "variable";        }
        if (contains(t, "imprimirln", "println"))                { insertBlock("imprimirln");  return "imprimirln";      }
        if (contains(t, "imprimir",   "print"))                  { insertBlock("imprimir");    return "imprimir";        }
        if (contains(t, "retornar", "retorno", "return"))        { insertBlock("retornar");    return "retornar";        }

        if (!t.isBlank()) {
            pendingVoiceText = text;
            appendConsole("[VOICE] Pendiente: " + text);
            return null;
        }
        return null;
    }

    private void insertBlock(String label) {
        if (tabs.isEmpty()) tabs.add(new EditorTab());
        EditorTab t = tabs.get(activeTab);
        t.guardarEstado();
        String snippet = switch (label) {
            case "si / sino"  -> "si (condicion) {\n    // instrucciones\n} sino {\n    // instrucciones\n}\n";
            case "para"       -> "para (entero i = 0; i < limite; i++) {\n    // instrucciones\n}\n";
            case "mientras"   -> "mientras (condicion) {\n    // instrucciones\n}\n";
            case "funcion"    -> "funcion entero nombreFuncion() {\n    // instrucciones\n    retornar 0;\n}\n";
            case "clase"      -> "clase NombreClase {\n    // atributos y metodos\n}\n";
            case "retornar"   -> "retornar valor;\n";
            case "variable"   -> "entero nombreVariable = valor;\n";
            case "imprimir"   -> "imprimir(expresion);\n";
            case "imprimirln" -> "imprimirln(expresion);\n";
            default           -> label + "\n";
        };
        t.buffer.set(t.buffer.get() + snippet);
        t.dirty = true;
        appendConsole("[BLOCK] " + label);
    }

    private void insertarTextoLibre(String texto) {
        String normalizado = normalizarVoz(texto);
        if (tabs.isEmpty()) tabs.add(new EditorTab());
        EditorTab t = tabs.get(activeTab);
        t.guardarEstado();
        t.buffer.set(t.buffer.get() + normalizado + "\n");
        t.dirty = true;
        appendConsole("[VOICE] Insertado: " + normalizado);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  HERRAMIENTAS
    // ═══════════════════════════════════════════════════════════════════════════
    private void mostrarTokens() {
        if (tabs.isEmpty()) { appendConsole("[TOKENS] Nada que mostrar."); return; }
        String code = tabs.get(activeTab).buffer.get();
        unsa.elb_moi.compiler.Lexer lexer = new unsa.elb_moi.compiler.Lexer(code);
        List<unsa.elb_moi.compiler.Token> tokens = lexer.tokenize();
        StringBuilder sb = new StringBuilder("TOKENS:\n");
        for (unsa.elb_moi.compiler.Token tk : tokens) {
            sb.append("[").append(tk.type).append("] '").append(tk.value)
                    .append("' @").append(tk.line).append(":").append(tk.col).append("\n");
        }
        appendConsole(sb.toString());
    }

    private void mostrarCodigoConLineas() {
        if (tabs.isEmpty()) { appendConsole("[CODIGO] Nada que mostrar."); return; }
        String[] lineas = tabs.get(activeTab).buffer.get().split("\n");
        StringBuilder sb = new StringBuilder("CODIGO ENUMERADO:\n");
        for (int i = 0; i < lineas.length; i++) {
            sb.append(String.format("%4d | %s\n", i + 1, lineas[i]));
        }
        appendConsole(sb.toString());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  UTILIDADES
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Thread-safe: puede llamarse desde hilos stdout/stderr.
     * Las líneas se encolan y se vuelcan al ImString en el hilo principal de ImGui.
     */
    private void appendConsole(String line) {
        pendingConsoleLines.add(line);
    }

    /**
     * Debe llamarse una vez por frame desde el hilo principal de ImGui
     * (p. ej. al inicio de drawConsolePanel o de process()).
     * Vuelca todas las líneas pendientes al ImString de consola.
     */
    private void flushConsolePending() {
        String line;
        while ((line = pendingConsoleLines.poll()) != null) {
            consoleLog.set(consoleLog.get() + line + "\n");
        }
    }

    private static boolean contains(String text, String... terms) {
        for (String term : terms) if (text.contains(term)) return true;
        return false;
    }

    // ── Normalización de voz ────────────────────────────────────────────────────
    private String normalizarVoz(String texto) {
        String t = texto.toLowerCase().trim();
        t = reemplazarLetras(t);
        t = t.replaceAll("sí", "si");
        t = t.replaceAll("igual(es)? a", "=").replaceAll("\\bigual\\b", "=");
        t = t.replaceAll("\\bpor\\b", "*").replaceAll("\\bentre\\b", "/");
        t = t.replaceAll("más más|mas mas", "++").replaceAll("menos menos", "--");
        t = t.replaceAll("más igual|mas igual", "+=").replaceAll("menos igual", "-=");
        t = t.replaceAll("mayor o igual que", ">=").replaceAll("menor o igual que", "<=");
        t = t.replaceAll("mayor que", ">").replaceAll("menor que", "<");
        t = t.replaceAll("punto y coma", ";").replaceAll("\\bnulo\\b", "null");
        t = convertirNumeros(t);

        if (t.matches("^entero [a-z][a-z0-9_]* *=.*"))  { if (!t.endsWith(";")) t += ";"; return t; }
        if (t.matches("^si .+ entonces"))                 { return t.replaceAll("^si (.+) entonces$", "si ($1) {\n    \n}"); }
        if (t.startsWith("imprimirln "))                  { return "imprimirln(" + t.substring(11).trim() + ");"; }
        if (t.startsWith("imprimir "))                    { return "imprimir("   + t.substring(9).trim()  + ");"; }
        if (!t.endsWith(";") && !t.endsWith("}") && !t.endsWith("{")) t += ";";
        return t;
    }

    private String reemplazarLetras(String t) {
        return t.replaceAll("\\bve\\b","v").replaceAll("\\bbe\\b","b")
                .replaceAll("\\bce\\b","c").replaceAll("\\bde\\b","d")
                .replaceAll("\\befe\\b","f").replaceAll("\\bge\\b","g")
                .replaceAll("\\bhache\\b","h").replaceAll("\\bjota\\b","j")
                .replaceAll("\\bka\\b","k").replaceAll("\\bel\\b","l")
                .replaceAll("\\beme\\b","m").replaceAll("\\bene\\b","n")
                .replaceAll("\\bpe\\b","p").replaceAll("\\bcu\\b","q")
                .replaceAll("\\berre\\b","r").replaceAll("\\bese\\b","s")
                .replaceAll("\\bte\\b","t").replaceAll("\\buve\\b","v")
                .replaceAll("\\bdoble ve\\b","w").replaceAll("\\bequis\\b","x")
                .replaceAll("\\bye\\b|\\bigriega\\b","y").replaceAll("\\bzeta\\b","z");
    }

    private String convertirNumeros(String t) {
        return t.replaceAll("\\bcero\\b","0").replaceAll("\\buno\\b","1")
                .replaceAll("\\bdos\\b","2").replaceAll("\\btres\\b","3")
                .replaceAll("\\bcuatro\\b","4").replaceAll("\\bcinco\\b","5")
                .replaceAll("\\bseis\\b","6").replaceAll("\\bsiete\\b","7")
                .replaceAll("\\bocho\\b","8").replaceAll("\\bnueve\\b","9")
                .replaceAll("\\bdiez\\b","10").replaceAll("\\bonce\\b","11")
                .replaceAll("\\bdoce\\b","12").replaceAll("\\btrece\\b","13")
                .replaceAll("\\bcatorce\\b","14").replaceAll("\\bquince\\b","15")
                .replaceAll("\\bdiecis[eé]is\\b","16").replaceAll("\\bdiecisiete\\b","17")
                .replaceAll("\\bdieciocho\\b","18").replaceAll("\\bdiecinueve\\b","19")
                .replaceAll("\\bveinte\\b","20");
    }

    // ── Tema oscuro ─────────────────────────────────────────────────────────────
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