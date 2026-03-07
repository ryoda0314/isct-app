"use client";
import dynamic from "next/dynamic";
const App = dynamic(() => import("../campus-sns/App.jsx"), { ssr: false });
export default function Page() { return <App />; }
