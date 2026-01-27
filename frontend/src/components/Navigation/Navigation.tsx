import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaUserCircle, FaVolumeMute, FaExpand, FaTv } from "react-icons/fa";
import Logo from "../../assets/cinezoo_logo_neon_7.svg";
import "./Navigation.scss";
import UpArrow from "../../assets/up_arrow_icon.svg"
import DownArrow from "../../assets/down_arrow.svg"
import TvGuide from "../../assets/tv_guide_icon.svg"
import Fullscreen from "../../assets/fullscreen_icon.svg"
import Mute from "../../assets/mute_icon.svg"
import { useChatStore } from "../../store/useChatStore";
import { useAuth } from "../../store/AuthContext";

type VideoLinkType = { src: string; channel: string; channelNumber: number; displayName?: string; tags?: string[] };

interface NavBarProps {
  isLoggedIn: boolean;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  videoLinks: VideoLinkType[];
  videoRef: React.RefObject<HTMLVideoElement>;
  setIsGuideOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  goToNextVideo: () => void;
  goToPreviousVideo: () => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  loadVideo: (src: string) => void;

  setIsAuthOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAuthMode: (mode: "login" | "register") => void;
}

const SearchNavBar: React.FC<NavBarProps> = ({
  isLoggedIn,
  setIsLoggedIn,
  currentIndex,
  setCurrentIndex,
  videoLinks,
  videoRef,
  setIsGuideOpen,
  goToNextVideo,
  goToPreviousVideo,
  toggleMute,
  toggleFullscreen,
  loadVideo,
  setIsAuthOpen,
  setAuthMode,
}) => {
  const navigate = useNavigate();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [channelInput, setChannelInput] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const { setChannelId } = useChatStore();
  const { user } = useAuth();

  // Current channel info for placeholder
  const currentChannel = videoLinks[currentIndex];
  const placeholderText = currentChannel
    ? `Ch ${currentChannel.channelNumber}${currentChannel.displayName ? ` - ${currentChannel.displayName}` : ''}`
    : "Search channels...";

  // Search results - filter channels based on input
  const searchResults = useMemo(() => {
    const searchTerm = channelInput.trim().toLowerCase();
    if (!searchTerm) return [];

    const results: { channel: VideoLinkType; matchType: 'number' | 'name' | 'tag'; matchedTag?: string }[] = [];

    videoLinks.forEach(v => {
      // Check channel number
      const targetNumber = parseInt(channelInput, 10);
      if (!isNaN(targetNumber) && v.channelNumber === targetNumber) {
        results.push({ channel: v, matchType: 'number' });
        return;
      }

      // Check display name
      if (v.displayName?.toLowerCase().includes(searchTerm)) {
        results.push({ channel: v, matchType: 'name' });
        return;
      }

      // Check tags
      const matchedTag = v.tags?.find(tag => tag.toLowerCase().includes(searchTerm));
      if (matchedTag) {
        results.push({ channel: v, matchType: 'tag', matchedTag });
      }
    });

    return results;
  }, [channelInput, videoLinks]);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
  };

  const selectChannel = (channel: VideoLinkType) => {
    const targetIndex = videoLinks.findIndex(v => v.channel === channel.channel);
    if (targetIndex !== -1) {
      setCurrentIndex(targetIndex);
      loadVideo(channel.src);
      setChannelId(channel.channel);
      navigate(`/channel/${channel.channel}`, { replace: true });
      setChannelInput("");
      setShowSearchDropdown(false);
    }
  };

  const goToChannel = () => {
    if (searchResults.length > 0) {
      selectChannel(searchResults[0].channel);
    } else if (channelInput.trim()) {
      alert(`No channel found matching "${channelInput}"`);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChannelInput(e.target.value);
    setShowSearchDropdown(e.target.value.trim().length > 0);
  };

  const handleInputFocus = () => {
    if (channelInput.trim().length > 0) {
      setShowSearchDropdown(true);
    }
  };

  return (
    <div className="search-navbar">
      {/* Left Logo */}
      <div className="search-navbar__left">
        <a href="/">
          <img src={Logo} alt="Cinezoo" className="search-navbar__logo" />
        </a>
      </div>

      {/* Center Controls */}
      <div className="search-navbar__center">
        <button className="channel-button" onClick={goToPreviousVideo}>
          <img src={DownArrow} alt="Previous Channel" className="channel-arrow-icon" />
        </button>
        <button className="channel-button" onClick={goToNextVideo}>
          <img src={UpArrow} alt="Next Channel" className="channel-arrow-icon" />
        </button>

        <button
          className="search-navbar__tv-guide-button"
          onClick={(e) => { e.preventDefault(); setIsGuideOpen?.((prev) => !prev); }}
        >
          <img src={TvGuide} alt="TV Guide" />
        </button>

        <div className="search-navbar__channel-input-container" ref={searchContainerRef}>
          <input
            type="text"
            value={channelInput}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            placeholder={placeholderText}
            className="channel-input"
            onKeyDown={(e) => e.key === "Enter" && goToChannel()}
          />
          <button className="channel-go-button" onClick={goToChannel}>
            Go
          </button>

          {showSearchDropdown && searchResults.length > 0 && (
            <div className="search-dropdown">
              {searchResults.map(({ channel, matchType, matchedTag }) => (
                <div
                  key={channel.channel}
                  className="search-dropdown__item"
                  onClick={() => selectChannel(channel)}
                >
                  <span className="search-dropdown__channel-number">{channel.channelNumber}</span>
                  <span className="search-dropdown__channel-name">
                    {channel.displayName || channel.channel}
                  </span>
                  {matchType === 'tag' && matchedTag && (
                    <span className="search-dropdown__tag">#{matchedTag}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mute Button */}
        <button className="mute-button" onClick={toggleMute}>
          <img src={Mute} alt="Mute" />
        </button>

        {/* Fullscreen Button */}
        <button className="fullscreen-button" onClick={toggleFullscreen}>
          <img src={Fullscreen} alt="Fullscreen" />
        </button>
      </div>
      {/* Right Links & Profile/Login */}
      <div className="search-navbar__links">
        {!isLoggedIn ? (
          <>
            <button
              onClick={() => { setAuthMode("login"); setIsAuthOpen(true); }}
              className="search-navbar__login-button"
            >
              Login
            </button>
          </>
        ) : (
          <div className="search-navbar__profile" onClick={() => setShowProfileDropdown(!showProfileDropdown)}>
            <FaUserCircle className="search-navbar__profile-icon" size={24} />
            <span className="search-navbar__username">{user?.username}</span>
            {showProfileDropdown && (
              <div className="profile-dropdown" onClick={(e) => e.stopPropagation()}>
                <Link to="/profile" className="profile-dropdown__item">My Space</Link>
                <button onClick={handleLogout} className="profile-dropdown__logout">Log out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchNavBar;
