"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Longest voice message, in seconds. */
export const MAX_VOICE_SECONDS = 120;

// What browsers can record, best first: Chrome/Edge/Firefox record WebM or
// Ogg with Opus, Safari records MP4/AAC. The chat bucket accepts all of them.
const VOICE_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return VOICE_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export type VoiceNote = {
  blob: Blob;
  /** Without codec details, e.g. "audio/webm". */
  mimeType: string;
  seconds: number;
  /** A local link for listening before sending. */
  url: string;
};

/**
 * Records a voice message with the microphone. Nothing leaves the browser
 * until the message is sent; the recording can be listened to or discarded.
 */
export function useVoiceRecorder(onError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  // Waiting for the browser's microphone permission.
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState<VoiceNote | null>(null);
  // The last recording was stopped by the 2-minute limit, not by the person.
  const [limitReached, setLimitReached] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const noteUrlRef = useRef("");
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  // Counts start attempts. cancel() and leaving the page move it on, so a
  // start() still waiting for the microphone gives the microphone back
  // instead of recording in a chat (or page) the person has left.
  const attemptRef = useRef(0);

  const replaceNote = useCallback((next: VoiceNote | null) => {
    if (noteUrlRef.current) URL.revokeObjectURL(noteUrlRef.current);
    noteUrlRef.current = next?.url || "";
    setNote(next);
  }, []);

  const stopEverything = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  /** Starts recording. True once the microphone is actually recording. */
  const start = useCallback(async (): Promise<boolean> => {
    if (recorderRef.current || startingRef.current) return false;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Voice messages are not supported in this browser.");
      return false;
    }

    const attempt = ++attemptRef.current;
    startingRef.current = true;
    setStarting(true);

    const giveUp = (stream?: MediaStream) => {
      stream?.getTracks().forEach((track) => track.stop());
      startingRef.current = false;
      if (mountedRef.current) setStarting(false);
      return false;
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (attempt === attemptRef.current && mountedRef.current) {
        onError("Allow microphone access in your browser to record a voice message.");
      }
      return giveUp();
    }

    // Cancelled, or the chat or page was left, while the browser was asking.
    if (attempt !== attemptRef.current || !mountedRef.current) return giveUp(stream);

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      onError("Voice messages are not supported in this browser.");
      return giveUp(stream);
    }

    chunksRef.current = [];
    cancelledRef.current = false;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
      stopEverything();
      recorderRef.current = null;
      const chunks = chunksRef.current;
      chunksRef.current = [];

      if (!mountedRef.current) return;
      setRecording(false);
      if (cancelledRef.current || chunks.length === 0) return;

      const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0].trim();
      const blob = new Blob(chunks, { type });

      replaceNote({
        blob,
        mimeType: type,
        seconds: Math.min(Math.max(elapsed, 1), MAX_VOICE_SECONDS),
        url: URL.createObjectURL(blob),
      });
    };

    try {
      recorder.start();
    } catch {
      onError("The recording could not start. Try again.");
      return giveUp(stream);
    }

    replaceNote(null);
    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    startingRef.current = false;
    setStarting(false);
    setLimitReached(false);
    setSeconds(0);
    setRecording(true);

    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(Math.min(elapsed, MAX_VOICE_SECONDS));
      if (elapsed >= MAX_VOICE_SECONDS && recorderRef.current?.state === "recording") {
        setLimitReached(true);
        recorderRef.current.stop();
      }
    }, 250);

    return true;
  }, [onError, replaceNote, stopEverything]);

  /** Stops and keeps the recording for sending. */
  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  /** Stops and throws the recording away; also stops a start that is still waiting. */
  const cancel = useCallback(() => {
    attemptRef.current += 1;
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else stopEverything();
  }, [stopEverything]);

  /** Forgets a finished recording (after sending, or when removed). */
  const discard = useCallback(() => replaceNote(null), [replaceNote]);

  // Leaving the page stops the microphone, including a start still waiting.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      cancelledRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopEverything();
      if (noteUrlRef.current) URL.revokeObjectURL(noteUrlRef.current);
      noteUrlRef.current = "";
    };
  }, [stopEverything]);

  return { recording, starting, seconds, note, limitReached, start, stop, cancel, discard };
}
