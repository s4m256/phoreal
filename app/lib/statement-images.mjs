const PHORS_IMAGE = /^https:\/\/pho\.rs\/p\/img\/(\d+)\/task(?:\?[^"']*)?$/i;

export function proxyStatementImages(html) {
  return html.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,(match,prefix,quote,url) => {
    const found=url.match(PHORS_IMAGE);
    return found ? `${prefix}${quote}/api/problem-images/${found[1]}${quote}` : match;
  });
}
