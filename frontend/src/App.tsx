import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./store/AuthContext";
import NavBar from "./components/Navigation/Navigation.tsx";
import NewsTicker from "./components/NewsTicker/NewsTicker.tsx";
import TvGuide from "./components/TvGuide/TvGuide.tsx";
import VideoPlayer from "./components/VideoPlayer/VideoPlayer.tsx";
import Channels from "./components/Menu/Menu.tsx";
import Chatbox from "./components/Chatbox/Chatbox.tsx";
import Auth from "./components/Auth/Auth.tsx";
import Settings from "./components/Settings/Settings.tsx";
import Upload from "./components/Upload/Upload.tsx";
import Profile from "./components/Profile/Profile.tsx";
import AdminFestivals from "./components/Pages/AdminFestivals.tsx";
import CreateChannelForm from "./components/Channel/CreateChannelForm";
import "./App.scss";

const MainLayout: React.FC<{
  isMenuOpen: boolean;
  isChatOpen: boolean;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isGuideOpen: boolean;
  setIsGuideOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLoggedIn: boolean;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  videoControls: any;
  isAuthOpen: boolean;
  setIsAuthOpen: React.Dispatch<React.SetStateAction<boolean>>;
  authMode: "login" | "register";
  setAuthMode: React.Dispatch<React.SetStateAction<"login" | "register">>;
  channelSlug?: string; // ✅ New prop for channel routing
}> = ({
  isMenuOpen,
  isChatOpen,
  setIsMenuOpen,
  setIsChatOpen,
  isGuideOpen,
  setIsGuideOpen,
  isLoggedIn,
  setIsLoggedIn,
  videoControls,
  isAuthOpen,
  setIsAuthOpen,
  authMode,
  setAuthMode,
  channelSlug
}) => (
    <>
      <NavBar
        isLoggedIn={isLoggedIn}
        setIsLoggedIn={setIsLoggedIn}
        setIsGuideOpen={setIsGuideOpen}
        setIsAuthOpen={setIsAuthOpen}
        setAuthMode={setAuthMode}
        {...videoControls}
      />
      <div className="main-content">
        <Channels isOpen={isMenuOpen} setIsOpen={setIsMenuOpen} />

        <VideoPlayer
          isMenuOpen={isMenuOpen}
          isChatOpen={isChatOpen}
          setIsGuideOpen={setIsGuideOpen}
          setVideoControls={videoControls.setVideoControls}
          channelSlug={channelSlug} // ✅ Pass channel slug to VideoPlayer
        />
        <Chatbox isOpen={isChatOpen} setIsOpen={setIsChatOpen} />
      </div>
      <NewsTicker />

      {isGuideOpen && <TvGuide isOpen={isGuideOpen} closeGuide={() => setIsGuideOpen(false)} />}
    </>
  );

const App: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const [videoControls, setVideoControls] = useState<any>({
    currentIndex: 0,
    setCurrentIndex: () => { },
    videoLinks: [],
    videoRef: null,
    goToNextVideo: () => { },
    goToPreviousVideo: () => { },
    toggleMute: () => { },
    toggleFullscreen: () => { },
    loadVideo: () => { },
    setVideoControls: (controls: any) => setVideoControls((prev) => ({ ...prev, ...controls })),
  });

  useEffect(() => {
    const checkLogin = () => setIsLoggedIn(!!localStorage.getItem("token"));
    window.addEventListener("storage", checkLogin);
    return () => {
      window.removeEventListener("storage", checkLogin);
    };
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Redirect root to default channel */}
          <Route path="/" element={<Navigate to="/channel/channel-0" replace />} />

          {/* Channel-specific route */}
          <Route
            path="/channel/:channelSlug"
            element={
              <MainLayout
                isMenuOpen={isMenuOpen}
                isChatOpen={isChatOpen}
                setIsMenuOpen={setIsMenuOpen}
                setIsChatOpen={setIsChatOpen}
                isGuideOpen={isGuideOpen}
                setIsGuideOpen={setIsGuideOpen}
                isAuthOpen={isAuthOpen}
                setIsAuthOpen={setIsAuthOpen}
                authMode={authMode}
                setAuthMode={setAuthMode}
                isLoggedIn={isLoggedIn}
                setIsLoggedIn={setIsLoggedIn}
                videoControls={videoControls}
                channelSlug={undefined} // Will be extracted in VideoPlayer via useParams
              />
            }
          />

          {/* Other routes */}
          <Route path="/upload" element={<Upload />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin/festivals" element={<AdminFestivals />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/channel/channel-0" replace />} />
        </Routes>

        {isAuthOpen && (
          <Auth
            setIsLoggedIn={setIsLoggedIn}
            setIsAuthOpen={setIsAuthOpen}
            authMode={authMode}
            setAuthMode={setAuthMode}
          />
        )}
      </Router>
    </AuthProvider>
  );
};

export default App;
