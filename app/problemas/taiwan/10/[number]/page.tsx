import { notFound } from "next/navigation";
import taiwanVolume10 from "../../../../../data/taiwan/volume-10.json";
import { TaiwanProblemWorkspace } from "../../../../../app/components/TaiwanProblemWorkspace";

export default async function TaiwanProblemPage({params}:{params:Promise<{number:string}>}) {
  const {number}=await params;
  const problem=taiwanVolume10.problems.find((item)=>item.id===Number(number));
  if(!problem)notFound();
  return <TaiwanProblemWorkspace problem={problem} totalProblems={taiwanVolume10.problems.length}/>;
}
