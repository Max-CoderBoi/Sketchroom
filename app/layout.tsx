import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SketchRoom | Collaborative Whiteboard",
  description: "A real-time collaborative whiteboard for teams and classrooms.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
