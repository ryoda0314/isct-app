"use client";
import dynamic from "next/dynamic";
const Map3DEditor = dynamic(() => import("../Map3DEditor.jsx"), { ssr: false });
export default function Map3DEditorPage() { return <Map3DEditor />; }
