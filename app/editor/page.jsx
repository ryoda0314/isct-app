"use client";
import dynamic from "next/dynamic";
const MapEditor = dynamic(() => import("./MapEditor.jsx"), { ssr: false });
export default function EditorPage() { return <MapEditor />; }
