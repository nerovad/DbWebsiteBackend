import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Hls from "hls.js";
import "./VideoPlayer.scss";
import Chatbox from "../Chatbox/Chatbox";
import "../../styles/_variables.scss";
import muteIcon from "../../assets/mute_icon.svg";
import { useChatStore } from "../../store/useChatStore";

interface VideoLink { src: string; channel: string; isLive?: boolean; channelNumber: number; }

interface VideoPlayerProps {
  isMenuOpen: boolean;
  isChatOpen: boolean;
  setVideoControls: (controls: {
    currentIndex: number;
    setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
    videoLinks: VideoLink[];
    videoRef: React.RefObject<HTMLVideoElement>;
    goToNextVideo: () => void;
    goToPreviousVideo: () => void;
    toggleMute: () => void;
    toggleFullscreen: () => void;
    loadVideo: (src: string) => void;
  }) => void;
  channelSlug?: string;
}

const HLS_BASE = "https://dainbramage.tv:8088";

const VideoPlayer: React.FC<VideoPlayerProps> = ({ isMenuOpen, isChatOpen, setVideoControls }) => {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const endedListenerRef = useRef<(() => void) | null>(null);
  const switchingRef = useRef(false);
  const retryRef = useRef(0);

  const { setChannelId } = useChatStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [channelName, setChannelName] = useState("");
  const [isMuted, setIsMuted] = useState(true);
  const [showMuteIcon, setShowMuteIcon] = useState(false);
  const [videoLinks, setVideoLinks] = useState<VideoLink[]>([
    { src: "/videos/Color_Bars_DB_Web.mp4", channel: "channel-0", channelNumber: 0, isLive: false },
  ]);

  const getClassNames = () => {
    let classNames = "";
    if (isMenuOpen) classNames += " expanded-left";
    if (isChatOpen) classNames += " expanded-right";
    if (isMenuOpen && isChatOpen) classNames = "expanded-both";
    return classNames.trim();
  };

  const cleanupHls = () => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      if (endedListenerRef.current) {
        v.removeEventListener("ended", endedListenerRef.current as any);
        endedListenerRef.current = null;
      }
      v.removeAttribute("src");
      v.load();
    }
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch { }
      hlsRef.current = null;
    }
    retryRef.current = 0;
  };

  const attachEndedForMp4 = () => {
    const v = videoRef.current;
    if (!v) return;
    const onEnded = () => goToNextVideo();
    v.addEventListener("ended", onEnded);
    endedListenerRef.current = () => v.removeEventListener("ended", onEnded);
  };

  const loadVideo = useCallback((src: string) => {
    const v = videoRef.current;
    if (!v) return;

    cleanupHls();

    if (src.endsWith(".mp4")) {
      v.src = src;
      attachEndedForMp4();
      v.muted = true;
      v.play().catch(() => { });
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveBackBufferLength: 0,
        backBufferLength: 0,
        maxBufferLength: 10,
        maxBufferSize: 60 * 1000 * 1000,
        enableWorker: true,
        lowLatencyMode: false,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(v);

      hls.on("manifestParsed", () => {
        v.muted = true;
        v.play().catch(() => { });
      });

      hls.on("error", (_evt: any, data: any) => {
        const fatal = !!data?.fatal;
        const type = data?.type as string | undefined;
        if (!fatal) return;

        if (type === "networkError") {
          if (retryRef.current < 3) {
            retryRef.current += 1;
            (hls as any).startLoad?.();
          } else {
            goToNextVideo();
          }
        } else if (type === "mediaError") {
          try {
            (hls as any).recoverMediaError?.();
          } catch {
            goToNextVideo();
          }
        } else {
          goToNextVideo();
        }
      });

      return;
    }

    const vtag = videoRef.current;
    if (vtag?.canPlayType("application/vnd.apple.mpegurl")) {
      vtag.src = src;
      vtag.muted = true;
      vtag.play().catch(() => { });
      return;
    }

    console.error("This browser cannot play HLS.");
  }, []);

  // ✅ Navigate to new channel URL
  const switchToIndex = (idx: number) => {
    if (switchingRef.current) return;
    switchingRef.current = true;

    const safeIdx = ((idx % videoLinks.length) + videoLinks.length) % videoLinks.length;
    const dest = videoLinks[safeIdx];

    // ✅ Update URL instead of just state
    navigate(`/channel/${dest.channel}`, { replace: true });

    setTimeout(() => {
      switchingRef.current = false;
    }, 200);
  };

  const goToNextVideo = useCallback(() => switchToIndex(currentIndex + 1), [currentIndex, videoLinks.length]);
  const goToPreviousVideo = useCallback(() => switchToIndex(currentIndex - 1), [currentIndex, videoLinks.length]);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const muted = !v.muted;
    v.muted = muted;
    setIsMuted(muted);
    setShowMuteIcon(true);
    if (!muted) setTimeout(() => setShowMuteIcon(false), 200);
  };

  const toggleFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!document.fullscreenElement) v.requestFullscreen().catch(() => { });
    else document.exitFullscreen().catch(() => { });
  };

  useEffect(() => {
    const v = videoRef.current;
    if (v?.muted) {
      setShowMuteIcon(true);
      setTimeout(() => setShowMuteIcon(false), 1500);
    }
  }, []);

  // ✅ Fetch channels
  // ✅ Fetch channels
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/channels");
        const channels = await res.json();

        console.log("Raw API response:", channels); // ⬅️ ADD THIS

        const dynamic: VideoLink[] = channels
          .map((ch: any) => {
            const key = ch.stream_key ?? ch.slug ?? ch.key;
            if (!key) return null;
            const src = `${HLS_BASE}/hls/${key}/index.m3u8`;
            return {
              src,
              channel: ch.slug ?? key,
              channelNumber: ch.channel_number ?? 0,
              isLive: true
            };
          })
          .filter(Boolean) as VideoLink[];

        // Sort AFTER the filter and cast
        dynamic.sort((a: VideoLink, b: VideoLink) => a.channelNumber - b.channelNumber);

        console.log("Dynamic videoLinks after sorting:", dynamic); // ⬅️ ADD THIS

        if (alive) {
          setVideoLinks(prev => {
            const updated = [prev[0], ...dynamic];
            console.log("Final videoLinks array:", updated); // ⬅️ ADD THIS
            return updated;
          });
        }
      } catch (e) {
        console.error("Failed to fetch channels", e);
      }
    })();

    return () => { alive = false; };
  }, []);
  // ✅ Sync URL parameter to video player state
  useEffect(() => {
    if (!channelSlug || videoLinks.length === 0) return;

    const idx = videoLinks.findIndex(link => link.channel === channelSlug);
    if (idx !== -1 && idx !== currentIndex) {
      setCurrentIndex(idx);
      const link = videoLinks[idx];
      loadVideo(link.src);
      setChannelId(link.channel);
      setChannelName(link.channel);

      const hide = setTimeout(() => setChannelName(""), 7000);
      return () => clearTimeout(hide);
    }
  }, [channelSlug, videoLinks]);

  // ✅ Provide controls to NavBar
  useEffect(() => {
    setVideoControls({
      currentIndex,
      setCurrentIndex,
      videoLinks,
      videoRef,
      goToNextVideo,
      goToPreviousVideo,
      toggleMute,
      toggleFullscreen,
      loadVideo,
    });
  }, [currentIndex, videoLinks]);

  // ✅ Keyboard shortcuts
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.getAttribute("contenteditable") === "true")) return;
      switch (event.key.toLowerCase()) {
        case "m": toggleMute(); break;
        case "f": toggleFullscreen(); break;
        case "arrowdown": goToPreviousVideo(); break;
        case "arrowup": goToNextVideo(); break;
      }
    };
    const handleRightClick = (e: MouseEvent) => { e.preventDefault(); goToPreviousVideo(); };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("contextmenu", handleRightClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("contextmenu", handleRightClick);
    };
  }, [goToNextVideo, goToPreviousVideo]);

  useEffect(() => () => cleanupHls(), []);

  return (
    <div className={`video-container-dboriginals ${getClassNames()}`}>
      <div className="tv-container">
        <video
          className="myvideo"
          ref={videoRef}
          muted
          autoPlay
          preload="metadata"
          playsInline
          controls={false}
        />
        <div className="db-originals-next-button" onClick={goToNextVideo}>
          <div className="channelnumber">{channelName}</div>
        </div>
      </div>

      <Chatbox isOpen={isChatOpen} setIsOpen={() => { }} />

      {showMuteIcon && <img src={muteIcon} alt="Muted" className="mute-icon-overlay" />}
    </div>
  );
};

export default VideoPlayer;
