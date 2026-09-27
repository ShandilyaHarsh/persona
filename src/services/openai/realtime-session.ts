import type { SessionContext, SessionRequest, Surface } from "@/domain/onboarding";

/**
 * One OpenAI Realtime session over WebRTC.
 *
 * The band's call carries the microphone and plays the model's audio; the app's
 * messaging opens the same connection with no microphone and asks for text
 * replies, so both are the same model with the same kind of tools.
 */

const REALTIME_URL = "https://api.openai.com/v1/realtime/calls";
const SPEECH_DRAIN_TIMEOUT_MS = 15_000;
/**
 * How long a reply that owes audio gets to start playing before it is taken to
 * have been silent. Prefill is a few hundred milliseconds; this is a beat past.
 */
const AUDIO_START_GRACE_MS = 1_200;
/** How often a wait for speech looks again while that grace runs. */
const AUDIO_START_POLL_MS = 100;
/**
 * ICE reports "disconnected" before "failed", and can sit there for tens of
 * seconds. A call that hasn't recovered in this long is treated as dropped.
 */
const RECONNECT_GRACE_MS = 5_000;
/** Samples per loudness reading: plenty for a level meter, cheap per frame. */
const ANALYSER_FFT_SIZE = 256;

export type EndReason = "closed" | "dropped";

type SessionHandlers = {
  onUserText: (text: string) => void;
  /** `cutOff` when the line never finished - the call ended or they talked over it. */
  onAssistantText: (text: string, cutOff: boolean) => void;
  /** `spoke`: the response that made the call also said something. */
  onToolCall: (name: string, args: Record<string, unknown>, spoke: boolean) => Promise<unknown>;
  /**
   * Tools whose result the model doesn't need to talk about. When a response
   * has already said something and called only these, no second reply is
   * asked for - otherwise every saved detail costs a filler line. A call that
   * failed (its output has an `error`) still gets a reply, so a line that
   * promised something that didn't happen can be taken back.
   */
  silentTools: ReadonlySet<string>;
  /**
   * Bookkeeping tools (saving a detail) that ride along with a silent one
   * without needing a reply of their own. Alone, they still get a reply - the
   * line before them is usually just "got it".
   */
  bookkeepingTools: ReadonlySet<string>;
  onSpeaking: (speaking: boolean) => void;
  onThinking: (thinking: boolean) => void;
  onEnded: (reason: EndReason) => void;
  /** The network is wobbling (true) or has recovered (false). */
  onConnectionTrouble: (trouble: boolean) => void;
  /** The microphone stopped mid-call - revoked, unplugged, or taken by another app. */
  onMicrophoneLost: () => void;
};

/** "denied": the person or browser said no. "missing": there is no microphone to use. */
export class MicrophoneError extends Error {
  constructor(
    readonly kind: "denied" | "missing",
    options?: ErrorOptions,
  ) {
    super(kind === "missing" ? "No microphone was found." : "Microphone access was not granted.", options);
  }
}
class ConnectError extends Error {}

type FunctionCall = { type: "function_call"; name: string; call_id: string; arguments: string };

export class RealtimeSession {
  readonly surface: Surface;
  private peer: RTCPeerConnection;
  private channel: RTCDataChannel;
  private handlers: SessionHandlers;
  private microphone: MediaStream | null;
  private audio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private responseActive = false;
  private responseOwed = false;
  private speaking = false;
  private speechWaiters: Array<() => void> = [];
  private lastResponseAt = 0;
  private closedByUs = false;
  private ended = false;
  private remoteStream: MediaStream | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** What has been said so far of each line still being spoken, by item. */
  private partialAssistant = new Map<string, string>();
  private partialUser = new Map<string, string>();
  /** Lines the person talked over: only the part said before they did counts. */
  private interrupted = new Map<string, string>();

  private constructor(
    surface: Surface,
    peer: RTCPeerConnection,
    channel: RTCDataChannel,
    microphone: MediaStream | null,
    handlers: SessionHandlers,
  ) {
    this.surface = surface;
    this.peer = peer;
    this.channel = channel;
    this.microphone = microphone;
    this.handlers = handlers;
  }

