import { notFound } from "next/navigation";
import taiwanCatalog from "../../../../../data/taiwan/catalog.json";
import { TaiwanProblemWorkspace } from "../../../../components/TaiwanProblemWorkspace";

export default async function TaiwanProblemPage({params}:{params:Promise<{volume:string;number:string}>}) {
  const {volume:volumeText,number:numberText}=await params;
  const volumeNumber=Number(volumeText),problemNumber=Number(numberText);
  const volume=taiwanCatalog.volumes.find((item)=>item.volume===volumeNumber);
  const problem=volume?.problems.find((item)=>item.id===problemNumber);
  if(!volume||!problem)notFound();
  return <TaiwanProblemWorkspace volume={volumeNumber} problem={problem} totalProblems={volume.problems.length}/>;
}
