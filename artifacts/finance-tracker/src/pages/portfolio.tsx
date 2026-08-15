import Investments from "./investments";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

export default function Portfolio() {
  return <Investments defaultTab="portfolio" />;
}
