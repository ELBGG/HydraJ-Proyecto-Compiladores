package unsa.elb_moi.voice;

import org.vosk.LibVosk;
import org.vosk.LogLevel;
import org.vosk.Model;
import org.vosk.Recognizer;

import javax.sound.sampled.*;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

public class VoiceRecognizer {

    public enum State { IDLE, LISTENING, ERROR }

    private static final float SAMPLE_RATE = 16000f;
    private static final int   BUFFER_SIZE = 4000;

    private Model      model;
    private Recognizer recognizer;
    private TargetDataLine microphone;
    private Thread     thread;

    private volatile boolean running        = false;
    private volatile String  currentPartial = "";
    private State  state     = State.IDLE;
    private String lastError = "";

    private final BlockingQueue<String> results = new LinkedBlockingQueue<>();

    public boolean loadModel(String modelPath) {
        close();
        try {
            LibVosk.setLogLevel(LogLevel.WARNINGS);
            model      = new Model(modelPath);
            recognizer = new Recognizer(model, SAMPLE_RATE);
            state      = State.IDLE;
            lastError  = "";
            return true;
        } catch (Exception e) {
            lastError = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            state = State.ERROR;
            return false;
        }
    }

    public boolean start() {
        if (model == null || running) return false;
        try {
            AudioFormat format = new AudioFormat(SAMPLE_RATE, 16, 1, true, false);
            DataLine.Info info = new DataLine.Info(TargetDataLine.class, format);
            if (!AudioSystem.isLineSupported(info)) {
                lastError = "Microphone line not supported on this system";
                state = State.ERROR;
                return false;
            }
            microphone = (TargetDataLine) AudioSystem.getLine(info);
            microphone.open(format);
            microphone.start();
            running = true;
            state   = State.LISTENING;
            thread  = new Thread(this::captureLoop, "vosk-capture");
            thread.setDaemon(true);
            thread.start();
            return true;
        } catch (LineUnavailableException e) {
            lastError = "Microphone unavailable: " + e.getMessage();
            state = State.ERROR;
            return false;
        }
    }

    public void stop() {
        running = false;
        if (microphone != null) {
            microphone.stop();
            microphone.close();
            microphone = null;
        }
        state = State.IDLE;
    }

    public void close() {
        stop();
        if (recognizer != null) { recognizer.close(); recognizer = null; }
        if (model      != null) { model.close(); model = null; }
    }

    private void captureLoop() {
        byte[] buf = new byte[BUFFER_SIZE];
        while (running) {
            int n = microphone.read(buf, 0, buf.length);
            if (n > 0) {
                if (recognizer.acceptWaveForm(buf, n)) {
                    currentPartial = "";
                    String text = extractField(recognizer.getResult(), "text");
                    if (!text.isEmpty()) results.offer(text);
                } else {
                    currentPartial = extractField(recognizer.getPartialResult(), "partial");
                }
            }
        }
        currentPartial = "";
        String finalText = extractField(recognizer.getFinalResult(), "text");
        if (!finalText.isEmpty()) results.offer(finalText);
    }

    private static String extractField(String json, String field) {
        int idx = json.indexOf("\"" + field + "\"");
        if (idx < 0) return "";
        int colon = json.indexOf(':', idx);
        if (colon < 0) return "";
        int q1 = json.indexOf('"', colon + 1);
        if (q1 < 0) return "";
        int q2 = json.indexOf('"', q1 + 1);
        if (q2 < 0) return "";
        return json.substring(q1 + 1, q2).trim();
    }

    public String pollResult()     { return results.poll(); }
    public String getPartialText() { return currentPartial; }
    public State  getState()       { return state; }
    public String getLastError()   { return lastError; }
    public boolean isModelLoaded() { return model != null; }
}
