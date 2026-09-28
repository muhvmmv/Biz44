import Navbar from "@/components/landing/NavBar";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import Screenshots from "@/components/landing/Screenshots";
import AnimationShowcase from "@/components/landing/AnimationShowcase";
import HowItWorks from "@/components/landing/HowItWorks";
import Advantages from "@/components/landing/Advantages";
import AnimatedStats from "@/components/landing/AnimatedStats";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Screenshots />
        <AnimationShowcase />
        <HowItWorks />
        <Advantages />
        <AnimatedStats />
        <CTA />
      </main>
      <Footer />
    </>
  );
}