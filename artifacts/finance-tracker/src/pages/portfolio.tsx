import Investments from "./investments";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

export default function Portfolio() {
  return <Investments defaultTab="portfolio" />;
}
