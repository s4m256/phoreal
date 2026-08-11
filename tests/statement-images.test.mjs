import assert from "node:assert/strict";
import test from "node:test";
import { proxyStatementImages } from "../app/lib/statement-images.mjs";

test("routes only known pho.rs catalog images through the site",()=>{
  assert.equal(proxyStatementImages('<p><img src="https://pho.rs/p/img/3743/task"></p>'),'<p><img src="/api/problem-images/3743"></p>');
  assert.equal(proxyStatementImages("<img alt='x' src='https://pho.rs/p/img/16973/task'>"),"<img alt='x' src='/api/problem-images/16973'>");
  assert.equal(proxyStatementImages('<img src="https://example.com/image.jpg">'),'<img src="https://example.com/image.jpg">');
});
