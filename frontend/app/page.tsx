import { ThemeProvider } from "@/hooks/useTheme";
import Landing from "@/components/landing/Landing";

export default function Home() {
  return (
    <ThemeProvider>
      <Landing />
    </ThemeProvider>
  );
}
