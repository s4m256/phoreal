"use client";
import { useCallback, useEffect, useState } from "react";

export type Exam = { id:number; code:string; title:string; title_pt:string|null; year:number|null; series:string|null; source_url:string };
export type Problem = { id:number; exam_id:number; source_id:string; code:string; title:string; title_pt:string|null; kind:string; source_url:string; statement_url:string|null; solution_url:string|null; marking_scheme_url:string|null; statement_pdf_url:string|null; parts_status:string; statement_status:string; translation_status:"missing"|"draft"|"verified" };
export type Part = { id:number; problem_id:number; code:string; ordinal:number; score:number|null; prompt_text:string|null; prompt_text_pt:string|null; source_url:string };
export type Tag = { id:number; name:string; name_pt:string|null };
export type ProblemTag = { problem_id:number; tag_id:number };
export type Attempt = { id:string; problem_id:number; status:"in_progress"|"completed"; current_state:"initial_reading"|"item_active"|"paused"; active_part_id:number|null; started_at:string; finished_at:string|null };
export type Segment = { id:string; attempt_id:string; state:"initial_reading"|"item_active"; problem_part_id:number|null; started_at:string; ended_at:string|null; duration_seconds:number|null };
export type MockExam = { id:string; exam_id:number; date:string; type:"theoretical"|"experimental"; total_score:number; max_score:number; drive_url:string|null };
export type MockScore = { id:string; mock_exam_id:string; problem_id:number; score:number; max_score:number };
export type TrainingData = { competitions:unknown[]; exams:Exam[]; problems:Problem[]; problemParts:Part[]; tags:Tag[]; problemTags:ProblemTag[]; attempts:Attempt[]; timeSegments:Segment[]; mockExams:MockExam[]; mockExamProblemScores:MockScore[]; settings:{ tbf_date:string|null } };

export function useTrainingData() {
  const [data,setData]=useState<TrainingData|null>(null); const [error,setError]=useState<string|null>(null); const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{setLoading(true);try{const response=await fetch("/api/bootstrap",{cache:"no-store"});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Falha ao carregar");setData(payload);setError(null);}catch(e){setError(e instanceof Error?e.message:"Falha ao carregar");}finally{setLoading(false);}},[]);
  useEffect(()=>{const id=setTimeout(()=>void refresh(),0);return()=>clearTimeout(id);},[refresh]); return {data,error,loading,refresh};
}

export function useClock(period=1000){const [now,setNow]=useState(0);useEffect(()=>{const tick=()=>setNow(Date.now());const first=setTimeout(tick,0);const id=setInterval(tick,period);return()=>{clearTimeout(first);clearInterval(id)}},[period]);return now;}

export async function postJson(url:string, body:unknown){const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Não foi possível salvar");return payload;}
export function secondsFor(segment:Segment, now=Date.now()){if(segment.duration_seconds!=null)return Number(segment.duration_seconds);return Math.max(0,Math.floor((now-Date.parse(segment.started_at))/1000));}
export function formatTime(total:number){const seconds=Math.max(0,Math.floor(total));const h=Math.floor(seconds/3600);const m=Math.floor((seconds%3600)/60);const s=seconds%60;return h?`${h}h ${String(m).padStart(2,"0")}m`:`${m}:${String(s).padStart(2,"0")}`;}
export function formatHoursMinutes(total:number){const seconds=Math.max(0,Math.floor(total));const h=Math.floor(seconds/3600);const m=Math.floor((seconds%3600)/60);return h?`${h}h ${String(m).padStart(2,"0")}m`:`${m}m`;}
export function median(values:number[]){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
