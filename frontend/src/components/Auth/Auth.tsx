import React, { useState } from "react";
import TermsOfService from "./TermsOfService";
import "./Auth.scss";

interface AuthProps {
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAuthOpen: React.Dispatch<React.SetStateAction<boolean>>;
  authMode: "login" | "register";
  setAuthMode: React.Dispatch<React.SetStateAction<"login" | "register">>;
}

const Auth: React.FC<AuthProps> = ({ setIsLoggedIn, setIsAuthOpen, authMode, setAuthMode }) => {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [showTos, setShowTos] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If registering, show ToS first
    if (authMode === "register") {
      setShowTos(true);
      return;
    }

    // Otherwise, proceed with login
    await proceedWithAuth();
  };

  const proceedWithAuth = async () => {
    if (authMode === "register" && password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const url =
        authMode === "login"
          ? "http://localhost:4000/api/auth/login"
          : "http://localhost:4000/api/auth/register";

      const body =
        authMode === "login"
          ? { email: emailOrUsername, username: emailOrUsername, password }
          : { email, username, password };

      // ADD THESE 3 LINES HERE:
      console.log("Auth mode:", authMode);
      console.log("Sending body:", body);
      console.log("To URL:", url);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Don't call res.json() blindly—404/HTML will crash JSON.parse
      const text = await res.text();

      // ADD THESE 2 LINES HERE:
      console.log("Server response status:", res.status);
      console.log("Server response text:", text);

      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        // response wasn't JSON (e.g., 404 HTML); leave data as {}
      }

      if (!res.ok) {
        const message =
          data?.error ||
          data?.message ||
          `Request failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`;
        throw new Error(message);
      }

      if (authMode === "login") {
        if (!data?.token) throw new Error("No token returned from server.");
        localStorage.setItem("token", data.token);
        setIsLoggedIn(true);
        setIsAuthOpen(false);
      } else {
        alert("Registration successful! You can now log in.");
        setAuthMode("login");
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      alert(err?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }

  }; return (
    <div className="auth-overlay">
      <div className="auth-card">
        <button className="close-btn" onClick={() => setIsAuthOpen(false)} disabled={submitting}>
          ✖
        </button>
        <h2>{authMode === "login" ? "Login" : "Register"}</h2>
        <form onSubmit={handleSubmit}>
          {authMode === "register" ? (
            <>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
              />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={submitting}
              />
            </>
          ) : (
            <input
              type="text"
              placeholder="Email or Username"
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              required
              disabled={submitting}
            />
          )}
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={submitting}
          />
          {authMode === "register" && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={submitting}
            />
          )}
          <button type="submit" disabled={submitting}>
            {submitting ? "Please wait…" : authMode === "login" ? "Login" : "Register"}
          </button>
        </form>
        <p>
          {authMode === "login" ? "Don't have an account?" : "Already have an account?"}
          <span onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
            {authMode === "login" ? " Register" : " Login"}
          </span>
        </p>
      </div>
      {showTos && (
        <TermsOfService
          onAccept={() => {
            setShowTos(false);
            proceedWithAuth();
          }}
          onDecline={() => {
            setShowTos(false);
          }}
        />
      )}
    </div>
  );
};

export default Auth;
