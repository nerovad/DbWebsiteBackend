import React, { useEffect, useRef, useState } from "react";
import "./NewsTicker.scss";
import "../../styles/_variables.scss";

const NewsTicker: React.FC = () => {
  const tickerRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(50);

  const tickerText = `Welcome to CineZoo! | Click anywhere on screen to navigate channels | Press 'm' to mute/unmute | Want your own channel or festival? Email us as cinezoo@gmail.com | Check out channel 99 for Friday Night Rewind: Live!`;

  useEffect(() => {
    if (tickerRef.current) {
      // Get the width of a single instance of the text
      const singleTextWidth = tickerRef.current.scrollWidth / 4; // Divide by 4 since we have 4 copies
      // Speed in pixels per second (adjust this value to change speed)
      const pixelsPerSecond = 25;
      const calculatedDuration = singleTextWidth / pixelsPerSecond;
      setDuration(calculatedDuration);
    }
  }, []);

  return (
    <div className="news-ticker">
      <div
        className="ticker"
        ref={tickerRef}
        style={{ animationDuration: `${duration}s` }}
      >
        <span>{tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
        <span>{tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
        <span>{tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
        <span>{tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      </div>
    </div>
  );
};

export default NewsTicker;
