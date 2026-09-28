"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const stats = [
  { label: "Transactions / sec", value: 12, suffix: "K+" },
  { label: "Uptime", value: 99.99, suffix: "%" },
  { label: "Happy teams", value: 3500, suffix: "+" },
];

function Counter({ from, to, suffix }: { from: number; to: number; suffix: string }) {
  const [count, setCount] = useState(from);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let start = from;
          const increment = (to - from) / 40;
          const timer = setInterval(() => {
            start += increment;
            if (start >= to) {
              setCount(to);
              clearInterval(timer);
            } else {
              setCount(Math.floor(start));
            }
          }, 30);
          return () => clearInterval(timer);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [from, to]);

  return (
    <span ref={ref} className="text-3xl font-extrabold">{count}{suffix}</span>
  );
}

export default function AnimatedStats() {
  return (
    <section className="py-24 bg-gradient-to-r from-brand to-emerald-400 text-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="grid sm:grid-cols-3 gap-8">
          {stats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.2 }}
              className="space-y-2"
            >
              <Counter from={0} to={stat.value} suffix={stat.suffix} />
              <p className="text-white/80 font-medium">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
    </section>
  );
}