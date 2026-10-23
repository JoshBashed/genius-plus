import { createRoot } from "react-dom/client";
import { App } from "@/popup/App";
import tailwind from "@/styles/tailwind.css";

const style = document.createElement("style");
style.textContent = tailwind;
document.head.appendChild(style);

const container = document.getElementById("root");

if (container !== null) {
    createRoot(container).render(<App />);
}
