package unsa.elb_moi;

import imgui.type.ImBoolean;
import imgui.type.ImString;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;

public class EditorTab {
    final Path      path;
    final String    label;
    final ImString  buffer;
    final ImBoolean open = new ImBoolean(true);
    boolean dirty;

    /** Scroll vertical del editor, usado para sincronizar los números de línea. */
    float editorScrollY = 0f;

    private final Deque<String> historial = new ArrayDeque<>();

    EditorTab(Path path, String content) {
        this.path   = path;
        this.label  = path != null ? path.getFileName().toString() : "untitled";
        // Buffer grande para archivos medianos; ajustar si se necesitan más
        this.buffer = new ImString(1 << 17);   // 128 KB
        this.buffer.set(content);
    }

    EditorTab() { this(null, ""); }

    /** Guarda el estado actual antes de una operación destructiva (undo). */
    public void guardarEstado() {
        historial.push(buffer.get());
        // Limitar historial a 50 entradas para no consumir demasiada memoria
        while (historial.size() > 50) {
            ((ArrayDeque<String>) historial).removeLast();
        }
    }

    /** Deshace la última operación guardada. */
    public boolean deshacer() {
        if (historial.isEmpty()) return false;
        buffer.set(historial.pop());
        dirty = true;
        return true;
    }
}