'use client';

import { useEffect, useRef } from 'react';

/** Tokens do tema usados nas faíscas (lidos do CSS para não repetir cores no código). */
const COLOR_TOKENS = ['--color-neon-primary', '--color-neon-soft', '--color-gold', '--color-gold-soft', '--color-silver-soft'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/**
 * Fogos de artifício em canvas (comemoração ao dar baixa numa conta). Dura ~2,5 s, não bloqueia
 * cliques (pointer-events: none) e não aparece para quem pediu menos movimento no sistema.
 * Troque a `burstKey` para disparar de novo.
 */
export function Fireworks({ burstKey, onDone }: { burstKey: number; onDone?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!burstKey) return;
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDoneRef.current?.();
      return;
    }
    const css = getComputedStyle(document.documentElement);
    const colors = COLOR_TOKENS.map((t) => css.getPropertyValue(t).trim()).filter(Boolean);
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      el.width = window.innerWidth * dpr;
      el.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const particles: Particle[] = [];
    const burst = () => {
      const x = window.innerWidth * (0.2 + Math.random() * 0.6);
      const y = window.innerHeight * (0.15 + Math.random() * 0.35);
      const color = colors[Math.floor(Math.random() * colors.length)] || 'gold';
      for (let i = 0; i < 90; i++) {
        const angle = (Math.PI * 2 * i) / 90;
        const speed = 2.5 + Math.random() * 4.5;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
      }
    };

    const DURATION = 2500;
    const start = performance.now();
    let lastBurst = 0;
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      // Explosões a cada 220 ms nos primeiros 1,5 s
      if (elapsed < 1500 && now - lastBurst > 220) {
        burst();
        lastBurst = now;
      }
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of particles) {
        p.vy += 0.06; // gravidade
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.009;
        if (p.life <= 0) continue;
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2 * Math.max(p.life, 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (elapsed < DURATION) frame = requestAnimationFrame(tick);
      else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        onDoneRef.current?.();
      }
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [burstKey]);

  return <canvas ref={canvas} aria-hidden className="fixed inset-0 w-screen h-screen pointer-events-none z-[90]" />;
}
