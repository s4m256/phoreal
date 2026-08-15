"use client";

import { useEffect, useRef, useState } from "react";

export function BrownNoiseButton() {
  const [playing,setPlaying]=useState(false);
  const audioRef=useRef<{context:AudioContext;source:AudioBufferSourceNode}|null>(null);

  useEffect(()=>()=>{
    audioRef.current?.source.stop();
    void audioRef.current?.context.close();
  },[]);

  async function toggle() {
    if (audioRef.current) {
      audioRef.current.source.stop();
      await audioRef.current.context.close();
      audioRef.current=null;
      setPlaying(false);
      return;
    }
    const context=new AudioContext();
    const buffer=context.createBuffer(2,context.sampleRate*8,context.sampleRate);
    for(let channel=0;channel<buffer.numberOfChannels;channel++) {
      const samples=buffer.getChannelData(channel);
      let last=0;
      for(let index=0;index<samples.length;index++) {
        last=(last+0.02*(Math.random()*2-1))/1.02;
        samples[index]=last*3.2;
      }
    }
    const source=context.createBufferSource();
    const gain=context.createGain();
    source.buffer=buffer;
    source.loop=true;
    gain.gain.value=0.3;
    source.connect(gain).connect(context.destination);
    source.start();
    audioRef.current={context,source};
    setPlaying(true);
  }

  return <button type="button" className={`ambient-noise-toggle ${playing?"active":""}`} aria-label={playing?"Parar brown noise":"Ativar brown noise"} title={playing?"Parar brown noise":"Ativar brown noise"} aria-pressed={playing} onClick={toggle}><span aria-hidden="true">♪</span></button>;
}
