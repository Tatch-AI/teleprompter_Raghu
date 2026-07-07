import { IncomingTranscriptChunk, TranscriptSource } from "./transcriptSource";
import { getGarageKeyterms } from "./garageKeyterms";

export type DeepgramStatus = "idle" | "connecting" | "listening" | "streaming" | "stopped" | "error";

export type LiveInput = { kind: "mic" } | { kind: "file"; file: File };

export type FirstSpeaker = "agent" | "customer";

export interface StartOptions {
  /**
   * Diarization only gives Deepgram anonymous per-voice IDs (0, 1, 2…) — it has
   * no idea which voice is the rep and which is the customer. We map the first
   * distinct voice heard to `firstSpeaker` and the second distinct voice to the
   * other role; a third distinct voice (e.g. a warm-transfer partner) is left
   * "unknown" rather than guessed, since a fixed id->role rule is wrong as often
   * as it's right (real Harper calls often open with the agent talking first).
   */
  firstSpeaker?: FirstSpeaker;
}

interface TokenResponse {
  configured: boolean;
  kind?: "token" | "key";
  token?: string;
  error?: string;
}

const DG_WS = "wss://api.deepgram.com/v1/listen";
const FILE_SAMPLE_RATE = 16000;
const FILE_CHUNK_MS = 100;

// Live speech -> Deepgram streaming ASR -> transcript chunks. Two input modes:
//   - "mic":  browser microphone (getUserMedia + MediaRecorder, opus/webm)
//   - "file": an uploaded recording, decoded in-browser to linear16 PCM and
//             streamed to Deepgram paced to real time (the "replay a call" demo)
//
// Uses the browser-native WebSocket directly (no SDK) so it is immune to SDK
// churn. Both modes are LOCAL stand-ins for the Genesys AudioHook path: swap this
// for a GenesysTranscriptSource that consumes the call's dual-channel audio and
// the copilot engine/UI stay identical (both satisfy TranscriptSource).
export class DeepgramLiveSource implements TranscriptSource {
  readonly id = "deepgram-live";
  private listeners = new Set<(chunk: IncomingTranscriptChunk) => void>();
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private buffer = "";
  private bufferSpeaker: IncomingTranscriptChunk["speaker"] = "unknown";
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private firstSpeaker: FirstSpeaker = "agent";
  private speakerRoles = new Map<number, IncomingTranscriptChunk["speaker"]>();

  constructor(private onStatus?: (status: DeepgramStatus, detail?: string) => void) {}

  subscribe(onChunk: (chunk: IncomingTranscriptChunk) => void): () => void {
    this.listeners.add(onChunk);
    return () => this.listeners.delete(onChunk);
  }

  private emit(text: string, speaker: IncomingTranscriptChunk["speaker"]) {
    const trimmed = text.trim();
    if (!trimmed) return;
    for (const l of this.listeners) l({ text: trimmed, speaker });
  }

  private flush() {
    if (this.buffer.trim()) this.emit(this.buffer, this.bufferSpeaker);
    this.buffer = "";
  }

