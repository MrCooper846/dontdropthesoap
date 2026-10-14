"use client";
import { useEffect, useState } from "react";
import { Room, RoomEvent, Track, LocalAudioTrack } from "livekit-client";
declare global {
  interface Window {
    voiceProbe?: {
      connect: (url: string, token: string) => Promise<void>;
      publish: () => Promise<string>;
      subscribe: (sid: string, enabled: boolean) => void;
      status: () => Promise<{ subscribed: number; packets: number }>;
      close: () => Promise<void>;
    };
  }
}
export default function VoiceProbe() {
  const [status, setStatus] = useState("Loading");
  useEffect(() => {
    const room = new Room({ adaptiveStream: false, dynacast: false });
    let audio: AudioContext | undefined;
    let oscillator: OscillatorNode | undefined;
    window.voiceProbe = {
      async connect(url, token) {
        await room.connect(url, token, { autoSubscribe: false });
        setStatus("Connected");
      },
      async publish() {
        audio = new AudioContext();
        await audio.resume();
        const destination = audio.createMediaStreamDestination();
        oscillator = audio.createOscillator();
        oscillator.frequency.value = 440;
        oscillator.connect(destination);
        oscillator.start();
        const publication = await room.localParticipant.publishTrack(
          new LocalAudioTrack(destination.stream.getAudioTracks()[0]),
          { source: Track.Source.Microphone, name: "synthetic-tone" },
        );
        return publication.trackSid!;
      },
      subscribe(sid, enabled) {
        for (const participant of room.remoteParticipants.values())
          for (const publication of participant.audioTrackPublications.values())
            if (publication.trackSid === sid)
              publication.setSubscribed(enabled);
      },
      async status() {
        let subscribed = 0,
          packets = 0;
        for (const participant of room.remoteParticipants.values())
          for (const publication of participant.audioTrackPublications.values()) {
            if (publication.track) {
              subscribed++;
              const report = await publication.track.getRTCStatsReport();
              report?.forEach((stat) => {
                if (stat.type === "inbound-rtp")
                  packets += Number(stat.packetsReceived ?? 0);
              });
            }
          }
        return { subscribed, packets };
      },
      async close() {
        oscillator?.stop();
        await audio?.close();
        await room.disconnect();
      },
    };
    room.on(RoomEvent.Disconnected, () => setStatus("Disconnected"));
    setStatus("Probe ready");
    return () => {
      delete window.voiceProbe;
      oscillator?.stop();
      void audio?.close();
      void room.disconnect();
    };
  }, []);
  return (
    <main className="screen stack">
      <h1>Media enforcement lab</h1>
      <p>
        This development page tests real SFU permissions using a synthetic tone.
        It is not a completed game voice feature or a physical microphone test.
      </p>
      <p role="status">{status}</p>
    </main>
  );
}
