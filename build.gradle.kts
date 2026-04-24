plugins {
    java
    application
}

group = "unsa.elb_moi"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

val imguiVersion = "1.89.0"

dependencies {
    implementation("io.github.spair:imgui-java-app:$imguiVersion")

    testImplementation(platform("org.junit:junit-bom:5.10.0"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

application {
    mainClass.set("unsa.elb_moi.Main")
    applicationDefaultJvmArgs = listOf(
        "-XstartOnFirstThread".takeIf { System.getProperty("os.name").lowercase().contains("mac") } ?: ""
    ).filter { it.isNotEmpty() }
}

tasks.test {
    useJUnitPlatform()
}

tasks.jar {
    manifest {
        attributes["Main-Class"] = "unsa.elb_moi.Main"
    }
}
