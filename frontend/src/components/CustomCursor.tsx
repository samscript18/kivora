"use client";
import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
export default function CustomCursor(){const x=useMotionValue(-100),y=useMotionValue(-100);const xs=useSpring(x,{damping:30,stiffness:220,mass:.8}),ys=useSpring(y,{damping:30,stiffness:220,mass:.8});useEffect(()=>{const move=(e:MouseEvent)=>{x.set(e.clientX-16);y.set(e.clientY-16)};window.addEventListener("mousemove",move);return()=>window.removeEventListener("mousemove",move)},[x,y]);return <motion.div className="pointer-events-none fixed left-0 top-0 z-[9999] hidden h-8 w-8 rounded-full border border-accent/40 bg-accent/10 opacity-70 mix-blend-screen md:block" style={{translateX:xs,translateY:ys,boxShadow:"0 0 20px rgba(255,19,1,.35)"}}/>}
