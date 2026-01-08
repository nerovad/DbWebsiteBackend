import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaUserCircle, FaVolumeMute, FaExpand, FaTv } from "react-icons/fa";
import Logo from "../../assets/cinezoo_logo_neon_7.svg";
import "./Navigation.scss";
import UpArrow from "../../assets/up_arrow_icon.svg"
import DownArrow from "../../assets/down_arrow.svg"
import TvGuide from "../../assets/tv_guide_icon.svg"
import Fullscreen from "../../assets/fullscreen_icon.svg"
import Mute from "../../assets/mute_icon.svg"
import CreateChannelModal from "../CreateChannelModal/CreateChannelModal";
import { useChatStore } from "../../store/useChatStore";

interface NavBarProps {
  isLoggedIn: boolean;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  videoLinks: { src: string; channel: string; channelNumber: number }[];
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
  const [showDropdown, setShowDropdown] = useState(false);
  const [channelInput, setChannelInput] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false); // ⬅️ modal state
  const { setChannelId } = useChatStore();

  // Add this right at the top of the component, after the state declarations
  console.log("Current videoLinks:", videoLinks);
  console.log("Current index:", currentIndex);
  console.log("Current channel number:", videoLinks[currentIndex]?.channelNumber);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
  };

  const goToChannel = () => {
    const targetChannelNumber = parseInt(channelInput, 10);
    if (isNaN(targetChannelNumber)) {
      alert("Invalid channel number");
      return;
    }

    const targetIndex = videoLinks.findIndex(v => v.channelNumber === targetChannelNumber);

    if (targetIndex !== -1) {
      const targetChannel = videoLinks[targetIndex];
      setCurrentIndex(targetIndex);
      loadVideo(targetChannel.src);
      setChannelId(targetChannel.channel); // ⬅️ ADD THIS: Update the store
      navigate(`/channel/${targetChannel.channel}`, { replace: true });
    } else {
      alert(`Channel ${targetChannelNumber} not found`);
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

        <div className="search-navbar__channel-input-container">
          <input
            type="text"
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            placeholder={`${videoLinks[currentIndex]?.channelNumber ?? currentIndex}`} // ⬅️ Show channel number
            className="channel-input"
            onKeyDown={(e) => e.key === "Enter" && goToChannel()}
          />
          <button className="channel-go-button" onClick={goToChannel}>
            Go
          </button>
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

        {/* ⬇️ New Create Channel button */}
        {isLoggedIn && (
          <button
            id="create-channel-trigger"
            className="search-navbar__create-channel-button"
            onClick={() => setIsCreateOpen(true)}
          >
            + Create Channel
          </button>
        )}

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
          <div className="search-navbar__profile" onClick={() => setShowDropdown(!showDropdown)}>
            <FaUserCircle className="search-navbar__profile-icon" size={24} />
            {showDropdown && (
              <div className="profile-dropdown" onClick={(e) => e.stopPropagation()}>
                <Link to="/profile" className="profile-dropdown__item">My Space</Link>
                <button onClick={handleLogout} className="profile-dropdown__logout">Log out</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/*Modal */}
      <CreateChannelModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        excludeClickId="create-channel-trigger"
      />
    </div>
  );
};

export default SearchNavBar;
