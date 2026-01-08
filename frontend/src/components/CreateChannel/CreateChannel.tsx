import React, { useState } from "react";

const CreateChannelForm: React.FC = () => {
  const [channelName, setChannelName] = useState("");
  const [selectedNumber, setSelectedNumber] = useState("");
  const [error, setError] = useState("");

  // Generate available channel numbers (e.g., 2-99, excluding 1 which might be reserved)
  const availableChannels = Array.from({ length: 98 }, (_, i) => i + 2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!channelName.trim()) {
      setError("Channel name is required");
      return;
    }

    if (!selectedNumber) {
      setError("Please select a channel number");
      return;
    }

    // Auto-generate slug from name
    const slug = channelName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, "");     // remove leading/trailing hyphens

    // TODO: Send to API/backend
    console.log({
      name: channelName,
      number: parseInt(selectedNumber),
      slug: slug
    });

    setError("");
  };

  return (
    <form className="create-channel-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="channel-name">Channel Name:</label>
        <input
          id="channel-name"
          type="text"
          value={channelName}
          onChange={(e) => setChannelName(e.target.value.slice(0, 20))}
          maxLength={20}
          placeholder="Enter channel name..."
          autoFocus
        />
        <small>{channelName.length}/20 characters</small>
      </div>

      <div className="form-group">
        <label htmlFor="channel-number">Channel Number:</label>
        <select
          id="channel-number"
          value={selectedNumber}
          onChange={(e) => setSelectedNumber(e.target.value)}
        >
          <option value="">Select a channel number...</option>
          {availableChannels.map(num => (
            <option key={num} value={num}>
              Channel {num}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-message">{error}</div>}

      <button type="submit" className="submit-btn">
        Create Channel
      </button>
    </form>
  );
};

export default CreateChannelForm;
