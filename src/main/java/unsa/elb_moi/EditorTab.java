package unsa.elb_moi;

import imgui.type.ImBoolean;
import imgui.type.ImString;
import java.nio.file.Path;

public class EditorTab {
    final Path     path;
    final String   label;
    final ImString buffer;
    final ImBoolean open = new ImBoolean(true);
    boolean dirty;

    EditorTab(Path path, String content) {
        this.path   = path;
        this.label  = path != null ? path.getFileName().toString() : "untitled";
        this.buffer = new ImString(1 << 16);
        this.buffer.set(content);
    }

    EditorTab() { this(null, ""); }
}