  async start(input: LiveInput = { kind: "mic" }, opts: StartOptions = {}): Promise<void> {
    this.stopped = false;
    this.firstSpeaker = opts.firstSpeaker ?? "agent";
    this.speakerRoles.clear();
    this.onStatus?.("connecting");

    const res = await fetch("/api/deepgram-token");
    const data = (await res.json()) as TokenResponse;
    if (!data.configured || !data.token) {
      const msg = data.error ?? "Deepgram not configured (set DEEPGRAM_API_KEY).";
      this.onStatus?.("error", msg);
      throw new Error(msg);
    }

    // Acquire mic first (so a permission denial fails before we open the socket).
    if (input.kind === "mic") {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.onStatus?.("error", "Microphone not available in this browser.");
        throw new Error("getUserMedia unavailable");
      }
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const params = new URLSearchParams({
      model: "nova-2",
      language: "en-US",
      smart_format: "true",
      punctuate: "true",
      interim_results: "true",
      diarize: "true",
      utterance_end_ms: "1000",
      vad_events: "true",
    });
    // Bias the ASR model toward garage/insurance vocabulary (nova-2's
    // `keywords` boosting) — general ASR reliably mishears compound terms
    // like "buy-here-pay-here" and enum values like "wholesale" that the
    // extractor and rules engine match on verbatim downstream.
    for (const { term, intensifier } of getGarageKeyterms()) {
      params.append("keywords", `${term}:${intensifier}`);
    }
    if (input.kind === "file") {
      params.set("encoding", "linear16");
      params.set("sample_rate", String(FILE_SAMPLE_RATE));
      params.set("channels", "1");
    }

    // Browser WebSocket auth via subprotocol: grant/access token -> "bearer",
    // temporary API key -> "token".
    const protocols = data.kind === "token" ? ["bearer", data.token] : ["token", data.token];
    this.ws = new WebSocket(`${DG_WS}?${params.toString()}`, protocols);

    this.ws.onopen = () => {
      if (input.kind === "mic") this.beginMic();
      else void this.streamFile(input.file);
    };

    this.ws.onmessage = (evt) => {
      if (typeof evt.data !== "string") return;
      let msg: {
        type?: string;
        is_final?: boolean;
        channel?: { alternatives?: { transcript?: string; words?: { speaker?: number }[] }[] };
      };
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (msg.type === "UtteranceEnd") {
        this.flush();
        return;
      }
      if (msg.type && msg.type !== "Results") return;
      const alt = msg.channel?.alternatives?.[0];
      const transcript = alt?.transcript ?? "";
      if (!transcript || !msg.is_final) return;
      const speaker = this.roleForSpeakerId(dominantSpeakerId(alt?.words));
      if (this.buffer && speaker !== this.bufferSpeaker) this.flush();
      this.bufferSpeaker = speaker;
      this.buffer = `${this.buffer} ${transcript}`.trim();
    };

    this.ws.onerror = () => {
      if (!this.stopped) this.onStatus?.("error", "Deepgram socket error.");
    };

    this.ws.onclose = () => {
      if (!this.stopped) {
        this.flush();
        this.onStatus?.("stopped");
      }
    };
  }

  private beginMic(): void {
    this.onStatus?.("listening");
    this.recorder = new MediaRecorder(this.stream as MediaStream, { mimeType: "audio/webm" });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) this.ws.send(e.data);
    };
    this.recorder.start(250);
    this.keepAlive = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 8000);
  }

  // Decode the uploaded file to 16 kHz mono PCM and stream it to Deepgram paced
  // to real time so fields fill as if the call were happening now.
  private async streamFile(file: File): Promise<void> {
    try {
      this.onStatus?.("streaming");
      const arrayBuf = await file.arrayBuffer();
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx({ sampleRate: FILE_SAMPLE_RATE });
      const audioBuf = await this.audioCtx.decodeAudioData(arrayBuf);

      const mono = audioBuf.getChannelData(0);
      const samplesPerChunk = Math.floor((FILE_SAMPLE_RATE * FILE_CHUNK_MS) / 1000);

      for (let offset = 0; offset < mono.length; offset += samplesPerChunk) {
        if (this.stopped || this.ws?.readyState !== WebSocket.OPEN) break;
        const slice = mono.subarray(offset, Math.min(offset + samplesPerChunk, mono.length));
        const pcm = new Int16Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          const s = Math.max(-1, Math.min(1, slice[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.ws.send(pcm.buffer);
        await sleep(FILE_CHUNK_MS);
      }

      if (!this.stopped && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      this.flush();
      this.onStatus?.("stopped");
    } catch (err) {
      this.onStatus?.("error", `Could not stream file: ${(err as Error).message}`);
    }
  }

  // Assigns each distinct diarized voice ID a stable role for this session:
  // first voice heard -> firstSpeaker, second voice heard -> the other role,
  // any further distinct voice -> "unknown" (never guessed as agent/customer).
  private roleForSpeakerId(id: number | null): IncomingTranscriptChunk["speaker"] {
    if (id === null) return "unknown";
    const known = this.speakerRoles.get(id);
    if (known) return known;
    const role: IncomingTranscriptChunk["speaker"] =
      this.speakerRoles.size === 0
        ? this.firstSpeaker
        : this.speakerRoles.size === 1
          ? this.firstSpeaker === "agent"
            ? "customer"
            : "agent"
          : "unknown";
    this.speakerRoles.set(id, role);
    return role;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.flush();
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      /* noop */
    }
    this.recorder = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      await this.audioCtx?.close();
    } catch {
      /* noop */
    }
    this.audioCtx = null;
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
    this.onStatus?.("stopped");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function dominantSpeakerId(words?: { speaker?: number }[]): number | null {
  if (!words || words.length === 0) return null;
  const counts = new Map<number, number>();
  for (const w of words) {
    if (typeof w.speaker === "number") counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let top = -1;
  let topCount = -1;
  for (const [sp, c] of counts) {
    if (c > topCount) {
      top = sp;
      topCount = c;
    }
  }
  return top;
}
