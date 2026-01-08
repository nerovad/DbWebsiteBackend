// src/components/EditChannelModal/EditChannelModal.tsx
import React, { useEffect, useRef, useState } from "react";
import "./EditChannelModal.scss";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel | null;
  onUpdate: (updatedChannel: any) => void;
}

type Channel = {
  id: string;
  name: string;
  display_name?: string;
  channel_number?: number;
  slug?: string;
  description?: string;
};

type VotingMode = "ratings" | "battle";
type EventType = "film_festival";

type NewFilm = {
  title: string;
  creator?: string;
  duration?: string;
  thumbnail?: string;
};

const emptyFilm: NewFilm = { title: "", creator: "", duration: "", thumbnail: "" };

const EditChannelModal: React.FC<Props> = ({ isOpen, onClose, channel, onUpdate }) => {
  const boxRef = useRef<HTMLDivElement>(null);

  // Channel fields
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Event/festival
  const [addEvent, setAddEvent] = useState(false);
  const [eventType] = useState<EventType>("film_festival");
  const [eventTitle, setEventTitle] = useState("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");
  const [votingMode, setVotingMode] = useState<VotingMode>("ratings");
  const [requireLogin, setRequireLogin] = useState<boolean>(true);

  // Films
  const [films, setFilms] = useState<NewFilm[]>([{ ...emptyFilm }]);

  // Load channel data when modal opens
  useEffect(() => {
    if (channel && isOpen) {
      setDisplayName(channel.display_name || "");
      setDescription(channel.description || "");
      // Reset event fields
      setAddEvent(false);
      setEventTitle("");
      setStartsAt("");
      setEndsAt("");
      setVotingMode("ratings");
      setRequireLogin(true);
      setFilms([{ ...emptyFilm }]);
    }
  }, [channel, isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // ESC key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  const canSubmit = () => {
    if (!displayName.trim()) return false;
    if (!addEvent) return true;
    if (!eventTitle.trim()) return false;
    if (!startsAt || !endsAt) return false;
    if (new Date(startsAt) >= new Date(endsAt)) return false;
    const validFilms = films.filter(f => f.title.trim().length > 0);
    return validFilms.length > 0;
  };

  const addFilmRow = () => setFilms(prev => [...prev, { ...emptyFilm }]);
  const removeFilmRow = (idx: number) => setFilms(prev => prev.filter((_, i) => i !== idx));
  const updateFilm = (idx: number, patch: Partial<NewFilm>) =>
    setFilms(prev => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));

  const normalizeFilms = (): NewFilm[] => {
    return films
      .map(f => ({
        title: f.title.trim(),
        creator: f.creator?.trim() || undefined,
        duration: f.duration?.trim() || undefined,
        thumbnail: f.thumbnail?.trim() || undefined,
      }))
      .filter(f => f.title.length > 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit() || !channel) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const body: any = {
        display_name: displayName,
        description: description || null,
      };

      if (addEvent) {
        body.event = {
          kind: eventType,
          title: eventTitle,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          voting_mode: votingMode,
          require_login: requireLogin,
        };
        body.films = normalizeFilms();
      }

      const res = await fetch(`/api/channels/${channel.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Failed to update channel: ${res.status} ${msg}`);
      }

      const data = await res.json();
      onUpdate(data);
      onClose();
    } catch (err) {
      console.error("Error updating channel", err);
      alert("Failed to update channel. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !channel) return null;

  return (
    <div className="edit-channel-overlay" role="dialog" aria-modal="true">
      <div className="edit-channel-content" ref={boxRef}>
        <button className="close-btn" onClick={onClose} aria-label="Close">X</button>

        <h2>Edit Channel {channel.channel_number}</h2>

        <form className="edit-channel-form" onSubmit={handleSubmit}>
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

          <div className="row">
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              rows={3}
              placeholder="Brief description of your channel..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Add Event Toggle */}
          <button
            type="button"
            className={`toggle-btn ${addEvent ? "active" : ""}`}
            onClick={() => setAddEvent(!addEvent)}
          >
            {addEvent ? "✓ Event Added" : "+ Add Event"}
          </button>

          {addEvent && (
            <div className="festival-block">
              <div className="row">
                <label>Type</label>
                <select value={eventType} disabled>
                  <option value="film_festival">Film Festival</option>
                </select>
              </div>

              <div className="row">
                <label>Event Name</label>
                <input
                  type="text"
                  placeholder="e.g. DBTV Summer Shorts 2025"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  required
                />
              </div>

              <div className="row cols-2">
                <div>
                  <label>Starts</label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label>Ends</label>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="row cols-2">
                <div>
                  <label>Voting Mode</label>
                  <select value={votingMode} onChange={(e) => setVotingMode(e.target.value as VotingMode)}>
                    <option value="ratings">Ratings (1–10)</option>
                    <option value="battle">Battle (head‑to‑head)</option>
                  </select>
                </div>
                <label className="checkbox-row" style={{ alignSelf: "end" }}>
                  <input
                    type="checkbox"
                    checked={requireLogin}
                    onChange={(e) => setRequireLogin(e.target.checked)}
                  />
                  <span>Require login to vote</span>
                </label>
              </div>

              <div className="films-header">
                <h4>Films in this festival</h4>
                <button type="button" className="btn-secondary small" onClick={addFilmRow}>+ Add Film</button>
              </div>

              <div className="films-table">
                {films.map((f, idx) => (
                  <div key={idx} className="film-row">
                    <input
                      type="text"
                      placeholder="Title *"
                      value={f.title}
                      onChange={(e) => updateFilm(idx, { title: e.target.value })}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Creator (optional)"
                      value={f.creator || ""}
                      onChange={(e) => updateFilm(idx, { creator: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="Duration (e.g. 07:42)"
                      value={f.duration || ""}
                      onChange={(e) => updateFilm(idx, { duration: e.target.value })}
                    />
                    <input
                      type="url"
                      placeholder="Thumbnail URL (optional)"
                      value={f.thumbnail || ""}
                      onChange={(e) => updateFilm(idx, { thumbnail: e.target.value })}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Remove film"
                      onClick={() => removeFilmRow(idx)}
                      disabled={films.length === 1}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="submit" disabled={submitting || !canSubmit()}>
            {submitting ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditChannelModal;
