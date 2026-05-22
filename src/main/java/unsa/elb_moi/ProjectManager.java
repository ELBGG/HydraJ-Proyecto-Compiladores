package unsa.elb_moi;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

public class ProjectManager {

    public enum Template {
        SIMPLE_JAVA("Simple Java"),
        GRADLE_JAVA("Java + Gradle (Kotlin DSL)"),
        MAVEN_JAVA ("Java + Maven");

        public final String label;
        Template(String l) { label = l; }
    }

    private Path root;

    public boolean hasProject() { return root != null; }
    public Path    getRoot()    { return root; }

    public void createProject(String name, String location, Template tpl) throws IOException {
        root = Path.of(location).resolve(name);
        Files.createDirectories(root);
        switch (tpl) {
            case SIMPLE_JAVA -> buildSimpleJava(name);
            case GRADLE_JAVA -> buildGradleJava(name);
            case MAVEN_JAVA  -> buildMavenJava(name);
        }
    }

    public void openProject(String path) throws IOException {
        Path p = Path.of(path);
        if (!Files.isDirectory(p)) throw new IOException("No es un directorio: " + path);
        root = p;
    }

    /** Lee un archivo siempre en UTF-8. */
    public String readFile(Path path) throws IOException {
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    /** Guarda un archivo siempre en UTF-8. */
    public void saveFile(Path path, String content) throws IOException {
        Files.writeString(path, content, StandardCharsets.UTF_8);
    }

    // ── Plantillas ────────────────────────────────────────────────────────────

    private void buildSimpleJava(String name) throws IOException {
        Path src = root.resolve("src");
        Files.createDirectories(src);
        write(src.resolve("Main.java"),
                "public class Main {\n" +
                        "    public static void main(String[] args) {\n" +
                        "        System.out.println(\"Hola desde " + name + "!\");\n" +
                        "    }\n}\n");
    }

    private void buildGradleJava(String name) throws IOException {
        String pkg = safePkg(name);
        Path sm = root.resolve("src/main/java/" + pkg);
        Path st = root.resolve("src/test/java/" + pkg);
        Files.createDirectories(sm);
        Files.createDirectories(st);

        write(root.resolve("settings.gradle.kts"),
                "rootProject.name = \"" + name + "\"\n");

        write(root.resolve("build.gradle.kts"),
                "plugins { java; application }\n\n" +
                        "group   = \"com.example\"\nversion = \"1.0-SNAPSHOT\"\n\n" +
                        "repositories { mavenCentral() }\n\n" +
                        "application {\n    mainClass.set(\"" + pkg + ".Main\")\n}\n\n" +
                        "dependencies {\n" +
                        "    testImplementation(platform(\"org.junit:junit-bom:5.10.0\"))\n" +
                        "    testImplementation(\"org.junit.jupiter:junit-jupiter\")\n" +
                        "    testRuntimeOnly(\"org.junit.platform:junit-platform-launcher\")\n}\n\n" +
                        "tasks.test { useJUnitPlatform() }\n");

        write(root.resolve(".gitignore"), ".gradle/\nbuild/\n*.class\n");

        write(sm.resolve("Main.java"),
                "package " + pkg + ";\n\n" +
                        "public class Main {\n" +
                        "    public static void main(String[] args) {\n" +
                        "        System.out.println(\"Hola desde " + name + "!\");\n" +
                        "    }\n}\n");

        write(st.resolve("MainTest.java"),
                "package " + pkg + ";\n\n" +
                        "import org.junit.jupiter.api.Test;\n" +
                        "import static org.junit.jupiter.api.Assertions.*;\n\n" +
                        "class MainTest {\n    @Test\n    void sanity() { assertTrue(true); }\n}\n");
    }

    private void buildMavenJava(String name) throws IOException {
        String pkg = safePkg(name);
        Path sm = root.resolve("src/main/java/" + pkg);
        Path st = root.resolve("src/test/java/" + pkg);
        Files.createDirectories(sm);
        Files.createDirectories(st);

        write(root.resolve("pom.xml"),
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
                        "<project xmlns=\"http://maven.apache.org/POM/4.0.0\"\n" +
                        "         xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"\n" +
                        "         xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0\n" +
                        "             http://maven.apache.org/xsd/maven-4.0.0.xsd\">\n" +
                        "    <modelVersion>4.0.0</modelVersion>\n" +
                        "    <groupId>com.example</groupId>\n" +
                        "    <artifactId>" + name + "</artifactId>\n" +
                        "    <version>1.0-SNAPSHOT</version>\n" +
                        "    <properties>\n" +
                        "        <maven.compiler.source>17</maven.compiler.source>\n" +
                        "        <maven.compiler.target>17</maven.compiler.target>\n" +
                        "        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>\n" +
                        "    </properties>\n" +
                        "    <dependencies>\n" +
                        "        <dependency>\n" +
                        "            <groupId>org.junit.jupiter</groupId>\n" +
                        "            <artifactId>junit-jupiter</artifactId>\n" +
                        "            <version>5.10.0</version>\n" +
                        "            <scope>test</scope>\n" +
                        "        </dependency>\n" +
                        "    </dependencies>\n" +
                        "</project>\n");

        write(sm.resolve("Main.java"),
                "package " + pkg + ";\n\n" +
                        "public class Main {\n" +
                        "    public static void main(String[] args) {\n" +
                        "        System.out.println(\"Hola desde " + name + "!\");\n" +
                        "    }\n}\n");

        write(st.resolve("MainTest.java"),
                "package " + pkg + ";\n\n" +
                        "import org.junit.jupiter.api.Test;\n" +
                        "import static org.junit.jupiter.api.Assertions.*;\n\n" +
                        "class MainTest {\n    @Test\n    void sanity() { assertTrue(true); }\n}\n");
    }

    private static String safePkg(String name) {
        return name.toLowerCase().replaceAll("[^a-z0-9]", "_");
    }

    private void write(Path p, String s) throws IOException {
        Files.writeString(p, s, StandardCharsets.UTF_8);
    }
}