import { notFound } from "next/navigation";
import GroveLab from "./GroveLab";

// A dev-only playground for the 3D grove. Never served in production.
export default function GroveLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GroveLab />;
}
