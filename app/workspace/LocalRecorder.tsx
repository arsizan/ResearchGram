"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Video, Square, AlertCircle, Download, Circle } from "lucide-react";

type Meeting = {
  id: string;
  title: string;
};

type LocalRecorderProps = {
  workspaceId: string;
  meeting: Meeting;
  userId: string;
  onSaved: () => void;
};

function getSupportedMimeType() {
  const options = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const option of options) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(option)
    ) {
      return option;
    }
  }
  return "";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function LocalRecorder({
  workspaceId,
  meeting,
  userId,
  onSaved,
}: LocalRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastFileName, setLastFileName] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const handleStartRecording = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert("Screen/tab recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setSaving(true);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );
        const safeTitle = meeting.title
          .replace(/[^\w\-]+/g, "_")
          .slice(0, 50);
        const fileName = `ResearchGram_${safeTitle}_${Date.now()}.webm`;

        downloadBlob(blob, fileName);
        setLastFileName(fileName);

        const { error } = await supabase.from("workspace_recordings").insert({
          workspace_id: workspaceId,
          meeting_id: meeting.id,
          recorded_by: userId,
          title: `${meeting.title} recording`,
          file_name: fileName,
          file_type: blob.type || "video/webm",
          duration_seconds: durationSeconds,
          saved_location_note:
            "Downloaded to the recorder's local computer. The actual video file is not stored in cloud.",
        });

        if (error) {
          console.log("SAVE RECORDING METADATA ERROR:", error);
          alert(
            "Video downloaded, but recording metadata could not be saved: " +
              error.message,
          );
        } else {
          onSaved();
        }

        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        streamRef.current = null;
        chunksRef.current = [];
        setRecording(false);
        setSaving(false);
      };

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      });

      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start(1000);
      setRecording(true);
    } catch (error) {
      console.log("START LOCAL RECORDING ERROR:", error);
      alert(
        "Recording was cancelled or failed. Please allow screen/tab recording permission.",
      );
    }
  };

  const handleStopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Video className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground">Local Meeting Recording</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Records to your computer only. When the browser asks, pick this meeting tab/window and enable tab audio if available.
            </p>
          </div>

          {!recording ? (
            <button
              onClick={handleStartRecording}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors disabled:opacity-40 flex-shrink-0"
            >
              {saving ? (
                <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Circle className="w-3 h-3 fill-white" />
              )}
              {saving ? "Saving…" : "Start Recording"}
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-black transition-colors disabled:opacity-40 flex-shrink-0"
            >
              <Square className="w-3 h-3 fill-white" />
              Stop Recording
            </button>
          )}
        </div>

        {/* Live indicator */}
        {recording && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <p className="text-xs font-bold text-red-700">
              Recording is running. Do not close this tab.
            </p>
          </div>
        )}

        {/* Last downloaded file */}
        {lastFileName && !recording && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
            <Download className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <p className="text-xs text-emerald-800 flex-1 min-w-0">
              <span className="font-bold">Last downloaded:</span>{" "}
              <span className="font-mono truncate">{lastFileName}</span>
            </p>
          </div>
        )}

        {/* Permanent note */}
        <div className="flex items-start gap-2 mt-3 text-[11px] text-amber-700 leading-relaxed">
          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <p>
            Recording is browser-local (MediaRecorder). The .webm video is downloaded to your machine; only metadata (file name, duration, who recorded, meeting reference) is saved on ResearchGram.
          </p>
        </div>
      </div>
    </div>
  );
}