  static async open(
    surface: Surface,
    context: SessionContext,
    handlers: SessionHandlers,
  ): Promise<RealtimeSession> {
    const voice = surface === "band";

    // The microphone first: if it is refused there is no call to mint for, and
    // a credential minted for nothing is a wasted round trip.
    const microphone = voice ? await claimMicrophone() : null;

    const request: SessionRequest = { surface, context };
    const mintPromise = fetch("/api/realtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const peer = new RTCPeerConnection();
    const [track] = microphone?.getAudioTracks() ?? [];
    if (track && microphone) peer.addTrack(track, microphone);
    else peer.addTransceiver("audio", { direction: "sendrecv" });

    const channel = peer.createDataChannel("oai-events");
    const session = new RealtimeSession(surface, peer, channel, microphone, handlers);
    session.wire(voice);

    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const mint = await mintPromise;
      if (!mint.ok) throw new ConnectError("Couldn't start a session.");
      const minted: unknown = await mint.json();
      if (!isRecord(minted) || typeof minted.clientSecret !== "string" || typeof minted.model !== "string") {
        throw new ConnectError("The session service returned no credentials.");
      }
      const { clientSecret, model } = minted;

      const answer = await fetch(`${REALTIME_URL}?model=${encodeURIComponent(model)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!answer.ok) throw new ConnectError("Couldn't reach the voice service.");
      await peer.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      await session.channelOpen();
    } catch (error) {
      session.close();
      throw error instanceof ConnectError ? error : new ConnectError("Couldn't start a session.", { cause: error });
    }
    return session;
  }

  private wire(voice: boolean) {
    this.peer.ontrack = (event) => {
      if (!voice) return;
      const [stream] = event.streams;
      const audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = stream;
      this.audio = audio;
      this.remoteStream = stream;
      this.attachAnalysers();
    };

    this.peer.onconnectionstatechange = () => {
      const state = this.peer.connectionState;
      if (state === "failed") {
        this.finish("dropped");
        return;
      }
      if (state === "disconnected" && !this.reconnectTimer) {
        this.handlers.onConnectionTrouble(true);
        this.reconnectTimer = setTimeout(() => this.finish("dropped"), RECONNECT_GRACE_MS);
        return;
      }
      if (state === "connected" && this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.handlers.onConnectionTrouble(false);
      }
    };

    // The microphone can disappear mid-call: revoked in the browser, unplugged,
    // or taken by another app. A call sending silence should say so.
    this.microphone?.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (!this.ended) this.handlers.onMicrophoneLost();
      };
    });

    // OpenAI only sends JSON objects here; a parse failure is a protocol break
    // worth an uncaught error in the console, not a quiet skip.
    this.channel.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const message: unknown = JSON.parse(event.data);
      if (isRecord(message)) void this.handle(message);
      else console.warn("[realtime] ignoring a server event that isn't an object:", message);
    };
    this.channel.onclose = () => this.finish(this.closedByUs ? "closed" : "dropped");
  }

  private channelOpen(): Promise<void> {
    if (this.channel.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.channel.addEventListener("open", () => resolve(), { once: true });
      this.channel.addEventListener("error", () => reject(new ConnectError("Channel failed.")), {
        once: true,
      });
    });
  }

  private attachAnalysers() {
    const context = (this.audioContext ??= new AudioContext());
    if (this.remoteStream && !this.outputAnalyser) {
      this.outputAnalyser = context.createAnalyser();
      this.outputAnalyser.fftSize = ANALYSER_FFT_SIZE;
      context.createMediaStreamSource(this.remoteStream).connect(this.outputAnalyser);
    }
    if (this.microphone && !this.inputAnalyser) {
      this.inputAnalyser = context.createAnalyser();
      this.inputAnalyser.fftSize = ANALYSER_FFT_SIZE;
      context.createMediaStreamSource(this.microphone).connect(this.inputAnalyser);
    }
  }

  private async handle(event: Record<string, unknown>) {
    switch (event.type) {
      case "response.created":
        this.responseActive = true;
        this.lastResponseAt = Date.now();
        this.handlers.onThinking(true);
        return;

      case "output_audio_buffer.started":
        this.setSpeaking(true);
        return;
      case "output_audio_buffer.stopped":
        this.setSpeaking(false);
        return;
      case "output_audio_buffer.cleared":
        // They talked over Persona: freeze what had been said of each line, so
        // the record holds what they heard rather than the whole script.
        this.partialAssistant.forEach((text, itemId) => this.interrupted.set(itemId, text));
        this.setSpeaking(false);
        return;

      case "conversation.item.input_audio_transcription.delta": {
        const itemId = String(event.item_id ?? "");
        this.partialUser.set(itemId, (this.partialUser.get(itemId) ?? "") + String(event.delta ?? ""));
        return;
      }
      case "conversation.item.input_audio_transcription.completed": {
        this.partialUser.delete(String(event.item_id ?? ""));
        const text = String(event.transcript ?? "").trim();
        if (text) this.handlers.onUserText(text);
        return;
      }

      case "response.output_audio_transcript.delta": {
        const itemId = String(event.item_id ?? "");
        this.partialAssistant.set(itemId, (this.partialAssistant.get(itemId) ?? "") + String(event.delta ?? ""));
        return;
      }
      case "response.output_audio_transcript.done":
      case "response.output_text.done": {
        const itemId = String(event.item_id ?? "");
        this.partialAssistant.delete(itemId);
        const heard = this.interrupted.get(itemId);
        this.interrupted.delete(itemId);
        if (heard !== undefined) {
          if (heard.trim()) this.handlers.onAssistantText(heard.trim(), true);
          return;
        }
        const text = String(event.transcript ?? event.text ?? "").trim();
        if (text) this.handlers.onAssistantText(text, false);
        return;
      }

      case "response.done":
        await this.onResponseDone(isRecord(event.response) && Array.isArray(event.response.output) ? event.response.output : []);
        return;

      case "error":
        // A duplicate response.create is expected when two things ask at once;
        // anything else is worth seeing in the console, never on screen.
        console.warn("[realtime]", event.error);
        return;
    }
  }

  private async onResponseDone(output: unknown[]) {
    this.responseActive = false;
    // A tool may be waiting on the person (a card), which is not the model
    // thinking; the next response.create turns this back on.
    this.handlers.onThinking(false);
    const calls = output.filter(isFunctionCall);

    if (calls.length === 0) {
      this.flushOwedResponse();
      return;
    }
    const spoke = output.some((item) => isRecord(item) && item.type === "message");
    const { silentTools, bookkeepingTools } = this.handlers;
    const quiet =
      spoke &&
      calls.some((call) => silentTools.has(call.name)) &&
      calls.every((call) => silentTools.has(call.name) || bookkeepingTools.has(call.name));

    const outputs = await Promise.all(
      calls.map(async (call) => {
        const args = parseArguments(call);
        // The model gets the error back and can call again with valid arguments.
        if (!args) return { call, output: { error: "Arguments must be a JSON object." } };
        return { call, output: await this.handlers.onToolCall(call.name, args, spoke) };
      }),
    );
    if (this.ended) return;

    for (const { call, output } of outputs) {
      this.send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) },
      });
    }
    const failed = outputs.some(({ output }) => typeof output === "object" && output !== null && "error" in output);
    if (quiet && !failed) this.flushOwedResponse();
    else this.requestResponse();
  }

  private setSpeaking(speaking: boolean) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    this.handlers.onSpeaking(speaking);
    if (!speaking) {
      const waiters = this.speechWaiters;
      this.speechWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }

  private send(event: Record<string, unknown>): boolean {
    if (this.channel.readyState !== "open") return false;
    this.channel.send(JSON.stringify(event));
    return true;
  }

  /** Ask for a reply now, or as soon as the one in flight finishes. */
  requestResponse() {
    if (this.responseActive) {
      this.responseOwed = true;
      return;
    }
    if (this.send({ type: "response.create" })) {
      this.responseActive = true;
      this.handlers.onThinking(true);
    }
  }

  private flushOwedResponse() {
    if (!this.responseOwed) return;
    this.responseOwed = false;
    this.requestResponse();
  }

  sendUserText(text: string) {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    this.requestResponse();
  }

  /** Tell the model something happened. It answers unless told not to. */
  sendEvent(text: string, respond = true) {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text: `[event] ${text}` }] },
    });
    if (respond) this.requestResponse();
  }

  /**
   * Resolve once the sentence being spoken has finished playing, so a card
   * follows the words that introduce it rather than landing on top of them.
   */
  async waitForSpeechEnd(): Promise<void> {
    if (this.surface !== "band") return;
    const deadline = Date.now() + SPEECH_DRAIN_TIMEOUT_MS;
    while (Date.now() < deadline && !this.ended) {
      if (this.speaking) {
        await new Promise<void>((resolve) => {
          this.speechWaiters.push(resolve);
          setTimeout(resolve, deadline - Date.now());
        });
        continue;
      }
      if (Date.now() - this.lastResponseAt < AUDIO_START_GRACE_MS) {
        await new Promise((resolve) => setTimeout(resolve, AUDIO_START_POLL_MS));
        continue;
      }
      return;
    }
  }

  /** 0..1 loudness of the model's voice or the user's, for the band's ring. */
  level(which: "input" | "output"): number {
    const analyser = which === "input" ? this.inputAnalyser : this.outputAnalyser;
    if (!analyser) return 0;
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    return Math.min(1, Math.sqrt(sum / samples.length) * 4);
  }

  close() {
    this.closedByUs = true;
    this.finish("closed");
  }

  private finish(reason: EndReason) {
    if (this.ended) return;
    this.ended = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // Whatever was mid-sentence when the call ended still happened: keep it,
    // marked as cut off, so the record matches what was actually said.
    this.partialUser.forEach((text) => {
      if (text.trim()) this.handlers.onUserText(text.trim());
    });
    this.partialAssistant.forEach((text, itemId) => {
      const heard = (this.interrupted.get(itemId) ?? text).trim();
      if (heard) this.handlers.onAssistantText(heard, true);
    });
    this.partialUser.clear();
    this.partialAssistant.clear();
    this.interrupted.clear();
    this.speechWaiters.forEach((resolve) => resolve());
    this.speechWaiters = [];
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.audio?.pause();
    if (this.audio) this.audio.srcObject = null;
    void this.audioContext?.close();
    this.channel.close();
    this.peer.close();
    this.handlers.onSpeaking(false);
    this.handlers.onThinking(false);
    this.handlers.onEnded(this.closedByUs ? "closed" : reason);
  }
}

async function claimMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new MicrophoneError("missing");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    // Anything that isn't "no such device" reads as a refusal; the cause keeps the real reason for the log.
    const name = error instanceof DOMException ? error.name : "";
    throw new MicrophoneError(name === "NotFoundError" || name === "OverconstrainedError" ? "missing" : "denied", { cause: error });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFunctionCall(item: unknown): item is FunctionCall {
  return (
    isRecord(item) &&
    item.type === "function_call" &&
    typeof item.name === "string" &&
    typeof item.call_id === "string" &&
    typeof item.arguments === "string"
  );
}

/** A tool call's arguments as an object, or null (logged) if the model sent anything else. */
function parseArguments(call: FunctionCall): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.arguments || "{}");
  } catch (error) {
    console.warn(`[realtime] ${call.name} arguments aren't valid JSON:`, call.arguments, error);
    return null;
  }
  if (isRecord(parsed)) return parsed;
  console.warn(`[realtime] ${call.name} arguments aren't an object:`, call.arguments);
  return null;
}
