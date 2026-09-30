import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Серии встреч", template: "%s | Kotrol" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
