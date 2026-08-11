export const dynamic = "force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{imageId:string}>}) {
  const {imageId}=await params;
  if (!/^\d{1,10}$/.test(imageId)) return new Response("Imagem inv\u00e1lida",{status:400});
  let upstream:Response;
  try {
    upstream=await fetch(`https://pho.rs/p/img/${imageId}/task`,{headers:{"user-agent":"TreinoFisicaXY/1.0 (public catalog image proxy)"},redirect:"follow"});
  } catch { return new Response("Imagem indispon\u00edvel",{status:502}); }
  const contentType=upstream.headers.get("content-type")||"";
  if (!upstream.ok || !contentType.toLowerCase().startsWith("image/")) return new Response("Imagem indispon\u00edvel",{status:upstream.status===404?404:502});
  return new Response(upstream.body,{headers:{"content-type":contentType,"cache-control":"public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000","x-content-type-options":"nosniff"}});
}
