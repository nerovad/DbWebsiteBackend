import React, { useEffect, useRef, useState } from "react";
import "./CreateChannelModal.scss";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChannelCreated?: (channel: any) => void;
  excludeClickId?: string;
}

type ScheduleItem = {
  title: string;
  scheduled_at: string;
  duration: string; // Timecode format: HH:MM:SS or MM:SS
};

type WidgetConfig = {
  type: string;
  order: number;
};

const emptyScheduleItem: ScheduleItem = { title: "", scheduled_at: "", duration: "" };

// Convert timecode (HH:MM:SS or MM:SS) to seconds
const timecodeToSeconds = (timecode: string): number | null => {
  if (!timecode || !timecode.trim()) return null;
  const parts = timecode.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
};

// General widgets available for all channels
const GENERAL_WIDGETS = [
  { type: 'about', name: 'About', description: 'Channel info and description', icon: 'ℹ️' },
  { type: 'now_playing', name: 'Now Playing / Up Next', description: 'Current and upcoming content', icon: '📺' },
];

const CreateChannelModal: React.FC<Props> = ({ isOpen, onClose, onChannelCreated, excludeClickId }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  // Channel fields
  const [channelNumber, setChannelNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [channelInfo, setChannelInfo] = useState<any>(null);

  // Widgets
  const [selectedWidgets, setSelectedWidgets] = useState<WidgetConfig[]>([]);
  const [aboutText, setAboutText] = useState("");

  // Schedule for Now Playing widget
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);

  // Track taken channel numbers
  const [takenChannelNumbers, setTakenChannelNumbers] = useState<Set<number>>(new Set());
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Generate available channel numbers (2-200), excluding taken ones
  const availableChannels = Array.from({ length: 199 }, (_, i) => i + 2)
    .filter(num => !takenChannelNumbers.has(num));

  // Auto-generate internal name from channel number
  const generateInternalName = (num: string): string => {
    return num ? `channel_${num}` : "";
  };

  // Fetch existing channels to determine taken channel numbers
  useEffect(() => {
    if (!isOpen) return;

    const fetchTakenChannels = async () => {
      setLoadingChannels(true);
      try {
        const res = await fetch("/api/channels");
        if (res.ok) {
          const channels = await res.json();
          const taken = new Set<number>(
            channels
              .map((ch: any) => ch.channel_number)
              .filter((num: any) => typeof num === 'number')
          );
          setTakenChannelNumbers(taken);
        }
      } catch (err) {
        console.error("Failed to fetch channels:", err);
      } finally {
        setLoadingChannels(false);
      }
    };

    fetchTakenChannels();
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const excludeEl = excludeClickId ? document.getElementById(excludeClickId) : null;
      if (
        boxRef.current &&
        !boxRef.current.contains(event.target as Node) &&
        (!excludeEl || !excludeEl.contains(event.target as Node))
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, excludeClickId]);

  // ESC, lock scroll, focus first input
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  const canSubmit = () => {
    return channelNumber && displayName.trim();
  };

  // Widget helpers
  const toggleWidget = (widgetType: string) => {
    const exists = selectedWidgets.find(w => w.type === widgetType);
    if (exists) {
      setSelectedWidgets(selectedWidgets.filter(w => w.type !== widgetType));
    } else {
      const maxOrder = Math.max(...selectedWidgets.map(w => w.order), -1);
      setSelectedWidgets([...selectedWidgets, { type: widgetType, order: maxOrder + 1 }]);
    }
  };

  const isWidgetSelected = (widgetType: string) => {
    return selectedWidgets.some(w => w.type === widgetType);
  };

  // Schedule helpers
  const addScheduleRow = () => setScheduleItems(prev => [...prev, { ...emptyScheduleItem }]);
  const removeScheduleRow = (idx: number) => setScheduleItems(prev => prev.filter((_, i) => i !== idx));
  const updateScheduleItem = (idx: number, patch: Partial<ScheduleItem>) =>
    setScheduleItems(prev => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit()) return;

    setSubmitting(true);
    try {
      // Normalize schedule items for submission
      const normalizedSchedule = scheduleItems
        .filter(item => item.title.trim() && item.scheduled_at)
        .map(item => ({
          title: item.title.trim(),
          scheduled_at: new Date(item.scheduled_at).toISOString(),
          duration_seconds: timecodeToSeconds(item.duration),
        }));

      const body: any = {
        name: generateInternalName(channelNumber),
        display_name: displayName,
        channel_number: parseInt(channelNumber),
        type: "channel",
        widgets: selectedWidgets.length > 0 ? selectedWidgets : null,
        about_text: aboutText || null,
        schedule: normalizedSchedule.length > 0 ? normalizedSchedule : null,
      };

      const token = localStorage.getItem("token");
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Failed to create channel: ${res.status} ${msg}`);
      }

      const data = await res.json();
      setChannelInfo(data);

      // Reset form
      setChannelNumber("");
      setDisplayName("");
      setSelectedWidgets([]);
      setAboutText("");
      setScheduleItems([]);
      setSuccess(true);

      // Notify parent
      if (onChannelCreated) {
        onChannelCreated(data);
      }
    } catch (err) {
      console.error("Error submitting channel", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="create-channel-overlay" role="dialog" aria-modal="true" aria-labelledby="create-channel-title">
      <div className="create-channel-content" ref={boxRef}>
        <button className="close-btn" onClick={onClose} aria-label="Close create channel">X</button>

        <h2 id="create-channel-title">Create Channel</h2>

        <form className="create-channel-form" onSubmit={handleSubmit}>
          {/* Channel Number Dropdown */}
          <div className="row">
            <label htmlFor="channel-number">Channel Number</label>
            <select
              ref={firstFieldRef}
              id="channel-number"
              value={channelNumber}
              onChange={(e) => setChannelNumber(e.target.value)}
              required
              disabled={loadingChannels}
            >
              <option value="">
                {loadingChannels ? "Loading available channels..." : "Select a channel number..."}
              </option>
              {availableChannels.map(num => (
                <option key={num} value={num}>
                  Channel {num}
                </option>
              ))}
            </select>
            {!loadingChannels && availableChannels.length === 0 && (
              <small className="form-hint" style={{ color: '#ff6b6b' }}>
                All channel numbers are taken.
              </small>
            )}
          </div>

          {/* Display Name */}
          <div className="row">
            <label htmlFor="display-name">Channel Display Name</label>
            <input
              id="display-name"
              type="text"
              placeholder="e.g., Cinema, Horror Marathon..."
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
              maxLength={20}
              required
            />
            <small className="form-hint">{displayName.length}/20 characters</small>
          </div>

          {/* Widget Selector - General widgets only */}
          <div className="widget-selector">
            <h4>Channel Widgets</h4>
            <p className="help-text">Select which widgets to display in your channel menu.</p>

            <div className="widget-grid">
              {GENERAL_WIDGETS.map(widget => (
                <label
                  key={widget.type}
                  className={`widget-option ${isWidgetSelected(widget.type) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isWidgetSelected(widget.type)}
                    onChange={() => toggleWidget(widget.type)}
                  />
                  <div className="widget-card">
                    <span className="widget-icon">{widget.icon}</span>
                    <div className="widget-info">
                      <strong>{widget.name}</strong>
                      <p>{widget.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <p className="help-text event-hint">
              Event widgets (Voting, Leaderboard, Bracket) are automatically added when you create an event.
            </p>
          </div>

          {/* About widget textarea (conditional) */}
          {isWidgetSelected('about') && (
            <div className="row">
              <label htmlFor="about-text">About Text (Markdown supported)</label>
              <textarea
                id="about-text"
                value={aboutText}
                onChange={(e) => setAboutText(e.target.value)}
                placeholder="Describe your channel... You can use **bold**, _italic_, and [links](https://example.com)"
                rows={6}
              />
            </div>
          )}

          {/* Now Playing schedule editor (conditional) */}
          {isWidgetSelected('now_playing') && (
            <div className="schedule-editor">
              <div className="schedule-header">
                <h4>Now Playing / Up Next Schedule</h4>
                <button type="button" className="btn-secondary small" onClick={addScheduleRow}>
                  + Add Time Slot
                </button>
              </div>

              {scheduleItems.length === 0 ? (
                <p className="schedule-hint">
                  Add time slots to show what's playing and coming up next on your channel.
                </p>
              ) : (
                <div className="schedule-table">
                  {scheduleItems.map((item, idx) => (
                    <div key={idx} className="schedule-row">
                      <div className="schedule-field">
                        <label>Program Title</label>
                        <input
                          type="text"
                          placeholder="e.g., Movie Night"
                          value={item.title}
                          onChange={(e) => updateScheduleItem(idx, { title: e.target.value })}
                        />
                      </div>
                      <div className="schedule-field">
                        <label>Air Date & Time</label>
                        <input
                          type="datetime-local"
                          value={item.scheduled_at}
                          onChange={(e) => updateScheduleItem(idx, { scheduled_at: e.target.value })}
                        />
                      </div>
                      <div className="schedule-field duration-field">
                        <label>Duration</label>
                        <input
                          type="text"
                          placeholder="HH:MM:SS"
                          value={item.duration}
                          onChange={(e) => updateScheduleItem(idx, { duration: e.target.value })}
                          pattern="^(\d{1,2}:)?\d{1,2}:\d{2}$"
                          title="Format: HH:MM:SS or MM:SS"
                        />
                      </div>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Remove time slot"
                        onClick={() => removeScheduleRow(idx)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button type="submit" disabled={submitting || !canSubmit()}>
            {submitting ? "Creating..." : "Create Channel"}
          </button>
        </form>

        {success && <p className="create-channel-message">Channel created successfully!</p>}

        {channelInfo && (
          <div className="channel-details">
            <p><strong>Stream Key:</strong> {channelInfo.stream_key}</p>
            <p><strong>Ingest URL for OBS:</strong> rtmp://dainbramage.tv/live/{channelInfo.stream_key}</p>
            <p><strong>Playback URL (HLS):</strong> {channelInfo.playback_path}</p>

            <div className="channel-actions">
              <button onClick={() => navigator.clipboard.writeText(channelInfo.stream_key)}>
                Copy Stream Key
              </button>
              <button onClick={() => navigator.clipboard.writeText(`rtmp://dainbramage.tv/live/${channelInfo.stream_key}`)}>
                Copy Ingest URL
              </button>
              <button onClick={() => navigator.clipboard.writeText(channelInfo.playback_path)}>
                Copy Playback URL
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateChannelModal;
