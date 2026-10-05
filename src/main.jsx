import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter, Routes, Route } from "react-router";
import { GeneralContext } from "./Context/GeneralContext.jsx";
import { ThemeProvider } from "./Context/ThemeContext.jsx";
import { Toast } from '@heroui/react';
import { MarketingAuthProvider } from "./Auth/MarketingAuthContext.jsx";
import { CallingAuthProvider } from "./Auth/CallingAuthContext.jsx";

if (import.meta.env.PROD) console.error = () => {};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <GeneralContext>
        <Toast.Provider />
      <BrowserRouter>
        <MarketingAuthProvider><CallingAuthProvider><Routes><Route path="/*" element={<App />} /></Routes></CallingAuthProvider></MarketingAuthProvider>
      </BrowserRouter>
      </GeneralContext>
    </ThemeProvider>
  </StrictMode>,
);
